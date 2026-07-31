// js/vfx.js — graphics/juice layer: gradient sky dome + stars + sun glow, aurora ribbons,
// speed streak lines + camera FOV kick, procedural glow sprites (used by world.js for
// shards/pads/ice-spires), CSS vignette overlay, and a light trauma-based camera-shake polish.
// Loads AFTER js/core.js — scene/camera/renderer already exist on window.Game.core.
// Coordinates ONLY via window.Game.* and window.GameEvents, never imports other js/*.js files.

import * as THREE from 'three';

window.Game = window.Game || {};

const core = window.Game.core;
const scene = core.getScene();
const camera = core.getCamera();

const BASE_FOV = 61, MAX_FOV = 70;

// ---------------------------------------------------------------------------
// Procedural glow texture (radial gradient canvas) — shared by every glow sprite.
// ---------------------------------------------------------------------------
function makeGlowTexture() {
  const size = 128;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(.35, 'rgba(255,255,255,.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}
const glowTexture = makeGlowTexture();

function makeGlowSprite(color, size = 2, opacity = .85) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(size, size, 1);
  return spr;
}

function attachGlow(target, color, size = 2, yOffset = 0, opacity = .85) {
  const spr = makeGlowSprite(color, size, opacity);
  spr.position.y = yOffset;
  target.add(spr);
  return spr;
}

// ---------------------------------------------------------------------------
// Sky dome — big inverted sphere, vertex-colored top-to-horizon gradient per biome.
// ---------------------------------------------------------------------------
const SKY_RADIUS = 540;
const SKY_GRADIENTS = [
  { top: 0x0a0620, horizon: 0x4a2e78 }, // TWILIGHT PINES — purple dusk
  { top: 0x020e18, horizon: 0x17576e }, // AURORA GLACIER — teal ice night
  { top: 0x160a20, horizon: 0x6c4f86 }  // WHITEOUT STORM — violet storm
];
const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 28, 18);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
const skyDome = new THREE.Mesh(skyGeo, skyMat);
skyDome.renderOrder = -20;
scene.add(skyDome);

const _skyTop = new THREE.Color(), _skyHorizon = new THREE.Color(), _skyMix = new THREE.Color();
// Paints the dome from an explicit color pair — js/daynight.js drives this with its
// time-of-day blend; applyDomeColors() is the biome-only entry point on top of it.
function paintSky(topColor, horizonColor) {
  _skyTop.copy(topColor);
  _skyHorizon.copy(horizonColor);
  const pos = skyGeo.attributes.position;
  const col = skyGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / SKY_RADIUS + 1) / 2, 0, 1);
    _skyMix.copy(_skyHorizon).lerp(_skyTop, Math.pow(t, .55));
    col.setXYZ(i, _skyMix.r, _skyMix.g, _skyMix.b);
  }
  col.needsUpdate = true;
}
const _biomeTop = new THREE.Color(), _biomeHorizon = new THREE.Color();
function applyDomeColors(index) {
  const g = SKY_GRADIENTS[index] || SKY_GRADIENTS[0];
  paintSky(_biomeTop.set(g.top), _biomeHorizon.set(g.horizon));
}
applyDomeColors(0);

// ---------------------------------------------------------------------------
// Star field — visible/twinkling more in darker biomes, faint in Aurora (ribbons carry it).
// ---------------------------------------------------------------------------
const STAR_N = 260;
const starTarget = [.72, .38, .58];
let starGoal = starTarget[0];
const starPos = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) {
  const theta = Math.random() * Math.PI * 2;
  const h = Math.random();
  const y = 30 + h * h * 320;
  const r = Math.sqrt(Math.max(SKY_RADIUS * SKY_RADIUS * .9 - y * y, 0));
  starPos[i * 3] = r * Math.cos(theta);
  starPos[i * 3 + 1] = y;
  starPos[i * 3 + 2] = r * Math.sin(theta) - 60;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
const starPoints = new THREE.Points(starGeo, starMat);
starPoints.renderOrder = -19;
scene.add(starPoints);

// ---------------------------------------------------------------------------
// Sun glow — layered additive sprites around world.js's sun disc (fakes bloom).
// ---------------------------------------------------------------------------
const world = window.Game.world;
const sunGlowGroup = new THREE.Group();
sunGlowGroup.position.copy(world.sunPosition);
const sunGlowSprites = [];
for (const cfg of [{ s: 30, o: .5 }, { s: 58, o: .28 }, { s: 96, o: .13 }]) {
  const spr = makeGlowSprite(world.activeBiome.sun, cfg.s, cfg.o);
  sunGlowGroup.add(spr);
  sunGlowSprites.push(spr);
}
scene.add(sunGlowGroup);

// ---------------------------------------------------------------------------
// Aurora ribbons — 2-3 undulating additive strips, only visible in AURORA GLACIER (biome 1).
// ---------------------------------------------------------------------------
const RIBBON_SEGMENTS = 34;
const RIBBON_Z0 = -300, RIBBON_Z1 = 55;
function buildRibbon(colorA, colorB, seed, baseX, baseY, maxOpacity) {
  const segs = RIBBON_SEGMENTS;
  const positions = new Float32Array((segs + 1) * 2 * 3);
  const colors = new Float32Array((segs + 1) * 2 * 3);
  const indices = [];
  const cA = new THREE.Color(colorA), cB = new THREE.Color(colorB);
  for (let i = 0; i <= segs; i++) {
    const v0 = i * 2, v1 = i * 2 + 1;
    colors[v0 * 3] = cA.r; colors[v0 * 3 + 1] = cA.g; colors[v0 * 3 + 2] = cA.b;
    colors[v1 * 3] = cB.r; colors[v1 * 3 + 1] = cB.g; colors[v1 * 3 + 2] = cB.b;
    if (i < segs) indices.push(v0, v1, v0 + 2, v1, v1 + 2, v0 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false, fog: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.userData = { seed, baseX, baseY, maxOpacity };
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
const auroraRibbons = [
  buildRibbon(0x3affd0, 0xff9ce8, 1.3, -34, 78, .42),
  buildRibbon(0x66ffb0, 0x8dfff4, 4.7, 6, 92, .36),
  buildRibbon(0xa0ffe0, 0xff9ce8, 8.1, 42, 70, .3)
];

function updateAurora(t) {
  // Ribbons need darkness: gated on the biome AND js/daynight.js's night factor, so
  // they can never wash out over a bright daylight sky.
  const dn = window.Game.dayNight;
  const dark = dn ? dn.nightFactor : 1;
  const active = world.biomeIndex === 1 && dark > .5;
  const darkFade = THREE.MathUtils.smoothstep(dark, .5, .85);
  for (const mesh of auroraRibbons) {
    const target = active ? mesh.userData.maxOpacity * darkFade : 0;
    mesh.material.opacity += (target - mesh.material.opacity) * .05;
    if (mesh.material.opacity < .008 && !active) { mesh.visible = false; continue; }
    mesh.visible = true;
    const pos = mesh.geometry.attributes.position;
    const seed = mesh.userData.seed, baseX = mesh.userData.baseX, baseY = mesh.userData.baseY;
    for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
      const zt = i / RIBBON_SEGMENTS;
      const z = RIBBON_Z0 + zt * (RIBBON_Z1 - RIBBON_Z0);
      const wave = Math.sin(zt * 4.2 + t * .55 + seed) * 9 + Math.sin(zt * 2.1 - t * .32 + seed * 2) * 5;
      const x = baseX + wave;
      const thickness = 5 + Math.sin(zt * 6 + t * .8 + seed) * 2;
      const centerY = baseY + Math.sin(zt * 3 + t * .4 + seed) * 6;
      pos.setXYZ(i * 2, x, centerY - thickness, z);
      pos.setXYZ(i * 2 + 1, x, centerY + thickness, z);
    }
    pos.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Speed streaks — camera-local converging line segments, fade in with speed.
// ---------------------------------------------------------------------------
const STREAK_N = 26;
const streakPositions = new Float32Array(STREAK_N * 2 * 3);
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
const streakMat = new THREE.LineBasicMaterial({ color: 0xf3feff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const streaks = new THREE.LineSegments(streakGeo, streakMat);
streaks.frustumCulled = false;
camera.add(streaks);
if (!scene.children.includes(camera)) scene.add(camera);
const streakData = [];
for (let i = 0; i < STREAK_N; i++) {
  streakData.push({
    ang: Math.random() * Math.PI * 2,
    rad: 3.5 + Math.random() * 8.5,
    z: -40 - Math.random() * 140,
    len: 7 + Math.random() * 12,
    spd: .6 + Math.random() * .6
  });
}
// Classic arcade top-speed punch: streaks kick in earlier (.45 vs .55) and reach a
// bolder max opacity (.78 vs .5) so flat-out sections feel genuinely fast.
function updateStreaks(dt, speedFactor) {
  const target = speedFactor > .45 ? (speedFactor - .45) / .55 * .78 : 0;
  streakMat.opacity += (target - streakMat.opacity) * Math.min(1, dt * 6);
  const pos = streakGeo.attributes.position;
  for (let i = 0; i < STREAK_N; i++) {
    const d = streakData[i];
    if (streakMat.opacity > .008) {
      d.z += (30 + speedFactor * 75) * d.spd * dt;
      if (d.z > -3) d.z = -140 - Math.random() * 40;
    }
    const x = Math.cos(d.ang) * d.rad, y = Math.sin(d.ang) * d.rad * .58 + 1.4;
    pos.setXYZ(i * 2, x, y, d.z);
    pos.setXYZ(i * 2 + 1, x, y, d.z + d.len);
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Vignette — CSS radial-gradient overlay, created here (styled in css/style.css),
// intensity driven by speed.
// ---------------------------------------------------------------------------
const vignette = document.createElement('div');
vignette.id = 'vfxVignette';
const hudEl = document.querySelector('#hud');
if (hudEl && hudEl.parentNode) hudEl.parentNode.insertBefore(vignette, hudEl);
else document.body.appendChild(vignette);

function updateVignette(speedFactor) {
  vignette.style.opacity = (.24 + speedFactor * .26).toFixed(3);
}

// ---------------------------------------------------------------------------
// Trauma-based camera-shake polish — a subtle *additional* smoothed offset layered
// on top of core.js's own raw shake jitter (which is left untouched).
// ---------------------------------------------------------------------------
const shakeSeed = Math.random() * 1000;
function applyShakePolish(tAccum) {
  const state = window.Game.state;
  if (state.state !== state.STATE.PLAYING) return;
  const trauma = Math.min(1, state.shake || 0);
  if (trauma <= 0) return;
  const mag = trauma * trauma * .3;
  camera.position.x += (Math.sin(tAccum * 37 + shakeSeed) + Math.sin(tAccum * 53 + shakeSeed * 1.7)) * .45 * mag;
  camera.position.y += (Math.sin(tAccum * 41 + shakeSeed * 2.3) + Math.sin(tAccum * 29 + shakeSeed * .6)) * .45 * mag;
}

// ---------------------------------------------------------------------------
// Biome-driven color updates (sun glow, sky dome, star target) — cheap, only on change.
// ---------------------------------------------------------------------------
window.GameEvents.on('biome:change', ({ index, biome }) => {
  applyDomeColors(index);
  starGoal = starTarget[index] ?? starTarget[0];
  for (const spr of sunGlowSprites) spr.material.color.set(biome.sun);
});

// ---------------------------------------------------------------------------
// Main update — called once per frame from core.js via `window.Game.vfx.update(dt)`.
// ---------------------------------------------------------------------------
let tAccum = 0;
function update(dt) {
  tAccum += dt;
  window.Game.dayNight?.update(dt);
  const state = window.Game.state;
  const speed = state.speed || 16;
  const speedFactor = THREE.MathUtils.clamp((speed - 16) / 40, 0, 1);

  // FOV kick
  const targetFov = BASE_FOV + speedFactor * (MAX_FOV - BASE_FOV);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3.2);
  camera.updateProjectionMatrix();

  // Stars twinkle — per-biome target scaled by time-of-day darkness (0 by day).
  const dn = window.Game.dayNight;
  const starAim = dn ? Math.min(.85, starGoal * dn.starScale) : starGoal;
  starMat.opacity += (starAim - starMat.opacity) * Math.min(1, dt * 2);
  starMat.size = 1.7 + Math.sin(tAccum * 2.2) * .35;

  updateAurora(tAccum);
  updateStreaks(dt, speedFactor);
  updateVignette(speedFactor);
  applyShakePolish(tAccum);
}

window.Game.vfx = {
  update, makeGlowSprite, attachGlow,
  // Sky/star/sun handles consumed by js/daynight.js (loaded after this file).
  paintSky,
  skyGradientFor: (index) => SKY_GRADIENTS[index] || SKY_GRADIENTS[0],
  get starMaterial() { return starMat; },
  get sunGlowGroup() { return sunGlowGroup; },
  get sunGlowSprites() { return sunGlowSprites; }
};
