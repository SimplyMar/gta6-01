// The screenshot scenes behind ?shot=start|play|end. Each plays the real rules forward from a
// fresh city for a fixed number of steps, steered by a simple autopilot (walk toward the current
// job, swerving clear of buildings; fire when a cop or crew member is close), so the frame is what
// a short run really looks like and the same seed always gives the same frame. The title scene
// only lets the city breathe behind the panel; the end scene forces the final job's completion so
// the closing screen is always reachable, not merely hoped for.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 9;
const IDLE_INPUT = { move: { x: 0, y: 0 }, firing: false, enter: false };

function missionTargetFor(world) {
  const mission = world.currentMission();
  if (!mission) return null;
  if (mission.type === 'reach') return mission.marker;
  if (mission.type === 'heist') return world.state.stage === 'go' ? mission.marker : mission.escape;
  if (mission.type === 'collect') {
    const pickup = world.state.pickups.find((p) => p.active);
    return pickup || mission.pickups[0];
  }
  if (mission.type === 'eliminate') return mission.area;
  return null;
}

/** The first direction, near the one wanted, whose short lookahead point is not inside a building. */
function steer(city, px, py, tx, ty) {
  const desired = Math.atan2(ty - py, tx - px);
  const offsets = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4];
  for (const offset of offsets) {
    const a = desired + offset;
    const lx = px + Math.cos(a) * 50;
    const ly = py + Math.sin(a) * 50;
    if (!city.isBlocked(lx, ly, 14)) return { x: Math.cos(a), y: Math.sin(a) };
  }
  return { x: Math.cos(desired), y: Math.sin(desired) };
}

function autoInput(world) {
  const player = world.state.player;
  const target = missionTargetFor(world) || { x: player.x, y: player.y - 120 };
  const move = steer(world.city, player.x, player.y, target.x, target.y);
  let firing = false;
  for (const c of world.state.cops) {
    if (c.active && Math.hypot(c.x - player.x, c.y - player.y) < 260) {
      firing = true;
      break;
    }
  }
  if (!firing) {
    for (const p of world.state.peds) {
      if (p.active && p.isGang && Math.hypot(p.x - player.x, p.y - player.y) < 220) {
        firing = true;
        break;
      }
    }
  }
  return { move, firing, enter: false };
}

/** Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the mission to show in the HUD. */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, IDLE_INPUT, true);
    return { screen: SCREEN_TITLE, mission: null };
  }
  world.debugForceHeat(3);
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) world.step(STEP, autoInput(world), false);
  if (name === 'play') return { screen: SCREEN_PLAY, mission: world.currentMission() };
  world.debugForceWin();
  world.step(STEP, IDLE_INPUT, false);
  return { screen: SCREEN_WIN, mission: world.currentMission() };
}
