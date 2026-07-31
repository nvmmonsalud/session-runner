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

function setZone(text, color) {
  zoneEl.textContent = text;
  zoneEl.style.color = color;
}

function setCombo(combo) {
  comboEl.textContent = 'FLOW ×' + combo;
  comboEl.style.opacity = 1;
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

window.Game.ui = {
  setScore, setSpeedbar, setZone, setCombo, hideCombo, setMeta,
  setTrick, hideTrick, showOverlay, hideOverlay, setOverlayText, announce, update,
  showStoryCard, hideStoryCard, setEpilogue
};
