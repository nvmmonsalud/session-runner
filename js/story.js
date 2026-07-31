// js/story.js — narrative strings, story-progress state and the story-card banner queue.
// Owns all copy. Talks to the rest of the game only through window.GameEvents /
// window.Game.state (read-only) and calls window.Game.ui.* setters to paint the DOM.
// Behavior-preserving extension of the original story.js — every export that existed
// before (roman, intro, zoneLabel, zoneAnnounce, metaText, wipeoutText) keeps its exact
// signature so world.js / core.js keep working untouched.

window.Game = window.Game || {};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function roman(n) { return ROMAN[Math.min(n - 1, 6)] || String(n); }

// ---------------------------------------------------------------------------
// Prologue — shown on the main-menu overlay via the existing #sub element.
// ---------------------------------------------------------------------------
const intro = {
  eyebrow: 'A STORY OF THE LAST POWDER RUNNER',
  title: 'SESSION RUNNER<br>3D',
  sub: 'The mountain is going dark. Rin is the last rider left who still knows its lines, and every starlight shard she threads holds a sliver of what the peak used to be. She drops in anyway — carving through changing worlds, chasing whatever light is left to save.',
  cta: 'SPACE / TAP TO DROP IN'
};

// ---------------------------------------------------------------------------
// Existing HUD copy helpers — unchanged behavior.
// ---------------------------------------------------------------------------
function zoneLabel(biome) {
  return biome.icon + ' ' + biome.name;
}

function zoneAnnounce(biome) {
  return biome.icon + ' ' + biome.name + ' — ROUTE SHIFT';
}

function metaText(hiScore, expedition, completedRuns) {
  return {
    best: 'BEST ' + hiScore,
    meta: 'EXPEDITION ' + roman(expedition) + ' · RUN ' + (completedRuns + 1),
    stats: 'EXPEDITION ' + roman(expedition) + ' · ' + completedRuns + ' COMPLETED RUN' + (completedRuns === 1 ? '' : 'S')
  };
}

function wipeoutText({ expedition, previousExpedition, score, newBest, hiScore, completedRuns }) {
  const up = expedition > previousExpedition;
  return {
    title: up ? 'EXPEDITION UP!' : 'WIPEOUT!',
    sub: up
      ? ('Expedition ' + roman(expedition) + ' unlocked — baseline speed and route pressure increased.')
      : ('Score ' + score + (newBest ? ' — new best run.' : ' · Best ' + hiScore) + '. ' + (completedRuns % 3 === 0 ? 'The expedition is getting tougher.' : 'A new route is waiting.')),
    cta: 'SPACE / TAP TO DROP BACK IN'
  };
}

// ---------------------------------------------------------------------------
// Three-act structure, mapped 1:1 to the biome list in world.js.
// ---------------------------------------------------------------------------
const ACTS = [
  {
    act: 1,
    name: 'TWILIGHT PINES',
    line: "Rin drops into the pines her father used to ride, chasing a light that shouldn't still be burning."
  },
  {
    act: 2,
    name: 'AURORA GLACIER',
    line: "The glacier hums back at every shard she takes — like the mountain remembers being awake."
  },
  {
    act: 3,
    name: 'WHITEOUT STORM',
    line: "Beyond the whiteout is the summit, and whatever is left of the mountain's memory."
  }
];

// ---------------------------------------------------------------------------
// Named tricks — mapped from spin turns (see rider.js landTrick()).
// ---------------------------------------------------------------------------
function trickName(turns) {
  if (turns >= 3) return 'GALAXY 1080+';
  if (turns === 2) return 'CORKSCREW 720';
  return 'METHOD 360';
}

const TRICK_FLAVOR = {
  1: ["the shard-light spins with her.", "clean as her father's old line.", "the pines blur into gold."],
  2: ["the mountain holds its breath.", "two turns, no wobble — the light stays with her.", "Rin: 'Still got it.'"],
  3: ["the whole slope goes quiet for it.", "even the storm seems to watch.", "Rin: 'That one's for the summit.'"]
};

function trickFlavorFor(turns) {
  const pool = TRICK_FLAVOR[Math.min(turns, 3)];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// In-run flavor pools — dialogue / mountain lore, triggered off events.
// ---------------------------------------------------------------------------
const FLAVOR = {
  firstTrick: [
    "Rin: 'Okay. Muscle memory's still there.'",
    "Rin: 'One trick down. The mountain's watching now.'"
  ],
  shardStreak: [
    "Each shard is a second of the mountain that hasn't faded yet.",
    "Rin: 'Every one of these is someone's run. I'm not losing them.'",
    "The shards pull toward her like they know her name."
  ],
  comboHigh: [
    "Rin: 'Flow's locked in. Don't blink.'",
    "The wind stops fighting her and starts riding with her.",
    "Rin: 'This is the run. This is the one.'"
  ],
  survive: [
    "The trees thin out ahead — Rin's never come this far this clean.",
    "Rin: 'Longest line I've had in weeks. Keep it together.'",
    "Somewhere below, the valley lights flicker back on, just a little."
  ]
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------------------------------------------------------------------------
// Persisted story progress — new localStorage key, isolated from the two
// existing keys (sessionRunner3dHi / sessionRunner3dRuns), whose semantics
// this file never touches.
// ---------------------------------------------------------------------------
const STORY_KEY = 'sessionRunnerStory';
let storyData = { maxAct: 1, epilogueSeen: false, totalTricks: 0, totalShards: 0 };
try {
  const raw = JSON.parse(localStorage.getItem(STORY_KEY));
  if (raw && typeof raw === 'object') {
    storyData.maxAct = Math.max(1, Math.min(3, +raw.maxAct || 1));
    storyData.epilogueSeen = !!raw.epilogueSeen;
    storyData.totalTricks = +raw.totalTricks || 0;
    storyData.totalShards = +raw.totalShards || 0;
  }
} catch (e) {}

function saveStory() {
  try { localStorage.setItem(STORY_KEY, JSON.stringify(storyData)); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Story-card banner queue — a single non-blocking, auto-dismissing card used
// for act transitions, named tricks and flavor lines. Never pauses gameplay,
// never intercepts input; it just paints text via window.Game.ui.showStoryCard.
// ---------------------------------------------------------------------------
const displayQueue = [];
let showing = false, showTimer = 0, gapTimer = 0;

function enqueue(eyebrow, line, cls, duration) {
  displayQueue.push({ eyebrow, line, cls, duration: duration || 3.4 });
}

function pump() {
  if (showing || gapTimer > 0 || displayQueue.length === 0) return;
  const item = displayQueue.shift();
  showing = true;
  showTimer = item.duration;
  window.Game.ui.showStoryCard(item.eyebrow, item.line, item.cls);
}

// Flavor lines are gated behind a slow-firing queue of their own so bursts of
// events (e.g. several shards in a row) never spam the banner.
const FLAVOR_MIN_GAP = 12;
let elapsed = 0, lastFlavorAt = -999;
const pendingFlavor = [];

function queueFlavor(text) { pendingFlavor.push(text); }

let runElapsed = 0, playing = false;
let firedFirstTrick = false, firedShardStreak = false, firedComboHigh = false;
const firedSurvive = [false, false, false];
const SURVIVE_THRESHOLDS = [28, 62, 105];

let tricksThisRun = 0, shardsThisRun = 0;
let epilogueSeenAtRunStart = storyData.epilogueSeen;

function tick(dt) {
  elapsed += dt;
  if (playing) runElapsed += dt;

  if (showing) {
    showTimer -= dt;
    if (showTimer <= 0) {
      showing = false;
      gapTimer = 0.4;
      window.Game.ui.hideStoryCard();
    }
  } else if (gapTimer > 0) {
    gapTimer -= dt;
  }

  if (playing) {
    for (let i = 0; i < SURVIVE_THRESHOLDS.length; i++) {
      if (!firedSurvive[i] && runElapsed >= SURVIVE_THRESHOLDS[i]) {
        firedSurvive[i] = true;
        queueFlavor(pick(FLAVOR.survive));
      }
    }
  }

  if (pendingFlavor.length && elapsed - lastFlavorAt >= FLAVOR_MIN_GAP) {
    const text = pendingFlavor.shift();
    lastFlavorAt = elapsed;
    enqueue('RIN', text, 'flavor', 3.6);
  }

  pump();
}

// ---------------------------------------------------------------------------
// Event wiring.
// ---------------------------------------------------------------------------
window.GameEvents.on('game:start', () => {
  playing = true;
  runElapsed = 0;
  tricksThisRun = 0;
  shardsThisRun = 0;
  firedFirstTrick = false;
  firedShardStreak = false;
  firedComboHigh = false;
  firedSurvive[0] = firedSurvive[1] = firedSurvive[2] = false;
  epilogueSeenAtRunStart = storyData.epilogueSeen;
  window.Game.ui.setEpilogue('');
});

window.GameEvents.on('biome:change', ({ index }) => {
  const act = ACTS[Math.min(index, ACTS.length - 1)];
  enqueue('ACT ' + roman(act.act) + ' · ' + act.name, act.line, 'act', 4);
  if (act.act > storyData.maxAct) {
    storyData.maxAct = act.act;
    if (storyData.maxAct >= 3) storyData.epilogueSeen = true;
    saveStory();
  }
});

window.GameEvents.on('trick:landed', ({ turns }) => {
  if (!turns) return;
  tricksThisRun++;
  storyData.totalTricks++;
  saveStory();
  enqueue('NAMED TRICK', trickName(turns) + ' — ' + trickFlavorFor(turns), 'trick', 2.8);

  if (!firedFirstTrick) {
    firedFirstTrick = true;
    queueFlavor(pick(FLAVOR.firstTrick));
  }
  const combo = window.Game.state ? window.Game.state.combo : 1;
  if (!firedComboHigh && combo >= 5) {
    firedComboHigh = true;
    queueFlavor(pick(FLAVOR.comboHigh));
  }
});

window.GameEvents.on('shard:collected', ({ combo }) => {
  shardsThisRun++;
  storyData.totalShards++;
  saveStory();
  if (!firedShardStreak && combo >= 3) {
    firedShardStreak = true;
    queueFlavor(pick(FLAVOR.shardStreak));
  }
  if (!firedComboHigh && combo >= 5) {
    firedComboHigh = true;
    queueFlavor(pick(FLAVOR.comboHigh));
  }
});

window.GameEvents.on('game:over', ({ score, best, newBest }) => {
  playing = false;
  const freshlyUnlocked = storyData.epilogueSeen && !epilogueSeenAtRunStart;

  const runLine = 'RUN: SCORE ' + score + ' · BEST ' + best + (newBest ? ' (NEW BEST)' : '') +
    ' · ' + tricksThisRun + ' TRICK' + (tricksThisRun === 1 ? '' : 'S') +
    ' · ' + shardsThisRun + ' SHARD' + (shardsThisRun === 1 ? '' : 'S');

  let progressLine;
  if (freshlyUnlocked) {
    progressLine = 'STORY: THE WHITEOUT REMEMBERS HER NAME — Rin\'s line reaches the summit for the first time.';
  } else if (newBest) {
    progressLine = 'STORY: NEW BEST — the mountain\'s fading light burns a little brighter for it.';
  } else if (storyData.maxAct >= 3) {
    progressLine = 'STORY: ACT III/III REACHED — the whiteout already knows her name.';
  } else {
    progressLine = 'STORY: ACT ' + roman(storyData.maxAct) + ' REACHED — ACT III/III unlocks in the whiteout.';
  }

  window.Game.ui.setEpilogue(runLine + '<br>' + progressLine);
});

window.Game.story = {
  roman, intro, zoneLabel, zoneAnnounce, metaText, wipeoutText,
  trickName, tick,
  get maxAct() { return storyData.maxAct; },
  get epilogueSeen() { return storyData.epilogueSeen; },
  get totalTricks() { return storyData.totalTricks; },
  get totalShards() { return storyData.totalShards; }
};
