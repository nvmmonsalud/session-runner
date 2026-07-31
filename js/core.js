// js/core.js — state machine (MENU/PLAYING/GAME_OVER), game loop, input (keyboard + touch
// + mouse), scoring, combo/flow logic, spawn timers, collision, expedition rank logic,
// localStorage. Loads LAST and starts the loop.
// Behavior-preserving extraction from the original single-file index.html.

import * as THREE from 'three';

window.Game = window.Game || {};

const STATE = { MENU: 0, PLAYING: 1, GAME_OVER: 2 };
const LANE = 14;

let hiScore = 0, completedRuns = 0;
try {
  hiScore = +localStorage.getItem('sessionRunner3dHi') || 0;
  completedRuns = +localStorage.getItem('sessionRunner3dRuns') || 0;
} catch (e) {}
let expedition = 1 + Math.floor(completedRuns / 3);

window.Game.state = {
  STATE,
  state: STATE.MENU,
  hiScore, completedRuns, expedition,
  dist: 0, score: 0, styleScore: 0, speed: 16,
  spawnT: 0, shardT: 0, padT: 5.5, shake: 0, frame: 0,
  combo: 1, comboTimer: 0,
  airborne: false, airY: 0, airVy: 0, spin: 0, spinAbs: 0, trickTimer: 0, safeTimer: 0,
  player: { x: 0, vx: 0 },
  keys: {},
  touchX: null
};
const st = window.Game.state;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, .1, 620);
camera.position.set(0, 6.8, 11.8);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.Game.world.init(scene);
window.Game.rider.init(scene);
window.Game.ui.setOverlayText(window.Game.story.intro);

addEventListener('keydown', e => {
  st.keys[e.key] = true;
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'w', 'W'].includes(e.key)) e.preventDefault();
  if (e.key === ' ' && st.state !== STATE.PLAYING) startGame();
  if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && st.state === STATE.PLAYING) window.Game.rider.startJump(false);
});
addEventListener('keyup', e => st.keys[e.key] = false);
addEventListener('touchstart', e => {
  if (st.state !== STATE.PLAYING) { startGame(); return; }
  st.touchX = e.touches[0].clientX;
}, { passive: true });
addEventListener('touchmove', e => { st.touchX = e.touches[0].clientX; e.preventDefault(); }, { passive: false });
addEventListener('touchend', () => st.touchX = null);
addEventListener('mousedown', () => { if (st.state !== STATE.PLAYING) startGame(); });

function updateMeta() {
  const m = window.Game.story.metaText(st.hiScore, st.expedition, st.completedRuns);
  window.Game.ui.setMeta(m.best, m.meta, m.stats);
}

function startGame() {
  window.Game.audio.initAudio();
  const world = window.Game.world;
  for (const o of world.obstacles) scene.remove(o.mesh);
  for (const s of world.shards) scene.remove(s.mesh);
  for (const p of world.pads) scene.remove(p.mesh);
  world.obstacles.length = 0;
  world.shards.length = 0;
  world.pads.length = 0;

  st.dist = 0; st.score = 0; st.styleScore = 0;
  st.speed = 16 + (st.expedition - 1) * 2.3;
  st.spawnT = .95; st.shardT = 2.1; st.padT = 5.5; st.shake = 0;
  st.combo = 1; st.comboTimer = 0;
  st.airborne = false; st.airY = 0; st.airVy = 0; st.spin = 0; st.spinAbs = 0;
  st.trickTimer = 0; st.safeTimer = 0;
  window.Game.ui.hideTrick();
  st.player.x = 0; st.player.vx = 0;
  st.state = STATE.PLAYING;
  world.applyBiome(0, true);
  window.Game.ui.hideOverlay();
  updateMeta();
  window.Game.audio.blip(440, .14, 'triangle', .15);
  setTimeout(() => window.Game.audio.blip(660, .18, 'triangle', .15), 120);
  window.GameEvents.emit('game:start', {});
}

function wipeout() {
  st.state = STATE.GAME_OVER;
  const previousExpedition = st.expedition;
  st.completedRuns++;
  st.expedition = 1 + Math.floor(st.completedRuns / 3);
  try { localStorage.setItem('sessionRunner3dRuns', st.completedRuns); } catch (e) {}
  window.Game.audio.crash();
  st.shake = 1.05;
  window.Game.world.emitSpray(st.player.x, .9, 0, 96, 9, 6);
  const newBest = st.score > st.hiScore;
  if (newBest) {
    st.hiScore = st.score;
    try { localStorage.setItem('sessionRunner3dHi', st.hiScore); } catch (e) {}
  }
  const texts = window.Game.story.wipeoutText({
    expedition: st.expedition, previousExpedition, score: st.score, newBest, hiScore: st.hiScore, completedRuns: st.completedRuns
  });
  window.Game.ui.setOverlayText(texts);
  window.Game.ui.showOverlay();
  updateMeta();
  window.GameEvents.emit('game:over', {
    score: st.score, best: st.hiScore, newBest, expedition: st.expedition,
    expeditionUp: st.expedition > previousExpedition, completedRuns: st.completedRuns
  });
}

function update(dt) {
  st.frame++;
  window.Game.world.updateSnow(dt, st.state === STATE.PLAYING, st.speed);
  window.Game.world.updateSpray(dt);
  window.Game.ui.update(dt);
  window.Game.vfx?.update(dt);
  if (st.state !== STATE.PLAYING) return;

  st.safeTimer = Math.max(0, st.safeTimer - dt);
  st.dist += st.speed * dt;
  st.score = Math.floor(st.dist * .52 * st.combo) + st.styleScore;
  const world = window.Game.world;
  const wanted = Math.min(2, st.score >= 300 ? 2 : st.score >= 120 ? 1 : 0);
  world.applyBiome(wanted);
  st.speed = Math.min(16 + (st.expedition - 1) * 2.3 + st.dist / 88 + (world.biomeIndex * .7), 48 + (st.expedition - 1) * 2);
  world.updateTerrain();

  const accel = 43;
  if (st.keys.ArrowLeft || st.keys.a || st.keys.A) st.player.vx -= accel * dt;
  if (st.keys.ArrowRight || st.keys.d || st.keys.D) st.player.vx += accel * dt;
  if (st.touchX !== null) {
    const tx = (st.touchX / innerWidth * 2 - 1) * LANE * 1.4;
    st.player.vx += (tx - st.player.x) * 3.3 * dt;
  }
  st.player.vx *= Math.pow(.12, dt);
  st.player.vx = THREE.MathUtils.clamp(st.player.vx, -27, 27);
  st.player.x = THREE.MathUtils.clamp(st.player.x + st.player.vx * dt, -LANE, LANE);

  window.Game.rider.update(dt);

  if (st.comboTimer > 0) {
    st.comboTimer -= dt;
    if (st.comboTimer <= 0) { st.combo = 1; window.Game.ui.hideCombo(); }
  }

  st.spawnT -= dt;
  if (st.spawnT <= 0) {
    world.spawnObstacle(st.score);
    const pressure = 1 + (st.expedition - 1) * .18 + world.biomeIndex * .12;
    st.spawnT = Math.max(.94 - st.dist / 2500, .3) / pressure * (.78 + Math.random() * .42);
  }
  st.shardT -= dt;
  if (st.shardT <= 0) {
    world.spawnShard();
    st.shardT = 2.7 + Math.random() * 3.1 - world.biomeIndex * .35;
  }
  st.padT -= dt;
  if (st.padT <= 0) {
    world.spawnPad();
    st.padT = 8.5 + Math.random() * 5 - world.biomeIndex * .7;
  }
  if (st.frame % 5 === 0) world.spawnDecor(-205);

  const dz = st.speed * dt;

  for (let i = world.obstacles.length - 1; i >= 0; i--) {
    const o = world.obstacles[i];
    o.z += dz;
    o.mesh.position.z = o.z;
    o.mesh.position.y = world.groundH(o.x, o.z);
    o.mesh.rotation.y += dt * .35;
    if (o.z > 16) { scene.remove(o.mesh); world.obstacles.splice(i, 1); continue; }
    if (!st.airborne && st.safeTimer <= 0 && Math.abs(o.z) < 1.65 && Math.abs(o.x - st.player.x) < o.r + .55) { wipeout(); return; }
  }

  for (let i = world.shards.length - 1; i >= 0; i--) {
    const s = world.shards[i];
    s.z += dz;
    s.mesh.position.z = s.z;
    s.mesh.position.y = world.groundH(s.x, s.z) + 2.15;
    s.mesh.rotation.y += dt * 3;
    s.mesh.rotation.x += dt * 1.4;
    if (s.z > 16) { scene.remove(s.mesh); world.shards.splice(i, 1); continue; }
    if (Math.abs(s.z) < 2.2 && Math.abs(s.x - st.player.x) < 2.15) {
      scene.remove(s.mesh);
      world.shards.splice(i, 1);
      st.dist += 34;
      st.combo = Math.min(5, st.combo + 1);
      st.comboTimer = 5.2;
      window.Game.ui.setCombo(st.combo);
      window.Game.audio.blip(730 + st.combo * 110, .11, 'sine', .15);
      world.emitSpray(s.x, world.groundH(s.x, 0) + 1.6, 0, 26, 5, 4);
      window.GameEvents.emit('shard:collected', { combo: st.combo });
    }
  }

  for (let i = world.pads.length - 1; i >= 0; i--) {
    const p = world.pads[i];
    p.z += dz;
    p.mesh.position.z = p.z;
    p.mesh.position.y = world.groundH(p.x, p.z) + .08;
    if (p.z > 16) { scene.remove(p.mesh); world.pads.splice(i, 1); continue; }
    if (!p.used && Math.abs(p.z) < 1.8 && Math.abs(p.x - st.player.x) < 1.7) {
      p.used = true;
      window.Game.rider.startJump(true);
      window.GameEvents.emit('pad:hit', {});
    }
  }

  for (let i = world.decor.length - 1; i >= 0; i--) {
    const t = world.decor[i];
    t.position.z += dz;
    t.position.y = world.groundH(t.position.x, t.position.z) - .22;
    if (t.position.z > 20) { scene.remove(t); world.decor.splice(i, 1); }
  }

  const ry = world.groundH(st.player.x, 0);
  const cx = st.player.x * .54;
  camera.position.x += (cx - camera.position.x) * Math.min(dt * 5, 1);
  camera.position.y = 6.8 + ry * .6;
  if (st.shake > 0) {
    st.shake -= dt;
    camera.position.x += (Math.random() - .5) * st.shake * 1.4;
    camera.position.y += (Math.random() - .5) * st.shake * 1.4;
  }
  camera.lookAt(st.player.x * .77, 1.45 + ry * .5, -8);

  window.Game.ui.setScore(st.score);
  const speedPct = Math.round(100 * (st.speed - (16 + (st.expedition - 1) * 2.3)) / (34 + (st.expedition - 1) * 2));
  const speedColor = world.biomeIndex === 2 ? '#ffd0ef' : world.biomeIndex === 1 ? '#8dfff4' : '#91e8ff';
  window.Game.ui.setSpeedbar(speedPct, speedColor);
}

updateMeta();
window.Game.world.updateTerrain();
const clock = new THREE.Clock();
const juice = window.Game.juice;
function loop() {
  const dt = Math.min(clock.getDelta(), .05);
  if (!juice || !juice.hitstopUntil || performance.now() >= juice.hitstopUntil) update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.Game.core = { STATE, LANE, startGame, wipeout, updateMeta, getScene: () => scene, getCamera: () => camera, getRenderer: () => renderer };
