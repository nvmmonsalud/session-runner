// js/audio.js — WebAudio: init, blip/crash (original SFX), plus full audio+juice layer:
// procedural ambient music bed, wind whoosh, trick-stomp hit-stop + thud, landing squash,
// zone-transition stingers, UI blips, and "callout voice" stingers for big moments.
// Everything here is 100% procedural WebAudio — no audio files, no dependencies.
//
// Consumes: game:start, game:over, biome:change, trick:landed, rider:land (new, emitted by
// js/rider.js's landTrick()). Never imports other js/*.js modules — coordinates only through
// window.Game.* / window.GameEvents, per the modular architecture.

window.Game = window.Game || {};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let actx = null;
let sfxBus = null;
let musicBus = null;

function initAudio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      sfxBus = actx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(actx.destination);
      musicBus = actx.createGain();
      musicBus.gain.value = 1;
      musicBus.connect(actx.destination);
    } catch (e) {}
  }
  if (actx?.state === 'suspended') actx.resume();
}

// ---------------------------------------------------------------------------------------------
// Original SFX (behavior preserved — same signatures/levels, routed through sfxBus)
// ---------------------------------------------------------------------------------------------

function blip(f, d = .12, t = 'sine', v = .12) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = t;
  o.frequency.value = f;
  g.gain.setValueAtTime(v, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + d);
  o.connect(g);
  g.connect(sfxBus);
  o.start();
  o.stop(actx.currentTime + d);
}

function crash() {
  if (!actx) return;
  const l = actx.sampleRate * .4, b = actx.createBuffer(1, l, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < l; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / l);
  const s = actx.createBufferSource(), g = actx.createGain();
  s.buffer = b;
  g.gain.setValueAtTime(.28, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .4);
  s.connect(g);
  g.connect(sfxBus);
  s.start();
}

// ---------------------------------------------------------------------------------------------
// Shared noise buffer (used by wind, hats, thud)
// ---------------------------------------------------------------------------------------------

let sharedNoiseBuffer = null;
function makeNoiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function getNoiseBuffer() {
  if (!sharedNoiseBuffer) sharedNoiseBuffer = makeNoiseBuffer(1);
  return sharedNoiseBuffer;
}

// ---------------------------------------------------------------------------------------------
// New one-shot SFX: thud (trick-stomp hit-stop impact), uiBlip (menu clicks),
// stinger (per-biome zone transition), calloutVoice (big-moment synth "voice")
// ---------------------------------------------------------------------------------------------

function thud() {
  if (!actx) return;
  const now = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, now);
  o.frequency.exponentialRampToValueAtTime(38, now + .16);
  g.gain.setValueAtTime(.32, now);
  g.gain.exponentialRampToValueAtTime(.001, now + .22);
  o.connect(g);
  g.connect(sfxBus);
  o.start(now);
  o.stop(now + .24);

  const src = actx.createBufferSource(), ng = actx.createGain(), lp = actx.createBiquadFilter();
  src.buffer = getNoiseBuffer();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  ng.gain.setValueAtTime(.22, now);
  ng.gain.exponentialRampToValueAtTime(.001, now + .12);
  src.connect(lp);
  lp.connect(ng);
  ng.connect(sfxBus);
  src.start(now);
  src.stop(now + .14);
}

function uiBlip() {
  if (!actx) return;
  const now = actx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    const t0 = now + i * .045;
    g.gain.setValueAtTime(.09, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .07);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t0);
    o.stop(t0 + .08);
  });
}

const STINGER_SETS = [
  [392.00, 493.88, 587.33],  // Twilight Pines — gentle rising triad
  [523.25, 659.25, 987.77],  // Aurora Glacier — shimmering high sparkle
  [369.99, 466.16, 622.25]   // Whiteout Storm — tense stab
];

function stinger(biomeIndex) {
  if (!actx) return;
  const now = actx.currentTime;
  const notes = STINGER_SETS[biomeIndex] || STINGER_SETS[0];
  const type = biomeIndex === 2 ? 'sawtooth' : 'triangle';
  const gap = biomeIndex === 2 ? .07 : .12;
  notes.forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.value = f;
    const t0 = now + i * gap;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(.13, t0 + .02);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .5);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t0);
    o.stop(t0 + .55);
  });
}

const CALLOUT_PATTERNS = {
  trick: [{ f0: 340, f1: 720, d: .1 }, { f0: 500, f1: 900, d: .12 }],
  newbest: [{ f0: 300, f1: 640, d: .09 }, { f0: 460, f1: 820, d: .09 }, { f0: 620, f1: 1080, d: .16 }],
  act3: [{ f0: 220, f1: 160, d: .14 }, { f0: 180, f1: 520, d: .22 }]
};

function calloutVoice(kind) {
  if (!actx) return;
  const seq = CALLOUT_PATTERNS[kind] || CALLOUT_PATTERNS.trick;
  let t = actx.currentTime;
  seq.forEach(seg => {
    const o = actx.createOscillator(), bp = actx.createBiquadFilter(), g = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(seg.f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, seg.f1), t + seg.d);
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(seg.f0 * 2.2, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(80, seg.f1 * 2.2), t + seg.d);
    bp.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.16, t + seg.d * .3);
    g.gain.exponentialRampToValueAtTime(.001, t + seg.d);
    o.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + seg.d + .02);
    t += seg.d * .85;
  });
}

// ---------------------------------------------------------------------------------------------
// Wind whoosh — filtered noise, gain/cutoff proportional to speed, gust swell while airborne
// ---------------------------------------------------------------------------------------------

const wind = { running: false, noiseSrc: null, bandpass: null, gain: null, gustGain: null };

function startWind() {
  if (!actx || wind.running) return;
  const src = actx.createBufferSource();
  src.buffer = makeNoiseBuffer(2);
  src.loop = true;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 650;
  bp.Q.value = .6;
  const g = actx.createGain();
  g.gain.value = 0;
  const gustG = actx.createGain();
  gustG.gain.value = 0;
  src.connect(bp);
  bp.connect(g);
  bp.connect(gustG);
  g.connect(sfxBus);
  gustG.connect(sfxBus);
  src.start();
  wind.noiseSrc = src;
  wind.bandpass = bp;
  wind.gain = g;
  wind.gustGain = gustG;
  wind.running = true;
}

function stopWind() {
  if (!wind.running || !actx) return;
  const now = actx.currentTime;
  wind.gain.gain.cancelScheduledValues(now);
  wind.gain.gain.setTargetAtTime(0, now, .3);
  wind.gustGain.gain.cancelScheduledValues(now);
  wind.gustGain.gain.setTargetAtTime(0, now, .3);
  const src = wind.noiseSrc;
  setTimeout(() => { try { src.stop(); } catch (e) {} }, 550);
  wind.running = false;
  wind.noiseSrc = null;
}

function updateWind(st) {
  if (!wind.running || !actx) return;
  const now = actx.currentTime;
  const speedNorm = clamp((st.speed - 14) / 40, 0, 1);
  wind.gain.gain.setTargetAtTime(.02 + speedNorm * .11, now, .25);
  wind.bandpass.frequency.setTargetAtTime(500 + speedNorm * 1400, now, .3);
  const gustTarget = st.airborne ? .09 + speedNorm * .05 : 0;
  wind.gustGain.gain.setTargetAtTime(gustTarget, now, .18);
}

// ---------------------------------------------------------------------------------------------
// Ambient music bed — detuned chord pad + slow filter LFO + light rhythm pulse.
// Mood/intensity scales with biome (chord set + waveform + filter range + tempo + rhythm
// density) and with speed (filter brightness + rhythm density + tempo).
// ---------------------------------------------------------------------------------------------

const BIOME_MUSIC = [
  { // Twilight Pines — calm
    chord: [146.83, 174.61, 220.00, 293.66], types: ['sine', 'triangle', 'sine', 'triangle'],
    special: 73.42, specialType: 'sine', specialGain: .015,
    filterBase: 650, filterSpread: 500, Q: .6, bpm: 74, density: 'sparse'
  },
  { // Aurora Glacier — shimmering
    chord: [164.81, 207.65, 246.94, 329.63], types: ['triangle', 'sine', 'triangle', 'sine'],
    special: 659.25, specialType: 'sine', specialGain: .05,
    filterBase: 1000, filterSpread: 900, Q: .8, bpm: 86, density: 'medium'
  },
  { // Whiteout Storm — tense, driving
    chord: [138.59, 164.81, 207.65, 277.18], types: ['sawtooth', 'triangle', 'sawtooth', 'triangle'],
    special: 69.30, specialType: 'sawtooth', specialGain: .06,
    filterBase: 500, filterSpread: 1300, Q: 1.6, bpm: 112, density: 'dense'
  }
];

const music = {
  playing: false, voices: [], specialVoice: null, filter: null, lfo: null, lfoGain: null,
  musicGain: null, biomeIndex: 0, intensity: 0, schedTimer: null, nextNoteTime: 0, beat: 0
};

function musicCurrentBpm() {
  const cfg = BIOME_MUSIC[music.biomeIndex];
  return cfg.bpm + music.intensity * 14;
}

function musicPlayKick(time, vol) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, time);
  o.frequency.exponentialRampToValueAtTime(42, time + .11);
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(.001, time + .22);
  o.connect(g);
  g.connect(musicBus);
  o.start(time);
  o.stop(time + .24);
}

function musicPlayHat(time, vol) {
  const src = actx.createBufferSource(), hp = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = getNoiseBuffer();
  hp.type = 'highpass';
  hp.frequency.value = 5500;
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(.0008, time + .05);
  src.connect(hp);
  hp.connect(g);
  g.connect(musicBus);
  src.start(time);
  src.stop(time + .06);
}

function musicPlayStep(beat, time) {
  const cfg = BIOME_MUSIC[music.biomeIndex];
  const kickBeats = cfg.density === 'sparse' ? [0, 4] : cfg.density === 'medium' ? [0, 3, 4, 7] : [0, 2, 4, 6];
  let hatBeats = cfg.density === 'sparse' ? [] : cfg.density === 'medium' ? [2, 6] : [1, 3, 5, 7];
  if (music.intensity > .6 && cfg.density !== 'dense') hatBeats = hatBeats.concat([1, 5]);
  if (kickBeats.includes(beat)) musicPlayKick(time, cfg.density === 'dense' ? .11 : .085);
  if (hatBeats.includes(beat)) musicPlayHat(time, cfg.density === 'dense' ? .045 : .03);
}

function musicScheduleRhythm() {
  if (!music.playing || !actx) return;
  while (music.nextNoteTime < actx.currentTime + .18) {
    musicPlayStep(music.beat, music.nextNoteTime);
    music.nextNoteTime += 60 / musicCurrentBpm() / 2;
    music.beat = (music.beat + 1) % 8;
  }
}

function musicStart() {
  if (!actx || music.playing) return;
  const cfg = BIOME_MUSIC[0];

  music.musicGain = actx.createGain();
  music.musicGain.gain.value = 0;
  music.musicGain.connect(musicBus);

  music.filter = actx.createBiquadFilter();
  music.filter.type = 'lowpass';
  music.filter.frequency.value = cfg.filterBase;
  music.filter.Q.value = cfg.Q;
  music.filter.connect(music.musicGain);

  music.lfo = actx.createOscillator();
  music.lfo.type = 'sine';
  music.lfo.frequency.value = .12;
  music.lfoGain = actx.createGain();
  music.lfoGain.gain.value = 220;
  music.lfo.connect(music.lfoGain);
  music.lfoGain.connect(music.filter.frequency);
  music.lfo.start();

  music.voices = cfg.chord.map((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = cfg.types[i];
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 4;
    g.gain.value = .05;
    o.connect(g);
    g.connect(music.filter);
    o.start();
    return { osc: o, gain: g };
  });

  const so = actx.createOscillator(), sg = actx.createGain();
  so.type = cfg.specialType;
  so.frequency.value = cfg.special;
  sg.gain.value = 0;
  so.connect(sg);
  sg.connect(music.filter);
  so.start();
  music.specialVoice = { osc: so, gain: sg };

  music.biomeIndex = 0;
  music.intensity = 0;
  music.beat = 0;
  music.nextNoteTime = actx.currentTime + .1;
  music.schedTimer = setInterval(musicScheduleRhythm, 45);

  const now = actx.currentTime;
  music.musicGain.gain.cancelScheduledValues(now);
  music.musicGain.gain.setValueAtTime(0, now);
  music.musicGain.gain.linearRampToValueAtTime(.22, now + 1.6);

  music.playing = true;
}

function musicStop() {
  if (!music.playing || !actx) return;
  const now = actx.currentTime;
  music.musicGain.gain.cancelScheduledValues(now);
  music.musicGain.gain.setTargetAtTime(0, now, .35);
  clearInterval(music.schedTimer);
  music.schedTimer = null;
  const { voices, specialVoice, lfo, filter, musicGain } = music;
  setTimeout(() => {
    try {
      voices.forEach(v => { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); });
      if (specialVoice) { specialVoice.osc.stop(); specialVoice.osc.disconnect(); specialVoice.gain.disconnect(); }
      lfo.stop(); lfo.disconnect();
      filter.disconnect();
      musicGain.disconnect();
    } catch (e) {}
  }, 900);
  music.playing = false;
  music.voices = [];
  music.specialVoice = null;
}

function musicSetBiome(index) {
  if (!music.playing || !actx) return;
  const cfg = BIOME_MUSIC[index];
  const now = actx.currentTime;
  music.voices.forEach((v, i) => {
    v.osc.type = cfg.types[i];
    v.osc.frequency.setTargetAtTime(cfg.chord[i], now, .9);
  });
  if (music.specialVoice) {
    music.specialVoice.osc.type = cfg.specialType;
    music.specialVoice.osc.frequency.setTargetAtTime(cfg.special, now, .9);
    music.specialVoice.gain.gain.setTargetAtTime(cfg.specialGain, now, .8);
  }
  music.filter.Q.setTargetAtTime(cfg.Q, now, .6);
  music.biomeIndex = index;
}

function musicSetIntensity(speedNorm) {
  if (!music.playing || !actx) return;
  const cfg = BIOME_MUSIC[music.biomeIndex];
  const now = actx.currentTime;
  music.filter.frequency.setTargetAtTime(cfg.filterBase + speedNorm * cfg.filterSpread, now, .4);
  music.intensity = speedNorm;
}

// ---------------------------------------------------------------------------------------------
// Juice: hit-stop (consumed by a surgical hook in core.js's loop) + landing squash-and-stretch
// (drives window.Game.rider.rider.scale directly — rider.js never touches .scale, so this is
// safe to own from here without fighting other modules).
// ---------------------------------------------------------------------------------------------

const squashSpring = { scaleX: 1, scaleY: 1, velX: 0, velY: 0 };
const SPRING_K = 220, SPRING_D = 18;

const juice = {
  hitstopUntil: 0,
  hitstop(ms) { this.hitstopUntil = performance.now() + ms; },
  squash() {
    squashSpring.scaleY = .85;
    squashSpring.scaleX = 1.1;
    squashSpring.velX = 0;
    squashSpring.velY = 0;
  }
};
window.Game.juice = juice;

function updateSquashSpring(dt) {
  const riderObj = window.Game.rider && window.Game.rider.rider;
  const fy = (1 - squashSpring.scaleY) * SPRING_K - squashSpring.velY * SPRING_D;
  squashSpring.velY += fy * dt;
  squashSpring.scaleY += squashSpring.velY * dt;
  const fx = (1 - squashSpring.scaleX) * SPRING_K - squashSpring.velX * SPRING_D;
  squashSpring.velX += fx * dt;
  squashSpring.scaleX += squashSpring.velX * dt;
  if (riderObj) riderObj.scale.set(squashSpring.scaleX, squashSpring.scaleY, squashSpring.scaleX);
}

// ---------------------------------------------------------------------------------------------
// Per-frame follower (own rAF loop — reads window.Game.state, never mutates it) driving wind,
// music intensity and the squash spring every frame regardless of core.js's own loop/hit-stop.
// ---------------------------------------------------------------------------------------------

let lastFrameT = performance.now();
function audioFrame() {
  requestAnimationFrame(audioFrame);
  const now = performance.now();
  const dt = Math.min((now - lastFrameT) / 1000, .05);
  lastFrameT = now;
  updateSquashSpring(dt);
  const st = window.Game.state;
  if (!actx || !st) return;
  updateWind(st);
  if (music.playing) musicSetIntensity(clamp((st.speed - 14) / 40, 0, 1));
}
requestAnimationFrame(audioFrame);

// ---------------------------------------------------------------------------------------------
// GameEvents wiring
// ---------------------------------------------------------------------------------------------

window.GameEvents.on('game:start', () => {
  initAudio();
  musicStart();
  startWind();
  uiBlip();
});

window.GameEvents.on('game:over', ({ newBest } = {}) => {
  musicStop();
  stopWind();
  if (newBest) calloutVoice('newbest');
});

window.GameEvents.on('biome:change', ({ index } = {}) => {
  const isProgression = music.playing && index > music.biomeIndex;
  musicSetBiome(index);
  if (isProgression) {
    stinger(index);
    if (index === 2) calloutVoice('act3');
  }
});

window.GameEvents.on('trick:landed', ({ turns } = {}) => {
  thud();
  juice.hitstop(80);
  if (turns >= 2) calloutVoice('trick');
});

window.GameEvents.on('rider:land', () => {
  juice.squash();
});

// ---------------------------------------------------------------------------------------------

window.Game.audio = {
  initAudio, blip, crash, thud, uiBlip, stinger, calloutVoice,
  music: { start: musicStart, stop: musicStop, setIntensity: musicSetIntensity, setBiome: musicSetBiome },
  wind: { start: startWind, stop: stopWind },
  getContext: () => actx
};
