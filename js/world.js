// js/world.js — terrain, biome definitions + applyBiome, obstacles (rocks/ice spires),
// launch pads, shards, decor trees, mountains, sun, snow particles, spray particles.
// Behavior-preserving extraction from the original single-file index.html.

import * as THREE from 'three';

window.Game = window.Game || {};

const LANE = 14;

const BIOMES = [
  { name: 'TWILIGHT PINES', icon: '✦', at: 0, sky: 0x1b1239, fog: 0x3d2b64, snow: 0xdde9ff, terrain: 0xbdccea, tree: 0x183e47, trunk: 0x4b3540, sun: 0xffd699, accent: 0x9ef7e5, rock: 0xbac5dd, threshold: 0 },
  { name: 'AURORA GLACIER', icon: '✦', at: 120, sky: 0x06253d, fog: 0x145a70, snow: 0xc5fcff, terrain: 0x7fcfd6, tree: 0x11546a, trunk: 0x173a5a, sun: 0x8fffdf, accent: 0x8dfff4, rock: 0xa4eaff, threshold: 120 },
  { name: 'WHITEOUT STORM', icon: '⚡', at: 300, sky: 0x27142f, fog: 0x7d6f9b, snow: 0xffffff, terrain: 0xdde1ef, tree: 0x4f5277, trunk: 0x263046, sun: 0xff9fce, accent: 0xffd0ef, rock: 0xf0eaff, threshold: 300 }
];
let biomeIndex = 0, activeBiome = BIOMES[0];

let scene, hemi, key, fill, sun, mountainMats;
const TER_W = 112, TER_L = 430;
let terGeo, terBase, terrainMat, terrain;
let rockGeo, rockMat, rockRimMat, treeMat, trunkMat, shardGeo, shardMat, padGeo, padMat, padStripeMat;
const obstacles = [], decor = [], shards = [], pads = [];

const terLowColor = new THREE.Color(), terHighColor = new THREE.Color();
const DETAIL_N = 40;
let detailMesh, detailMat;
const detailData = [];
const _detailDummy = new THREE.Object3D();

const SNOW_N = 450;
let snowGeo, snowMat, snowPos;
const SPRAY_N = 300;
let sprayGeo, sprayPos, sprayVel, sprayLife, sprayIdx = 0;

function groundH(x, z) {
  const dist = window.Game.state.dist;
  const s = z - dist;
  const storm = biomeIndex === 2 ? 1.25 : 1;
  return storm * (1.55 * Math.sin(s * .052) * Math.cos(x * .09) + .66 * Math.sin(x * .2 + s * .127) + .22 * Math.sin(x * .56 + s * .29));
}

function computeTerrainShades() {
  const base = new THREE.Color(activeBiome.terrain);
  const accent = new THREE.Color(activeBiome.accent);
  terLowColor.copy(base).multiplyScalar(.68);
  terHighColor.copy(base).lerp(accent, .22).multiplyScalar(1.18);
}

function updateDetailRocks() {
  if (!detailMesh) return;
  for (let i = 0; i < DETAIL_N; i++) {
    const d = detailData[i];
    _detailDummy.position.set(d.x, groundH(d.x, d.wz) - .1, d.wz);
    _detailDummy.scale.setScalar(d.s);
    _detailDummy.rotation.set(d.rx, d.ry, d.rz);
    _detailDummy.updateMatrix();
    detailMesh.setMatrixAt(i, _detailDummy.matrix);
  }
  detailMesh.instanceMatrix.needsUpdate = true;
}

function updateTerrain() {
  const p = terGeo.attributes.position;
  const c = terGeo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const x = terBase[i * 3], localY = terBase[i * 3 + 1], z = terrain.position.z - localY;
    const h = groundH(x, z);
    p.setZ(i, h);
    const t = THREE.MathUtils.clamp((h + 1.4) / 2.8, 0, 1);
    c.setXYZ(i,
      terLowColor.r + (terHighColor.r - terLowColor.r) * t,
      terLowColor.g + (terHighColor.g - terLowColor.g) * t,
      terLowColor.b + (terHighColor.b - terLowColor.b) * t);
  }
  p.needsUpdate = true;
  c.needsUpdate = true;
  terGeo.computeVertexNormals();
  updateDetailRocks();
}

function makeRock() {
  const g = new THREE.Group(), m = new THREE.Mesh(rockGeo, rockMat), rim = new THREE.Mesh(rockGeo, rockRimMat), s = .8 + Math.random() * 1.25;
  m.scale.set(s, s * (.7 + Math.random() * .5), s);
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  rim.scale.setScalar(1.055);
  m.add(rim);
  g.add(m);
  return { g, r: s + .35 };
}

function makeIceSpire() {
  const g = new THREE.Group(), m = new THREE.Mesh(new THREE.ConeGeometry(.8, 2.9, 5), shardMat);
  m.rotation.z = (Math.random() - .5) * .2;
  g.add(m);
  window.Game.vfx?.attachGlow(g, activeBiome.accent, 2.4, 1.6, .5);
  return { g, r: .92 };
}

function makeTree() {
  const g = new THREE.Group(), trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .25, 1.25, 5), trunkMat);
  trunk.position.y = .62;
  g.add(trunk);
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * .35, 1.7, 6), treeMat);
    cone.position.y = 1.45 + i * 1.03;
    g.add(cone);
  }
  const s = .8 + Math.random() * 1;
  g.scale.setScalar(s);
  return g;
}

function spawnObstacle(score) {
  const advanced = biomeIndex > 0 && Math.random() < .28 + biomeIndex * .15;
  const item = advanced ? makeIceSpire() : makeRock();
  let x = (Math.random() * 2 - 1) * LANE;
  const safeDropIn = score < 90 ? 3.8 : 0;
  while (Math.abs(x) < safeDropIn) x = (Math.random() * 2 - 1) * LANE;
  item.g.position.set(x, 0, -205);
  scene.add(item.g);
  obstacles.push({ mesh: item.g, x, z: -205, r: item.r });
}

function spawnDecor(z) {
  const side = Math.random() < .5 ? -1 : 1, x = side * (LANE + 5 + Math.random() * 25), t = makeTree();
  t.position.set(x, 0, z);
  scene.add(t);
  decor.push(t);
}

function spawnShard() {
  const m = new THREE.Mesh(shardGeo, shardMat), x = (Math.random() * 2 - 1) * (LANE - 2.2);
  m.position.set(x, 2.1, -202);
  window.Game.vfx?.attachGlow(m, activeBiome.accent, 2.1, 0, .8);
  scene.add(m);
  shards.push({ mesh: m, x, z: -202 });
}

function spawnPad() {
  const g = new THREE.Group(), pad = new THREE.Mesh(padGeo, padMat);
  g.add(pad);
  for (const z of [-.85, 0, .85]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.75, .04, .14), padStripeMat);
    stripe.position.set(0, .12, z);
    g.add(stripe);
  }
  window.Game.vfx?.attachGlow(g, 0x36e6ff, 3.4, .25, .55);
  const x = (Math.random() * 2 - 1) * (LANE - 3);
  g.position.set(x, 0, -205);
  scene.add(g);
  pads.push({ mesh: g, x, z: -205, used: false });
}

function emitSpray(x, y, z, n, spread, up) {
  for (let i = 0; i < n; i++) {
    const j = sprayIdx;
    sprayIdx = (sprayIdx + 1) % SPRAY_N;
    sprayPos[j * 3] = x + (Math.random() - .5) * .5;
    sprayPos[j * 3 + 1] = y;
    sprayPos[j * 3 + 2] = z + (Math.random() - .5) * .5;
    sprayVel[j * 3] = (Math.random() - .5) * spread;
    sprayVel[j * 3 + 1] = Math.random() * up;
    sprayVel[j * 3 + 2] = 2 + Math.random() * 3;
    sprayLife[j] = .5 + Math.random() * .45;
  }
}

let snowTime = 0;
function updateSnow(dt, isPlaying, speed) {
  snowTime += dt;
  // Per-biome character: TWILIGHT = gentle sideways drift, AURORA = shimmer/sparkle pulse,
  // STORM = dense fast diagonal wind-driven snow.
  const fall = biomeIndex === 2 ? 3.4 : biomeIndex === 1 ? 1 : 1.2;
  const fwdMul = biomeIndex === 2 ? 1.2 : 1;
  const wind = biomeIndex === 2 ? 6.5 : 0;
  const sway = biomeIndex === 0 ? .55 : biomeIndex === 1 ? .22 : 0;
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3 + 2] += (isPlaying ? speed * .85 * fwdMul : 4) * dt;
    snowPos[i * 3 + 1] -= dt * fall;
    snowPos[i * 3] += wind * dt + (sway ? Math.sin(snowTime * .8 + i) * sway * dt : 0);
    if (snowPos[i * 3 + 2] > 12 || snowPos[i * 3 + 1] < 0) {
      snowPos[i * 3] = (Math.random() * 2 - 1) * 35;
      snowPos[i * 3 + 1] = 6 + Math.random() * 12;
      snowPos[i * 3 + 2] = -154 - Math.random() * 12;
    }
  }
  snowGeo.attributes.position.needsUpdate = true;
  if (biomeIndex === 1) snowMat.size = .16 + Math.sin(snowTime * 3.4) * .045;
  else if (snowMat.size !== .16) snowMat.size = .16;
}

function updateSpray(dt) {
  for (let j = 0; j < SPRAY_N; j++) {
    if (sprayLife[j] <= 0) continue;
    sprayLife[j] -= dt;
    sprayVel[j * 3 + 1] -= 9 * dt;
    sprayPos[j * 3] += sprayVel[j * 3] * dt;
    sprayPos[j * 3 + 1] += sprayVel[j * 3 + 1] * dt;
    sprayPos[j * 3 + 2] += sprayVel[j * 3 + 2] * dt;
    if (sprayLife[j] <= 0) sprayPos[j * 3 + 1] = -999;
  }
  sprayGeo.attributes.position.needsUpdate = true;
}

function applyBiome(index, force = false) {
  if (index === biomeIndex && !force) return;
  biomeIndex = index;
  activeBiome = BIOMES[index];
  window.Game.world.biomeIndex = biomeIndex;
  window.Game.world.activeBiome = activeBiome;
  scene.background.set(activeBiome.sky);
  scene.fog.color.set(activeBiome.fog);
  terrainMat.color.set(activeBiome.terrain);
  treeMat.color.set(activeBiome.tree);
  trunkMat.color.set(activeBiome.trunk);
  rockMat.color.set(activeBiome.rock);
  shardMat.color.set(activeBiome.accent);
  shardMat.emissive.set(activeBiome.accent);
  snowMat.color.set(activeBiome.snow);
  sun.material.color.set(activeBiome.sun);
  hemi.color.set(activeBiome.accent);
  key.color.set(activeBiome.sun);
  computeTerrainShades();
  if (detailMat) detailMat.color.set(activeBiome.rock);
  window.Game.ui.setZone(window.Game.story.zoneLabel(activeBiome), '#' + activeBiome.accent.toString(16).padStart(6, '0'));
  if (!force) {
    window.Game.ui.announce(window.Game.story.zoneAnnounce(activeBiome));
    window.Game.audio.blip(520, .16, 'triangle', .14);
    setTimeout(() => window.Game.audio.blip(780, .2, 'triangle', .12), 90);
  }
  window.GameEvents.emit('biome:change', { index: biomeIndex, biome: activeBiome });
}

function init(sceneRef) {
  scene = sceneRef;
  scene.background = new THREE.Color(activeBiome.sky);
  scene.fog = new THREE.Fog(activeBiome.fog, 45, 235);

  hemi = new THREE.HemisphereLight(0x9686e7, 0x25374f, 1.25); scene.add(hemi);
  key = new THREE.DirectionalLight(0xffc385, 1.7); key.position.set(-60, 44, -90); scene.add(key);
  fill = new THREE.DirectionalLight(0x62d7ff, .35); fill.position.set(35, 16, 0); scene.add(fill);

  sun = new THREE.Mesh(new THREE.CircleGeometry(17, 36), new THREE.MeshBasicMaterial({ color: activeBiome.sun, fog: false }));
  sun.position.set(-55, 25, -280);
  scene.add(sun);

  mountainMats = [new THREE.MeshBasicMaterial({ color: 0x241b3d }), new THREE.MeshBasicMaterial({ color: 0x2e2351 })];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(28 + Math.random() * 46, 28 + Math.random() * 42, 5), mountainMats[i % 2]);
    m.position.set(-280 + i * 53 + Math.random() * 16, -5, -240 - Math.random() * 35);
    scene.add(m);
  }

  terGeo = new THREE.PlaneGeometry(TER_W, TER_L, 56, 110);
  terBase = terGeo.attributes.position.array.slice();
  terGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(terGeo.attributes.position.count * 3), 3));
  terrainMat = new THREE.MeshStandardMaterial({ color: activeBiome.terrain, vertexColors: true, flatShading: true, roughness: 1, metalness: .02 });
  terrain = new THREE.Mesh(terGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.z = -TER_L / 2 + 42;
  scene.add(terrain);
  computeTerrainShades();

  detailMat = new THREE.MeshStandardMaterial({ color: activeBiome.rock, flatShading: true, roughness: 1 });
  detailMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.34, 0), detailMat, DETAIL_N);
  detailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < DETAIL_N; i++) {
    const x = (Math.random() * 2 - 1) * (TER_W * .42);
    const localY = (Math.random() * 2 - 1) * (TER_L * .48);
    detailData.push({
      x, wz: terrain.position.z - localY, s: .5 + Math.random() * .8,
      rx: Math.random() * 3, ry: Math.random() * 3, rz: Math.random() * 3
    });
  }
  scene.add(detailMesh);

  rockGeo = new THREE.DodecahedronGeometry(1, 0);
  rockMat = new THREE.MeshStandardMaterial({ color: activeBiome.rock, flatShading: true, roughness: .9 });
  rockRimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: .2 });
  treeMat = new THREE.MeshStandardMaterial({ color: activeBiome.tree, flatShading: true, roughness: 1 });
  trunkMat = new THREE.MeshStandardMaterial({ color: activeBiome.trunk, flatShading: true });
  shardGeo = new THREE.OctahedronGeometry(.6, 0);
  shardMat = new THREE.MeshStandardMaterial({ color: activeBiome.accent, emissive: activeBiome.accent, emissiveIntensity: 1.7, flatShading: true, metalness: .35 });
  padGeo = new THREE.BoxGeometry(2.4, .18, 3.2);
  padMat = new THREE.MeshStandardMaterial({ color: 0x10243a, emissive: 0x36e6ff, emissiveIntensity: 1.7, roughness: .35, metalness: .25 });
  padStripeMat = new THREE.MeshBasicMaterial({ color: 0xffdc68 });

  for (let z = 18; z > -205; z -= 7) spawnDecor(z + Math.random() * 4);

  snowPos = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3] = (Math.random() * 2 - 1) * 35;
    snowPos[i * 3 + 1] = Math.random() * 18;
    snowPos[i * 3 + 2] = -160 * Math.random() + 12;
  }
  snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowMat = new THREE.PointsMaterial({ color: activeBiome.snow, size: .16, transparent: true, opacity: .75 });
  scene.add(new THREE.Points(snowGeo, snowMat));

  sprayPos = new Float32Array(SPRAY_N * 3).fill(-999);
  sprayVel = new Float32Array(SPRAY_N * 3);
  sprayLife = new Float32Array(SPRAY_N);
  sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  scene.add(new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xf8fdff, size: .32, transparent: true, opacity: .9 })));

  window.Game.world.biomeIndex = biomeIndex;
  window.Game.world.activeBiome = activeBiome;
}

window.Game.world = {
  BIOMES, LANE,
  biomeIndex, activeBiome,
  obstacles, decor, shards, pads,
  init, groundH, updateTerrain, applyBiome,
  spawnObstacle, spawnDecor, spawnShard, spawnPad,
  emitSpray, updateSnow, updateSpray,
  get sunPosition() { return sun.position; }
};
