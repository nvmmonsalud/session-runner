// js/daynight.js — progression-paired day/night cycle.
// Owns a normalized time-of-day (`time01` ∈ [0,1), 0 = midnight, .25 = sunrise,
// .5 = noon, .75 = sunset) that advances with run progression and eases toward a
// per-biome anchor window on `biome:change`. Every frame it modulates — never
// replaces — the palette applyBiome() installed: sun/moon arc, key/hemi/fill
// lights, sky-dome gradient, star opacity, fog and scene background.
//
// Loads LAST (after js/vfx.js): scene/camera live on window.Game.core, the sky
// dome + stars + sun glow live on window.Game.vfx, the lights + sun disc on
// window.Game.world. Coordinates ONLY via window.Game.* / window.GameEvents.
//
// Public API — window.Game.dayNight:
//   time01      number  0..1 normalized time of day
//   phase       string  'dawn' | 'day' | 'dusk' | 'night'
//   nightFactor number  0 (full day) .. 1 (deep night)   ← consumed by vfx.js
//   dayFactor   number  1 - nightFactor
//   sunHeight   number  -1..1 sine of the sun above the horizon
//   starScale   number  multiplier for vfx.js's per-biome star target
//   update(dt)  advance + apply (called once per frame from vfx.js update)
//   setTime(t)  jump the cycle to an absolute time01 (debug / spot-check)

import * as THREE from 'three';

window.Game = window.Game || {};

const core = window.Game.core;
const world = window.Game.world;
const vfx = window.Game.vfx;
const scene = core.getScene();

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

// ---------------------------------------------------------------------------
// Pacing. `time01` advances with distance travelled while PLAYING (so one long
// run walks a full cycle) and with a slow wall-clock drift on the menu.
// ---------------------------------------------------------------------------
const CYCLE_DISTANCE = 4200;    // world units per full 24h cycle while riding
const MENU_CYCLE_SECONDS = 300; // ambient drift when not playing

// Per-biome anchor time-of-day: 0 TWILIGHT PINES = dawn→morning,
// 1 AURORA GLACIER = deep night (aurora needs darkness), 2 WHITEOUT STORM = burning dusk.
const ANCHORS = [0.27, 0.90, 0.74];
const ANCHOR_RATE = 0.5;  // approach speed (per second) at full pull
const ANCHOR_TAU = 9;     // pull decays e^(-t/TAU): ~10s cinematic sky shift, then free-running

// ---------------------------------------------------------------------------
// Readability floors — gameplay never dips below "clearly distinguishable".
// ---------------------------------------------------------------------------
const HEMI_MIN = 0.8;        // hard floor on hemisphere intensity (base is 1.25)
const HEMI_NIGHT_MUL = 0.72; // fraction of base hemi intensity at sun-below-horizon
const HEMI_DAY_MUL = 0.28;   // added back linearly with sun height^.7
const KEY_NIGHT_MUL = 0.30;  // moonlight floor for the key light
const KEY_DAY_MUL = 0.70;
const FILL_NIGHT_BOOST = 0.95; // rim/fill light brightens at night to keep silhouettes

// Tint strengths — how far time-of-day pulls the biome palette.
const KEY_TINT = 0.62;
const HEMI_TINT = 0.5;
const SKY_BIOME_TINT = 0.42;

const SUN_ARC_X = 175, SUN_ARC_Y = 112, SUN_Y0 = 6, SUN_Z = -280;
const SKY_REPAINT_EVERY = 4;   // dome vertex-color repaint throttle (frames)
const SKY_REPAINT_EPS = 0.004; // ...and only when the blended pair actually moved

// ---------------------------------------------------------------------------
// Keyframes. Every hex is pre-baked into a THREE.Color at load; sampling writes
// into caller-supplied scratch colors so the hot loop never allocates.
// ---------------------------------------------------------------------------
const SKY_KEYS = [
  { t: 0.00, top: 0x03030e, hor: 0x0d1430 }, // midnight
  { t: 0.20, top: 0x131a44, hor: 0x40305f }, // last dark
  { t: 0.27, top: 0x27357e, hor: 0xff9a5a }, // dawn burn
  { t: 0.34, top: 0x2f63b4, hor: 0xf7c58e }, // morning
  { t: 0.50, top: 0x2f7ad6, hor: 0xbfe0f5 }, // noon
  { t: 0.66, top: 0x2f63b4, hor: 0xe8c193 }, // afternoon
  { t: 0.74, top: 0x3b2a6e, hor: 0xff7a4a }, // burning dusk
  { t: 0.82, top: 0x181545, hor: 0x5c2f6b }, // twilight
  { t: 0.90, top: 0x060615, hor: 0x131c3f }, // night
  { t: 1.00, top: 0x03030e, hor: 0x0d1430 }
];
const KEY_KEYS = [
  { t: 0.00, c: 0xaaccff }, // cool moonlight
  { t: 0.24, c: 0xff9a5a }, // dawn
  { t: 0.36, c: 0xffd9a6 },
  { t: 0.50, c: 0xffe0a0 }, // midday
  { t: 0.66, c: 0xffd08a },
  { t: 0.76, c: 0xff9a5a }, // dusk
  { t: 0.86, c: 0xaaccff },
  { t: 1.00, c: 0xaaccff }
];
const AMB_KEYS = [
  { t: 0.00, c: 0x8fa8e0 },
  { t: 0.27, c: 0xffb27a },
  { t: 0.50, c: 0xfff2d0 },
  { t: 0.74, c: 0xff9a5a },
  { t: 0.88, c: 0x8fa8e0 },
  { t: 1.00, c: 0x8fa8e0 }
];

const skyTopColors = SKY_KEYS.map(k => new THREE.Color(k.top));
const skyHorColors = SKY_KEYS.map(k => new THREE.Color(k.hor));
const keyColors = KEY_KEYS.map(k => new THREE.Color(k.c));
const ambColors = AMB_KEYS.map(k => new THREE.Color(k.c));

const MOON_C = new THREE.Color(0xbcd8ff);
const GROUND_DAY_C = new THREE.Color(0x50627e);
const FOG_DAY_C = new THREE.Color(0xcfe4f5);
const FOG_NIGHT_C = new THREE.Color(0x0b1030);
const BG_DAY_C = new THREE.Color(0x8fc0e8);

function segIndex(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  return i;
}
function segBlend(keys, i, t) {
  const a = keys[i].t, b = keys[i + 1].t;
  const u = b === a ? 0 : clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u); // smoothstep — no banding between keyframes
}
function sampleColor(keys, colors, t, out) {
  const i = segIndex(keys, t);
  return out.lerpColors(colors[i], colors[i + 1], segBlend(keys, i, t));
}

// ---------------------------------------------------------------------------
// Scene handles. world.js exposes `lights` / `sunMesh` getters; if a future
// refactor drops them we fall back to walking the scene graph once at load.
// ---------------------------------------------------------------------------
function resolveLights() {
  const l = world.lights;
  if (l && l.hemi && l.key && l.fill) return l;
  const found = { hemi: null, key: null, fill: null };
  const dirs = [];
  scene.traverse(o => {
    if (o.isHemisphereLight && !found.hemi) found.hemi = o;
    else if (o.isDirectionalLight) dirs.push(o);
  });
  dirs.sort((a, b) => b.intensity - a.intensity);
  found.key = dirs[0] || null;
  found.fill = dirs[1] || dirs[0] || null;
  return found;
}
function resolveSunMesh() {
  if (world.sunMesh) return world.sunMesh;
  let found = null;
  scene.traverse(o => {
    if (!found && o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry') found = o;
  });
  return found;
}

const lights = resolveLights();
const sunMesh = resolveSunMesh();
const sunGlowGroup = vfx && vfx.sunGlowGroup ? vfx.sunGlowGroup : null;
const sunGlowSprites = vfx && vfx.sunGlowSprites ? vfx.sunGlowSprites : null;

const BASE_HEMI_I = lights.hemi ? lights.hemi.intensity : 1.25;
const BASE_KEY_I = lights.key ? lights.key.intensity : 1.7;
const BASE_FILL_I = lights.fill ? lights.fill.intensity : 0.35;
const INIT_GROUND_C = new THREE.Color(lights.hemi ? lights.hemi.groundColor.getHex() : 0x25374f);
const BASE_FILL_C = new THREE.Color(lights.fill ? lights.fill.color.getHex() : 0x62d7ff);

// ---------------------------------------------------------------------------
// Biome base palette — captured whenever applyBiome() fires so we always
// modulate the *current* biome colors instead of fighting them.
// ---------------------------------------------------------------------------
const _baseAccent = new THREE.Color();
const _baseSun = new THREE.Color();
const _baseGround = new THREE.Color();
const _dayFog = new THREE.Color();
const _nightFog = new THREE.Color();
const _dayBg = new THREE.Color();
const _nightBg = new THREE.Color();
const _baseSkyTop = new THREE.Color();
const _baseSkyHor = new THREE.Color();

// Per-frame scratch — mutated in place, never re-allocated.
const _keySample = new THREE.Color();
const _ambSample = new THREE.Color();
const _domeTop = new THREE.Color();
const _domeHor = new THREE.Color();
const _lastTop = new THREE.Color(-1, -1, -1);
const _lastHor = new THREE.Color(-1, -1, -1);

function captureBiome(index, biome) {
  const b = biome || world.activeBiome;
  if (!b) return;
  _baseAccent.set(b.accent);
  _baseSun.set(b.sun);
  if (b.ground !== undefined) _baseGround.set(b.ground); else _baseGround.copy(INIT_GROUND_C);

  _dayFog.set(b.fog).lerp(FOG_DAY_C, 0.4);
  _nightFog.set(b.fog).multiplyScalar(0.45).lerp(FOG_NIGHT_C, 0.35);

  _dayBg.set(b.sky).lerp(BG_DAY_C, 0.45);
  _nightBg.set(b.sky).multiplyScalar(0.5);

  const g = vfx && vfx.skyGradientFor ? vfx.skyGradientFor(index) : null;
  _baseSkyTop.set(g ? g.top : b.sky);
  _baseSkyHor.set(g ? g.horizon : b.fog);
}

// ---------------------------------------------------------------------------
// Cycle state.
// ---------------------------------------------------------------------------
let time01 = ANCHORS[0];
let anchorTarget = ANCHORS[0];
let anchorPull = 0;
let sunHeight = 0, dayFactor = 1, nightFactor = 0, starScale = 0;
let phase = 'dawn';
let frame = 0;

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

// ---------------------------------------------------------------------------
// Tiny HUD phase readout — built here (like vfx.js's vignette) with inline
// styles so it never collides with css/style.css edits.
// ---------------------------------------------------------------------------
const PHASE_LABEL = { dawn: '◔ DAWN', day: '☀ DAY', dusk: '◕ DUSK', night: '☾ NIGHT' };
const PHASE_COLOR = { dawn: '#ffc79a', day: '#ffe9b8', dusk: '#ff9ec4', night: '#9fc4ff' };
const phaseEl = document.createElement('div');
phaseEl.id = 'dnPhase';
phaseEl.style.cssText = 'position:absolute;top:40px;right:20px;font-size:10px;font-weight:800;' +
  'letter-spacing:.14em;opacity:.72;white-space:nowrap;pointer-events:none;';
const hudRoot = document.querySelector('#hud');
if (hudRoot) hudRoot.appendChild(phaseEl);

function paintPhaseLabel() {
  phaseEl.textContent = PHASE_LABEL[phase];
  phaseEl.style.color = PHASE_COLOR[phase];
}

// ---------------------------------------------------------------------------
// Apply — one pass of every time-of-day driven lerp.
// ---------------------------------------------------------------------------
function apply() {
  const a = (time01 - 0.25) * TAU;
  const sinA = Math.sin(a), cosA = Math.cos(a);
  sunHeight = sinA;
  dayFactor = smoothstep(sunHeight, -0.18, 0.28);
  nightFactor = 1 - dayFactor;
  starScale = nightFactor * 1.18; // vfx.js clamps the product at .85
  const h = sunHeight > 0 ? Math.pow(sunHeight, 0.7) : 0;

  const nextPhase = phaseFor(time01);
  if (nextPhase !== phase) { phase = nextPhase; paintPhaseLabel(); }

  sampleColor(KEY_KEYS, keyColors, time01, _keySample);
  sampleColor(AMB_KEYS, ambColors, time01, _ambSample);

  // --- sun disc + its additive glow ride the arc together ---
  if (sunMesh) {
    sunMesh.position.set(-cosA * SUN_ARC_X, SUN_Y0 + sinA * SUN_ARC_Y, SUN_Z);
    if (sunMesh.material && sunMesh.material.color) {
      sunMesh.material.color.copy(_baseSun).lerp(_keySample, 0.45);
      if (sunGlowSprites) {
        for (let i = 0; i < sunGlowSprites.length; i++) sunGlowSprites[i].material.color.copy(sunMesh.material.color);
      }
    }
    if (sunGlowGroup) sunGlowGroup.position.copy(sunMesh.position);
  }

  // --- key light: follows the sun, warm by day, cool moonlight at night ---
  if (lights.key) {
    lights.key.position.set(-cosA * 62, 8 + h * 46, -90);
    lights.key.color.copy(_baseSun).lerp(_keySample, KEY_TINT);
    lights.key.intensity = BASE_KEY_I * (KEY_NIGHT_MUL + KEY_DAY_MUL * h);
  }

  // --- hemisphere ambient: hard readability floor ---
  if (lights.hemi) {
    lights.hemi.color.copy(_baseAccent).lerp(_ambSample, HEMI_TINT);
    lights.hemi.groundColor.copy(_baseGround).lerp(GROUND_DAY_C, h * 0.6);
    lights.hemi.intensity = Math.max(HEMI_MIN, BASE_HEMI_I * (HEMI_NIGHT_MUL + HEMI_DAY_MUL * h));
  }

  // --- fill/rim: brightens at night so the rider + obstacles keep a silhouette ---
  if (lights.fill) {
    lights.fill.color.copy(BASE_FILL_C).lerp(MOON_C, nightFactor * 0.55);
    lights.fill.intensity = BASE_FILL_I * (1 + FILL_NIGHT_BOOST * nightFactor);
  }

  // --- fog + background ---
  if (scene.fog && scene.fog.color) scene.fog.color.lerpColors(_nightFog, _dayFog, dayFactor);
  if (scene.background && scene.background.isColor) scene.background.lerpColors(_nightBg, _dayBg, dayFactor);

  // --- sky dome gradient: time-of-day pair tinted back toward the biome pair ---
  const si = segIndex(SKY_KEYS, time01);
  const su = segBlend(SKY_KEYS, si, time01);
  _domeTop.lerpColors(skyTopColors[si], skyTopColors[si + 1], su).lerp(_baseSkyTop, SKY_BIOME_TINT);
  _domeHor.lerpColors(skyHorColors[si], skyHorColors[si + 1], su).lerp(_baseSkyHor, SKY_BIOME_TINT);
  if (frame % SKY_REPAINT_EVERY === 0 && vfx && vfx.paintSky) {
    const moved =
      Math.abs(_domeTop.r - _lastTop.r) + Math.abs(_domeTop.g - _lastTop.g) + Math.abs(_domeTop.b - _lastTop.b) +
      Math.abs(_domeHor.r - _lastHor.r) + Math.abs(_domeHor.g - _lastHor.g) + Math.abs(_domeHor.b - _lastHor.b);
    if (moved > SKY_REPAINT_EPS) {
      vfx.paintSky(_domeTop, _domeHor);
      _lastTop.copy(_domeTop);
      _lastHor.copy(_domeHor);
    }
  }
  frame++;
}

// ---------------------------------------------------------------------------
// Update — called once per frame from vfx.js's update(dt).
// ---------------------------------------------------------------------------
function update(dt) {
  const d = dt > 0 ? Math.min(dt, 0.05) : 0;
  const st = window.Game.state;
  const playing = !!st && st.state === st.STATE.PLAYING;

  if (d > 0) {
    if (playing) time01 += (st.speed || 16) * d / CYCLE_DISTANCE;
    else time01 += d / MENU_CYCLE_SECONDS;

    if (anchorPull > 0.002) {
      time01 += shortestDelta(time01, anchorTarget) * (1 - Math.exp(-ANCHOR_RATE * anchorPull * d));
      anchorPull *= Math.exp(-d / ANCHOR_TAU);
    } else {
      anchorPull = 0;
    }
    time01 -= Math.floor(time01);
  }
  apply();
}

function setTime(t) {
  time01 = t - Math.floor(t);
  anchorPull = 0;
  apply();
}

// ---------------------------------------------------------------------------
// Wiring.
// ---------------------------------------------------------------------------
window.GameEvents.on('biome:change', ({ index, biome }) => {
  captureBiome(index, biome);
  anchorTarget = ANCHORS[index] !== undefined ? ANCHORS[index] : ANCHORS[0];
  anchorPull = 1;
});

window.GameEvents.on('game:start', () => {
  time01 = ANCHORS[0];
  anchorTarget = ANCHORS[0];
  anchorPull = 1;
});

captureBiome(world.biomeIndex || 0, world.activeBiome);
phase = phaseFor(time01);
paintPhaseLabel();
apply();

window.Game.dayNight = {
  update, setTime,
  ANCHORS, CYCLE_DISTANCE, HEMI_MIN,
  get time01() { return time01; },
  get phase() { return phase; },
  get nightFactor() { return nightFactor; },
  get dayFactor() { return dayFactor; },
  get sunHeight() { return sunHeight; },
  get starScale() { return starScale; }
};
