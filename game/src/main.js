// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, down (health hit zero) and win (the last job
// from Reyes is done; the city keeps running in free roam afterward).
//
// ?seed=N fixes the city and every random spawn in it. ?shot=start|play|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_DOWN, EVENT_HIT, EVENT_MISSION, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas, world.city);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best take then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.mission);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function bankBest() {
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
    }
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Reyes has a job for you - check the top of the screen.');
  }

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        startGame();
        return;
      }
      if (screen === SCREEN_DOWN) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Back on your feet.');
        return;
      }
      if (screen === SCREEN_WIN) {
        screen = SCREEN_PLAY;
        announce('Free roam. Solis is yours.');
        return;
      }
      if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
        return;
      }
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(enterPressed) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, firing: false, enter: false }, true);
      return;
    }
    const events = world.step(STEP, { move: input.move(), firing: input.firing(), enter: enterPressed }, false);
    if (events & EVENT_DOWN) {
      screen = SCREEN_DOWN;
      bankBest();
      announce(`Down. Banked $${Math.floor(world.state.cash)}. Press Enter to get back up.`);
    } else if (events & EVENT_WIN) {
      screen = SCREEN_WIN;
      bankBest();
      announce(`Solis is yours. Final take $${Math.floor(world.state.cash)}.`);
    } else if (events & EVENT_MISSION) {
      announce(world.state.banner);
    } else if (events & EVENT_HIT) {
      announce(`Hit. Health ${Math.ceil(world.state.player.health)}.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    const enterPressed = (actions & ACTION_ENTER) !== 0;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first && enterPressed);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, world.currentMission());
  }

  // Leaving the tab pauses a running game rather than letting traffic and cops run on unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solis. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
