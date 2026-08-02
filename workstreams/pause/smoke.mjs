// workstreams/pause/smoke.mjs — zero-dependency headless CDP smoke test for
// the Pause/Resume feature. Boots a local static file server + headless
// Chrome, drives window.Game.core over the DevTools Protocol (raw WebSocket
// + fetch, no npm packages), and asserts the pause/resume acceptance
// criteria's observable behavior. Exits non-zero on any failed assertion;
// always tears down both child processes. Not shipped as game code.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const ASSET_PORT = 8391;
const CDP_PORT = 9391;
const BOOT_TIMEOUT_MS = 15000;

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.CHROME_PATH,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) { lastErr = e; }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${url}: ${lastErr}`);
}

async function waitForCondition(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return true;
    await sleep(150);
  }
  throw new Error('condition never became true (last=' + JSON.stringify(last) + ')');
}

let assetServer, chromeProc, ws, userDataDir;
let nextId = 1;
const pending = new Map();

function killAll() {
  try { ws?.close(); } catch (e) {}
  try { chromeProc?.kill('SIGKILL'); } catch (e) {}
  try { assetServer?.kill('SIGKILL'); } catch (e) {}
  try { if (userDataDir) rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expr) {
  const result = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: false,
  });
  if (result.exceptionDetails) {
    throw new Error('page threw evaluating `' + expr + '`: ' + JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`OK: ${msg}`);
  }
}

async function main() {
  // 1. Static asset server serving the repo root (index.html, css/, js/).
  assetServer = spawn('python3', ['-m', 'http.server', String(ASSET_PORT), '--bind', '127.0.0.1'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  await waitForHttp(`http://127.0.0.1:${ASSET_PORT}/index.html`, BOOT_TIMEOUT_MS);

  // 2. Headless Chrome with a fresh, disposable profile.
  const chromePath = findChrome();
  if (!chromePath) throw new Error('no Chrome/Chromium binary found on this machine (checked common paths + $CHROME_PATH)');
  userDataDir = mkdtempSync(join(tmpdir(), 'pause-smoke-'));
  chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--enable-unsafe-swiftshader',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, BOOT_TIMEOUT_MS);

  // 3. Open a tab pointed straight at the game (avoids a separate Page.navigate round trip).
  const gameUrl = `http://127.0.0.1:${ASSET_PORT}/index.html`;
  let target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${gameUrl}`, { method: 'PUT' });
  if (!target.ok) target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${gameUrl}`);
  const targetInfo = await target.json();
  const wsUrl = targetInfo.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('no webSocketDebuggerUrl from Chrome: ' + JSON.stringify(targetInfo));

  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  await send('Runtime.enable');

  // Wait for the module scripts (three.js renderer, core.js) to finish booting.
  await waitForCondition(() => evalJs('!!(window.Game && window.Game.core && window.Game.state && window.Game.audio)'), BOOT_TIMEOUT_MS);

  const STATE = await evalJs('window.Game.state.STATE');

  // --- 1. startGame reaches PLAYING and distance advances ---
  await evalJs('window.Game.core.startGame(); true');
  await sleep(500);
  let snap = await evalJs('({state: window.Game.state.state, dist: window.Game.state.dist})');
  assert(snap.state === STATE.PLAYING, `state is PLAYING after startGame (got ${snap.state})`);
  assert(snap.dist > 0, `dist advanced after startGame (got ${snap.dist})`);

  // --- 2. togglePause reaches PAUSED and distance stays frozen across a delay ---
  await evalJs('window.Game.core.togglePause(); true');
  snap = await evalJs('({state: window.Game.state.state, dist: window.Game.state.dist})');
  assert(snap.state === STATE.PAUSED, `state is PAUSED after togglePause (got ${snap.state})`);
  const distAtPause = snap.dist;
  await sleep(500);
  const distAfterWait = await evalJs('window.Game.state.dist');
  assert(distAfterWait === distAtPause, `dist frozen while paused (${distAtPause} -> ${distAfterWait})`);

  // --- 3. Space while PAUSED resumes PLAYING without resetting distance (no restart) ---
  await evalJs("window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); true");
  snap = await evalJs('({state: window.Game.state.state, dist: window.Game.state.dist})');
  assert(snap.state === STATE.PLAYING, `Space while PAUSED resumes to PLAYING (got ${snap.state})`);
  assert(snap.dist >= distAtPause, `Space resume did not reset dist (was ${distAtPause}, now ${snap.dist})`);

  // --- 4. distance advances again after resume ---
  await sleep(500);
  const distAfterResume = await evalJs('window.Game.state.dist');
  assert(distAfterResume > snap.dist, `dist advances again after resume (${snap.dist} -> ${distAfterResume})`);

  // --- 5. audio context is null or not running during pause ---
  await evalJs('window.Game.core.togglePause(); true');
  const pauseState = await evalJs('window.Game.state.state');
  assert(pauseState === STATE.PAUSED, `re-pause succeeded before audio check (got ${pauseState})`);
  const actxState = await evalJs('window.Game.audio.getContext()?.state ?? null');
  assert(actxState === null || actxState !== 'running', `AudioContext not running during pause (got ${actxState})`);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\nAll pause smoke assertions passed');
  }
}

main()
  .catch(err => {
    console.error('SMOKE TEST ERROR:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    killAll();
  });
