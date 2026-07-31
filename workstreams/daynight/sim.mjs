// Verification harness for WS-DN. Mirrors the cycle math of js/daynight.js
// (constants copied verbatim) plus core.js's speed/score/biome model, so the
// time01 progression can be checked headlessly (js/daynight.js itself imports
// 'three' and can't run under bare node). Not shipped — lives outside js/.

const CYCLE_DISTANCE = 4200;
const ANCHORS = [0.27, 0.90, 0.74];
const ANCHOR_RATE = 0.5;
const ANCHOR_TAU = 9;
const TAU = Math.PI * 2;

const HEMI_MIN = 0.8, HEMI_NIGHT_MUL = 0.72, HEMI_DAY_MUL = 0.28;
const KEY_NIGHT_MUL = 0.30, KEY_DAY_MUL = 0.70;
const FILL_NIGHT_BOOST = 0.95;
const BASE_HEMI_I = 1.25, BASE_KEY_I = 1.7, BASE_FILL_I = 0.35;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function smoothstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * (3 - 2 * x);
}
function phaseFor(t) {
  if (t < 0.20 || t >= 0.84) return 'night';
  if (t < 0.32) return 'dawn';
  if (t < 0.70) return 'day';
  return 'dusk';
}
function shortestDelta(from, to) {
  let d = (to - from) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}
function metrics(t) {
  const sunHeight = Math.sin((t - 0.25) * TAU);
  const dayFactor = smoothstep(sunHeight, -0.18, 0.28);
  const nightFactor = 1 - dayFactor;
  const h = sunHeight > 0 ? Math.pow(sunHeight, 0.7) : 0;
  return {
    sunHeight, dayFactor, nightFactor,
    starScale: nightFactor * 1.18,
    hemi: Math.max(HEMI_MIN, BASE_HEMI_I * (HEMI_NIGHT_MUL + HEMI_DAY_MUL * h)),
    key: BASE_KEY_I * (KEY_NIGHT_MUL + KEY_DAY_MUL * h),
    fill: BASE_FILL_I * (1 + FILL_NIGHT_BOOST * nightFactor)
  };
}
const f3 = v => v.toFixed(3);
function line(tag, t, extra = '') {
  const m = metrics(t);
  console.log(`${tag.padEnd(34)} time01=${f3(t)} phase=${phaseFor(t).padEnd(5)} ` +
    `night=${f3(m.nightFactor)} hemi=${f3(m.hemi)} key=${f3(m.key)} fill=${f3(m.fill)}${extra}`);
}

// --- run simulation: expedition 1, no shards (combo 1), fixed 60fps -----------
const DT = 1 / 60;
let time01 = ANCHORS[0], anchorTarget = ANCHORS[0], anchorPull = 1;
let dist = 0, biome = 0;
const marks = [];

console.log('=== WS-DN day/night logic self-check ===');
line('t=0s  (game:start, biome 0)', time01);

for (let step = 1; step <= 60 * 60; step++) {
  const speed = Math.min(16 + dist / 88 + biome * 0.7, 48);
  dist += speed * DT;
  const score = Math.floor(dist * 0.52);
  const wanted = score >= 300 ? 2 : score >= 120 ? 1 : 0;
  if (wanted !== biome) {
    biome = wanted;
    anchorTarget = ANCHORS[biome];
    anchorPull = 1;
    marks.push([`t=${(step * DT).toFixed(1)}s biome->${biome} anchor=${ANCHORS[biome]}`, time01]);
  }
  time01 += speed * DT / CYCLE_DISTANCE;
  if (anchorPull > 0.002) {
    time01 += shortestDelta(time01, anchorTarget) * (1 - Math.exp(-ANCHOR_RATE * anchorPull * DT));
    anchorPull *= Math.exp(-DT / ANCHOR_TAU);
  } else anchorPull = 0;
  time01 -= Math.floor(time01);
  const s = step * DT;
  if (Math.abs(s - 15) < DT / 2 || Math.abs(s - 30) < DT / 2 || Math.abs(s - 45) < DT / 2) marks.push([`t=${s.toFixed(0)}s`, time01]);
}
for (const [tag, t] of marks) line(tag, t);
line('t=60s (end of simulated run)', time01, `  dist=${dist.toFixed(0)} score=${Math.floor(dist * 0.52)} biome=${biome}`);

// --- no-biome-change control: pure progression from the dawn anchor -----------
let t2 = ANCHORS[0], d2 = 0;
for (let step = 1; step <= 60 * 60; step++) {
  const speed = Math.min(16 + d2 / 88, 48);
  d2 += speed * DT;
  t2 = (t2 + speed * DT / CYCLE_DISTANCE) % 1;
}
line('t=60s (anchors disabled control)', t2, `  dist=${d2.toFixed(0)}`);

// --- fixed points ------------------------------------------------------------
console.log('--- anchors + extremes ---');
line('biome 0 anchor (dawn)', ANCHORS[0]);
line('biome 1 anchor (deep night)', ANCHORS[1]);
line('biome 2 anchor (burning dusk)', ANCHORS[2]);
line('deepest night (time01=0)', 0);
line('noon (time01=.5)', 0.5);
console.log('--- gates ---');
const auroraOk = metrics(ANCHORS[1]).nightFactor > 0.5;
const auroraNoon = metrics(0.5).nightFactor > 0.5;
console.log(`aurora gate (nightFactor>.5) at biome-1 anchor: ${auroraOk}  | at noon: ${auroraNoon}`);
let worstHemi = Infinity, worstKey = Infinity, worstFill = Infinity;
for (let i = 0; i < 1000; i++) {
  const m = metrics(i / 1000);
  worstHemi = Math.min(worstHemi, m.hemi);
  worstKey = Math.min(worstKey, m.key);
  worstFill = Math.min(worstFill, m.fill);
}
console.log(`readability floor over full cycle: hemi>=${f3(worstHemi)} (HEMI_MIN=${HEMI_MIN}), key>=${f3(worstKey)}, fill>=${f3(worstFill)}`);
console.log(`day baseline for comparison:       hemi=${f3(BASE_HEMI_I)} key=${f3(BASE_KEY_I)} fill=${f3(BASE_FILL_I)}`);
console.log(`star opacity at deepest night: min(.85, ${f3(0.72)} * ${f3(metrics(0).starScale)}) = ${f3(Math.min(0.85, 0.72 * metrics(0).starScale))}`);
console.log(`star opacity at noon:          min(.85, ${f3(0.72)} * ${f3(metrics(0.5).starScale)}) = ${f3(Math.min(0.85, 0.72 * metrics(0.5).starScale))}`);
console.log(`clamp sanity: ${clamp(2, 0, 1)}`);
