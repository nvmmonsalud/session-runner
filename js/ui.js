// js/ui.js — HUD element refs, score/best/combo/meta/speedbar updates, overlay show/hide,
// announce(), trick text display. Behavior-preserving extraction from the original
// single-file index.html.

window.Game = window.Game || {};

const scoreEl = document.querySelector('#score');
const bestEl = document.querySelector('#best');
const comboEl = document.querySelector('#combo');
const trickEl = document.querySelector('#trick');
const speedEl = document.querySelector('#speedbar');
const zoneEl = document.querySelector('#zone');
const metaEl = document.querySelector('#meta');
const overlay = document.querySelector('#overlay');
const eyebrowEl = document.querySelector('#eyebrow');
const titleEl = document.querySelector('#title');
const subEl = document.querySelector('#sub');
const ctaEl = document.querySelector('#cta');
const statsEl = document.querySelector('#runStats');
const announceEl = document.querySelector('#announce');
const storycardEl = document.querySelector('#storycard');
const storycardEyebrowEl = document.querySelector('#storycard-eyebrow');
const storycardLineEl = document.querySelector('#storycard-line');
const epilogueEl = document.querySelector('#epilogue');

let annTimer = 0;

function setScore(score) { scoreEl.textContent = String(score); }

function setSpeedbar(pct, color) {
  speedEl.style.width = pct + '%';
  speedEl.style.background = color;
}

// Arcade "bump" punch: retrigger a CSS keyframe by removing + forcing reflow + re-adding
// the class — classic technique for restarting an animation on a reused DOM element.
function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function setZone(text, color) {
  zoneEl.textContent = text;
  zoneEl.style.color = color;
  bump(zoneEl);
}

function setCombo(combo) {
  comboEl.textContent = 'FLOW ×' + combo;
  comboEl.style.opacity = 1;
  bump(comboEl);
}

function hideCombo() { comboEl.style.opacity = 0; }

function setMeta(best, meta, stats) {
  bestEl.textContent = best;
  metaEl.textContent = meta;
  statsEl.textContent = stats;
}

function setTrick(text) {
  trickEl.textContent = text;
  trickEl.classList.add('show');
}

function hideTrick() { trickEl.classList.remove('show'); }

function showOverlay() { overlay.classList.remove('hidden'); }
function hideOverlay() { overlay.classList.add('hidden'); }

function setOverlayText({ eyebrow, title, sub, cta } = {}) {
  if (eyebrow !== undefined) eyebrowEl.textContent = eyebrow;
  if (title !== undefined) titleEl.innerHTML = title;
  if (sub !== undefined) subEl.textContent = sub;
  if (cta !== undefined) ctaEl.textContent = cta;
}

function announce(text) {
  announceEl.textContent = text;
  announceEl.classList.add('show');
  annTimer = 2.4;
}

function update(dt) {
  if (annTimer > 0) {
    annTimer -= dt;
    if (annTimer <= 0) announceEl.classList.remove('show');
  }
  if (window.Game.story && window.Game.story.tick) window.Game.story.tick(dt);
}

function showStoryCard(eyebrow, line, cls) {
  storycardEyebrowEl.textContent = eyebrow;
  storycardLineEl.textContent = line;
  storycardEl.className = cls ? 'show ' + cls : 'show';
}

function hideStoryCard() {
  storycardEl.classList.remove('show');
}

function setEpilogue(html) {
  epilogueEl.innerHTML = html || '';
}

// ---------------------------------------------------------------------------
// Arcade score popups (js/ui.js) — pooled floating "+180" / "SHARD" call-outs on
// trick landings and shard pickups, styled after SSX-era HUD juice. Fixed-size DOM
// pool, reused/recycled via CSS animation restart — zero per-frame allocation.
// ---------------------------------------------------------------------------
const POPUP_N = 10;
const popupPool = [];
let popupCursor = 0;
const popupLayer = document.createElement('div');
popupLayer.id = 'scorePopups';
document.querySelector('#hud').appendChild(popupLayer);
for (let i = 0; i < POPUP_N; i++) {
  const el = document.createElement('div');
  el.className = 'scorePopup';
  popupLayer.appendChild(el);
  popupPool.push(el);
}

function spawnPopup(text, xPct, yPct, color) {
  const el = popupPool[popupCursor];
  popupCursor = (popupCursor + 1) % POPUP_N;
  el.textContent = text;
  el.style.left = xPct + '%';
  el.style.top = yPct + '%';
  el.style.color = color;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function biomeAccent() {
  const b = window.Game.world && window.Game.world.activeBiome;
  return b ? '#' + b.accent.toString(16).padStart(6, '0') : '#9ef7e5';
}

window.GameEvents.on('trick:landed', ({ points }) => {
  spawnPopup('+' + points, 50 + (Math.random() * 16 - 8), 56, '#ffe0a4');
});
window.GameEvents.on('shard:collected', ({ combo }) => {
  spawnPopup('✦ FLOW ×' + combo, 22 + (Math.random() * 8 - 4), 24, biomeAccent());
});

window.Game.ui = {
  setScore, setSpeedbar, setZone, setCombo, hideCombo, setMeta,
  setTrick, hideTrick, showOverlay, hideOverlay, setOverlayText, announce, update,
  showStoryCard, hideStoryCard, setEpilogue, spawnPopup
};
