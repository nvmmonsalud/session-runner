// js/rider.js — rider rig construction (board, limbs, torso, head, scarf, materials),
// carve lean animation, jump/spin trick logic (startJump, landTrick, trickLabel), landing.
// Behavior-preserving extraction from the original single-file index.html.

import * as THREE from 'three';

window.Game = window.Game || {};

let rider, riderRig, board, torso, head, armL, armR, scarf;
let sceneRef, helmetStripeMat;

// Springy scarf follow-through: each segment chases the one before it with a
// critically-under-damped spring, reacting to lateral speed (vx) and airtime (airY).
const SCARF_N = 4;
const scarfSegs = [];

// Board glow trail — pooled fading quads, accent-colored per biome.
const TRAIL_N = 22;
const trailPool = [];
let trailAccum = 0, trailColor = 0x3af4dc;

// Carve tracks — pooled fading dark decals left in the snow where the rider carves.
const CARVE_N = 46;
const carvePool = [];
let carveAccum = 0, carveColor = 0x1b2740;

function limb(radius, length, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .88, length, 6), mat);
}

function initTrailPool() {
  const geo = new THREE.PlaneGeometry(1.15, .5);
  for (let i = 0; i < TRAIL_N; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: trailColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    sceneRef.add(mesh);
    trailPool.push({ mesh, life: 0, maxLife: .5 });
  }
}

function initCarvePool() {
  const geo = new THREE.PlaneGeometry(1.5, 2.1);
  for (let i = 0; i < CARVE_N; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: carveColor, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    sceneRef.add(mesh);
    carvePool.push({ mesh, life: 0, maxLife: 2.2 });
  }
}

function init(scene) {
  sceneRef = scene;
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0xff5d78, roughness: .65, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x20233b, roughness: .8, flatShading: true });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xffd7a0, roughness: .8, flatShading: true });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xeee8ff, roughness: .45, flatShading: true });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0x061c31, emissive: 0x51edff, emissiveIntensity: .7, metalness: .75, roughness: .15 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xffbc4d, roughness: .48, flatShading: true });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x3af4dc });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xffd04f, roughness: .75, flatShading: true });
  helmetStripeMat = new THREE.MeshStandardMaterial({ color: 0x111522, emissive: 0x3af4dc, emissiveIntensity: 1.5, roughness: .3, metalness: .4 });

  rider = new THREE.Group();
  riderRig = new THREE.Group();
  rider.add(riderRig);
  scene.add(rider);

  board = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, .12, 2.8), boardMat);
  deck.position.y = .12;
  board.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.18, .135, .24), stripeMat);
  stripe.position.set(0, .17, .1);
  board.add(stripe);
  riderRig.add(board);

  const legL = new THREE.Group(), legR = new THREE.Group();
  const l1 = limb(.16, .72, darkMat), l2 = limb(.16, .72, darkMat);
  l1.position.y = -.36; l2.position.y = -.36;
  legL.add(l1); legR.add(l2);
  legL.position.set(-.27, .87, .26); legR.position.set(.27, .87, -.26);
  legL.rotation.z = .23; legR.rotation.z = -.23;
  riderRig.add(legL, legR);

  for (const x of [-.29, .29]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(.36, .2, .64), darkMat);
    boot.position.set(x, .3, x < 0 ? .32 : -.32);
    riderRig.add(boot);
  }

  torso = new THREE.Mesh(new THREE.CapsuleGeometry(.43, .88, 4, 8), jacketMat);
  torso.position.y = 1.53;
  riderRig.add(torso);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(.54, .62, .22), darkMat);
  pack.position.set(0, 1.56, .38);
  riderRig.add(pack);

  head = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 7), helmetMat);
  helmet.scale.y = .88;
  head.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.57, .16, .08), goggleMat);
  visor.position.set(0, .03, -.31);
  head.add(visor);
  const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(.1, .34, .62), helmetStripeMat);
  helmetStripe.position.set(0, .12, 0);
  head.add(helmetStripe);
  head.position.y = 2.35;
  riderRig.add(head);

  armL = new THREE.Group(); armR = new THREE.Group();
  const al = limb(.13, .75, jacketMat), ar = limb(.13, .75, jacketMat);
  al.position.y = -.36; ar.position.y = -.36;
  armL.add(al); armR.add(ar);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(.15, 6, 5), gloveMat), handR = handL.clone();
  handL.position.y = -.78; handR.position.y = -.78;
  armL.add(handL); armR.add(handR);
  armL.position.set(-.49, 1.83, 0); armR.position.set(.49, 1.83, 0);
  armL.rotation.z = .54; armR.rotation.z = -.54;
  riderRig.add(armL, armR);

  scarf = new THREE.Group();
  for (let i = 0; i < SCARF_N; i++) {
    const bit = new THREE.Mesh(new THREE.BoxGeometry(.15, .12, .54), scarfMat);
    bit.position.set(0, 2.16, .32 + i * .38);
    bit.rotation.x = .15 * i;
    scarf.add(bit);
    scarfSegs.push({ mesh: bit, angX: .15 * i, velX: 0, angZ: 0, velZ: 0 });
  }
  riderRig.add(scarf);

  initTrailPool();
  initCarvePool();

  window.GameEvents.on('biome:change', ({ biome }) => {
    helmetStripeMat.color.set(biome.accent);
    helmetStripeMat.emissive.set(biome.accent);
    trailColor = biome.accent;
    carveColor = new THREE.Color(biome.terrain).multiplyScalar(.35).getHex();
  });
}

function startJump(fromPad) {
  const st = window.Game.state;
  if (st.airborne || st.state !== st.STATE.PLAYING) return;
  st.airborne = true;
  st.airY = .04;
  st.airVy = fromPad ? 10.2 : 7.4;
  st.spin = 0;
  st.spinAbs = 0;
  window.Game.ui.setTrick(fromPad ? 'LAUNCH PAD!' : 'AIRBORNE');
  window.Game.audio.blip(fromPad ? 760 : 540, .12, 'triangle', .15);
  window.GameEvents.emit('jump:start', { fromPad: !!fromPad });
}

function trickLabel(turns) {
  return turns >= 2 ? 'DOUBLE 720' : turns === 1 ? 'CLEAN 360' : 'METHOD';
}

function landTrick() {
  const st = window.Game.state;
  const turns = Math.floor(st.spinAbs / (Math.PI * 2));
  st.airborne = false;
  st.airY = 0;
  st.safeTimer = .65;
  riderRig.rotation.y = 0;
  window.GameEvents.emit('rider:land', { turns });
  if (turns > 0) {
    const points = turns * 180;
    st.styleScore += points;
    st.combo = Math.min(5, st.combo + 1);
    st.comboTimer = 5.2;
    window.Game.ui.setCombo(st.combo);
    window.Game.ui.setTrick('STOMPED ' + trickLabel(turns) + ' +' + points);
    st.trickTimer = 1.7;
    window.Game.ui.announce('✦ ' + trickLabel(turns) + ' — FLOW BOOST');
    window.Game.audio.blip(900 + turns * 160, .18, 'square', .15);
    window.Game.world.emitSpray(st.player.x, window.Game.world.groundH(st.player.x, 0) + .35, 0, 36, 5, 3.8);
    window.GameEvents.emit('trick:landed', { turns, points });
  } else {
    window.Game.ui.setTrick('CLEAN LANDING');
    st.trickTimer = .75;
    window.Game.audio.blip(640, .1, 'sine', .1);
  }
}

function update(dt) {
  const st = window.Game.state, world = window.Game.world;
  const ry = world.groundH(st.player.x, 0), lean = -st.player.vx * .044;

  if (st.airborne) {
    const keys = st.keys;
    const spinInput = (keys.ArrowLeft || keys.a || keys.A ? 1 : 0) - (keys.ArrowRight || keys.d || keys.D ? 1 : 0);
    const spinRate = spinInput * 9.2 + st.player.vx * .075;
    st.spin += spinRate * dt;
    st.spinAbs += Math.abs(spinRate * dt);
    st.airVy -= 18 * dt;
    st.airY += st.airVy * dt;
    window.Game.ui.setTrick((Math.round(st.spinAbs / (Math.PI * 2) * 360 / 90) * 90 || 'AIR') + '° · ' + Math.max(0, st.airY).toFixed(1) + 'm');
    if (st.airY <= 0 && st.airVy < 0) landTrick();
  } else if (st.trickTimer > 0) {
    st.trickTimer -= dt;
    if (st.trickTimer <= 0) window.Game.ui.hideTrick();
  }

  rider.position.set(st.player.x, ry + st.airY, 0);
  rider.rotation.z = lean;
  rider.rotation.x = (world.groundH(st.player.x, -2) - world.groundH(st.player.x, 2)) * .04;
  riderRig.rotation.y = st.airborne ? st.spin : 0;
  board.rotation.y = -st.player.vx * .032;
  torso.rotation.z = Math.sin(st.frame * .12) * .025;
  head.rotation.z = -lean * .18;
  armL.rotation.x = .18 + Math.sin(st.frame * .15) * .08;
  armR.rotation.x = -.18 - Math.sin(st.frame * .15) * .08;
  scarf.rotation.y = Math.sin(st.frame * .12) * .23;

  // Springy scarf follow-through: each segment chases the previous one with a
  // damped spring, driven by lateral speed and airtime — nice whippy lag on landings/carves.
  const driveX = .1 + Math.abs(st.player.vx) * .012 + st.airY * .08;
  const driveZ = Math.sin(st.frame * .12) * .18 - st.player.vx * .014;
  let prevX = driveX, prevZ = driveZ;
  const springK = 62, springDamp = 9.5;
  for (let i = 0; i < scarfSegs.length; i++) {
    const seg = scarfSegs[i];
    const accX = (prevX - seg.angX) * springK - seg.velX * springDamp;
    seg.velX += accX * dt;
    seg.angX += seg.velX * dt;
    const accZ = (prevZ - seg.angZ) * springK - seg.velZ * springDamp;
    seg.velZ += accZ * dt;
    seg.angZ += seg.velZ * dt;
    seg.mesh.rotation.x = seg.angX + .15 * i;
    seg.mesh.rotation.z = seg.angZ;
    prevX = seg.angX; prevZ = seg.angZ;
  }

  if (Math.abs(st.player.vx) > 4 && st.frame % 2 === 0) {
    world.emitSpray(st.player.x - Math.sign(st.player.vx) * .5, ry + .15, 1.25, 2, 2.6, 1.7);
  }

  updateTrailAndCarve(dt, st, world, ry);
}

function updateTrailAndCarve(dt, st, world, ry) {
  const dz = st.speed * dt;

  // Arcade board trail: brighter peak opacity + a speed-scaled fan width so a hard
  // carve throws a bolder, wider glowing wake (cosmetic only — pool size/timing unchanged).
  trailAccum += dt;
  if (!st.airborne && st.state === st.STATE.PLAYING && trailAccum > .04) {
    trailAccum = 0;
    const t = trailPool[trailIdx()];
    t.mesh.position.set(st.player.x, ry + .06, .9);
    t.mesh.rotation.z = board.rotation.y;
    t.mesh.material.color.set(trailColor);
    t.mesh.material.opacity = .72;
    t.mesh.scale.set(1 + Math.min(1.1, Math.abs(st.player.vx) * .035), 1, 1);
    t.life = t.maxLife;
    t.mesh.visible = true;
  }
  for (const t of trailPool) {
    if (t.life > 0) {
      t.life -= dt;
      t.mesh.position.z += dz;
      t.mesh.position.y = world.groundH(t.mesh.position.x, t.mesh.position.z) + .06;
      t.mesh.material.opacity = Math.max(0, t.life / t.maxLife) * .72;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  carveAccum += dt;
  if (!st.airborne && st.state === st.STATE.PLAYING && Math.abs(st.player.vx) > 1.5 && carveAccum > .11) {
    carveAccum = 0;
    const c = carvePool[carveIdx()];
    c.mesh.position.set(st.player.x, ry + .015, .3);
    c.mesh.rotation.z = -st.player.vx * .05;
    c.mesh.material.color.set(carveColor);
    c.mesh.material.opacity = .42;
    c.life = c.maxLife;
    c.mesh.visible = true;
  }
  for (const c of carvePool) {
    if (c.life > 0) {
      c.life -= dt;
      c.mesh.position.z += dz;
      c.mesh.position.y = world.groundH(c.mesh.position.x, c.mesh.position.z) + .015;
      c.mesh.material.opacity = Math.max(0, c.life / c.maxLife) * .42;
      if (c.life <= 0) c.mesh.visible = false;
    }
  }
}

let _trailCursor = 0;
function trailIdx() { const i = _trailCursor; _trailCursor = (_trailCursor + 1) % TRAIL_N; return i; }
let _carveCursor = 0;
function carveIdx() { const i = _carveCursor; _carveCursor = (_carveCursor + 1) % CARVE_N; return i; }

window.Game.rider = {
  init, startJump, landTrick, trickLabel, update,
  get rider() { return rider; },
  get riderRig() { return riderRig; }
};
