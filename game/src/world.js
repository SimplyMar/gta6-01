// Solis's rules and state, with no drawing and no browser in it: the player (on foot or behind
// the wheel), traffic, pedestrians, police, heat, health, cash and the five-job mission chain.
// step() advances one fixed tick and returns what happened as bit flags, so the caller (the loop,
// or the screenshot stager) can react without the world knowing about screens. Nothing here
// allocates per tick except the rare mission-setup arrays, built once per job.
import {
  BULLET_POOL, CAR, CELL, COP, HEAT, MISSIONS, PED, PICKUP_RADIUS, PLAYER, TRAFFIC, WATER_ROWS, WORLD,
} from './config.js';
import { buildCity } from './city.js';

export const EVENT_HIT = 1;
export const EVENT_DOWN = 2;
export const EVENT_MISSION = 4;
export const EVENT_WIN = 8;
export const EVENT_PICKUP = 16;

const SPAWN = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function turnToward(current, target, rate, dt) {
  let diff = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const max = rate * dt;
  if (diff > max) diff = max;
  else if (diff < -max) diff = -max;
  return current + diff;
}

export function createWorld(random, seed) {
  const city = buildCity(seed);

  const player = {
    x: SPAWN.x, y: SPAWN.y, angle: 0, mode: 'foot', carIndex: -1,
    health: PLAYER.maxHealth, ammo: PLAYER.maxAmmo, fireCooldown: 0, hurtTimer: 0,
  };

  const vehicles = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    vehicles.push({ active: false, x: 0, y: 0, angle: 0, speed: 0, color: '', laneAxis: 'row', laneDir: 1, driver: null, parked: false });
  }
  const peds = [];
  for (let i = 0; i < PED.count; i += 1) {
    peds.push({ active: false, x: 0, y: 0, angle: 0, wander: 0, dx: 0, dy: 0, isGang: false, alive: true });
  }
  const cops = [];
  for (let i = 0; i < COP.pool; i += 1) {
    cops.push({ active: false, x: 0, y: 0, angle: 0, speed: 0, health: 0, fireCooldown: 0, ramCooldown: 0 });
  }
  const bullets = [];
  for (let i = 0; i < BULLET_POOL; i += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, owner: 'player' });
  }

  const state = {
    player, vehicles, peds, cops, bullets,
    cash: 0, heat: 0, heatIdle: 0, copSpawnTimer: 1.5,
    missionIndex: 0, missionReady: false, stage: 'go', collected: 0, eliminated: 0,
    pickups: [], won: false, downFired: false, banner: '', bannerTimer: 0,
    elapsed: 0,
  };

  function currentMission() {
    return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  }

  function freeVehicle() {
    for (const v of vehicles) if (!v.active) return v;
    return null;
  }
  function freePed() {
    for (const p of peds) if (!p.active) return p;
    return null;
  }
  function freeCop() {
    for (const c of cops) if (!c.active) return c;
    return null;
  }
  function freeBullet() {
    for (const b of bullets) if (!b.active) return b;
    return null;
  }

  function randomOpenPoint(cx, cy, minR, maxR, radius) {
    for (let i = 0; i < 14; i += 1) {
      const a = random() * TAU;
      const r = minR + random() * (maxR - minR);
      const x = Math.max(radius, Math.min(WORLD - radius, cx + Math.cos(a) * r));
      const y = Math.max(radius, Math.min(WORLD - WATER_ROWS * CELL - radius, cy + Math.sin(a) * r));
      if (!city.isBlocked(x, y, radius)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  function spawnTraffic() {
    for (const v of vehicles) {
      const useRow = random() < 0.5 && city.laneRows.length > 0;
      v.active = true;
      v.parked = false;
      v.driver = null;
      v.speed = TRAFFIC.speed * (0.8 + random() * 0.4);
      v.color = ['#9aa3b2', '#c7904f', '#5a7fa6', '#8f8f8f', '#b46a5f'][Math.floor(random() * 5)];
      if (useRow) {
        const lane = city.laneRows[Math.floor(random() * city.laneRows.length)];
        v.laneAxis = 'row';
        v.laneDir = lane.dir;
        v.x = random() * WORLD;
        v.y = lane.cy * CELL + CELL / 2;
        v.angle = lane.dir > 0 ? 0 : Math.PI;
      } else {
        const lane = city.laneCols[Math.floor(random() * city.laneCols.length)];
        v.laneAxis = 'col';
        v.laneDir = lane.dir;
        v.x = lane.cx * CELL + CELL / 2;
        v.y = random() * (WORLD - WATER_ROWS * CELL);
        v.angle = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  function spawnPedestrians() {
    for (const p of peds) {
      const point = randomOpenPoint(SPAWN.x, SPAWN.y, 60, WORLD * 0.55, PED.radius);
      p.active = true;
      p.alive = true;
      p.isGang = false;
      p.x = point.x;
      p.y = point.y;
      p.wander = random() * 2;
      p.dx = 0;
      p.dy = 0;
    }
  }

  function setupMission() {
    const mission = currentMission();
    state.stage = 'go';
    state.collected = 0;
    state.eliminated = 0;
    state.pickups = [];
    if (!mission) {
      state.missionReady = true;
      return;
    }
    if (mission.type === 'collect') {
      state.pickups = mission.pickups.map((p) => ({ x: p.x, y: p.y, active: true }));
    } else if (mission.type === 'eliminate') {
      let spawned = 0;
      for (const p of peds) {
        if (spawned >= mission.count) break;
        if (p.active && p.isGang) continue;
        const point = randomOpenPoint(mission.area.x, mission.area.y, 10, mission.area.radius, PED.radius);
        p.active = true;
        p.alive = true;
        p.isGang = true;
        p.x = point.x;
        p.y = point.y;
        p.wander = random() * 2;
        spawned += 1;
      }
    }
    state.missionReady = true;
  }

  function reset() {
    player.x = SPAWN.x;
    player.y = SPAWN.y;
    player.angle = 0;
    player.mode = 'foot';
    player.carIndex = -1;
    player.health = PLAYER.maxHealth;
    player.ammo = PLAYER.maxAmmo;
    player.fireCooldown = 0;
    player.hurtTimer = 0;
    state.cash = 0;
    state.heat = 0;
    state.heatIdle = 0;
    state.copSpawnTimer = 1.5;
    state.missionIndex = 0;
    state.missionReady = false;
    state.won = false;
    state.downFired = false;
    state.banner = '';
    state.bannerTimer = 0;
    state.elapsed = 0;
    for (const c of cops) c.active = false;
    for (const b of bullets) b.active = false;
    spawnTraffic();
    spawnPedestrians();
    setupMission();
  }

  /** A soft respawn after going down: keeps cash and mission progress, clears the chase. */
  function respawn() {
    player.x = SPAWN.x;
    player.y = SPAWN.y;
    player.mode = 'foot';
    player.carIndex = -1;
    player.health = PLAYER.maxHealth;
    player.ammo = PLAYER.maxAmmo;
    player.hurtTimer = 0;
    state.heat = 0;
    state.heatIdle = 0;
    state.downFired = false;
    for (const c of cops) c.active = false;
    for (const b of bullets) b.active = false;
  }

  function addHeat(amount) {
    state.heat = Math.min(HEAT.max, state.heat + amount);
    state.heatIdle = 0;
  }

  function completeMission() {
    const mission = currentMission();
    if (!mission) return 0;
    state.cash += mission.reward;
    state.banner = `+$${mission.reward} - ${mission.title} complete`;
    state.bannerTimer = 3.2;
    let events = EVENT_MISSION;
    if (mission.final) {
      state.won = true;
      events |= EVENT_WIN;
    } else {
      state.missionIndex += 1;
      state.missionReady = false;
    }
    return events;
  }

  function damagePlayer(amount) {
    if (player.health <= 0) return;
    player.health = Math.max(0, player.health - amount);
    player.hurtTimer = 0.3;
  }

  function enterNearestVehicle() {
    let best = null;
    let bestDist = PLAYER.enterRange;
    for (const v of vehicles) {
      if (!v.active || v.driver) continue;
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (best) {
      best.driver = 'player';
      best.parked = false;
      player.mode = 'car';
      player.carIndex = vehicles.indexOf(best);
      player.angle = best.angle;
    }
  }

  function exitVehicle() {
    const v = vehicles[player.carIndex];
    if (v) {
      v.driver = null;
      v.parked = true;
      v.speed = 0;
      player.x = v.x + Math.cos(v.angle + Math.PI / 2) * 36;
      player.y = v.y + Math.sin(v.angle + Math.PI / 2) * 36;
    }
    player.mode = 'foot';
    player.carIndex = -1;
  }

  function fire() {
    if (player.ammo < 1 || player.fireCooldown > 0) return;
    const b = freeBullet();
    if (!b) return;
    player.ammo -= 1;
    player.fireCooldown = PLAYER.fireCooldown;
    b.active = true;
    b.owner = 'player';
    b.x = player.x + Math.cos(player.angle) * 20;
    b.y = player.y + Math.sin(player.angle) * 20;
    b.vx = Math.cos(player.angle) * PLAYER.bulletSpeed;
    b.vy = Math.sin(player.angle) * PLAYER.bulletSpeed;
    b.life = PLAYER.bulletRange / PLAYER.bulletSpeed;
  }

  function updatePlayer(dt, move, firing, enterPressed, harmless) {
    if (player.fireCooldown > 0) player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.ammo < PLAYER.maxAmmo) player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + PLAYER.ammoRegenRate * dt);
    if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    if (player.health > 0 && player.health < PLAYER.maxHealth) {
      player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.healthRegenRate * dt);
    }
    if (harmless) return;

    if (enterPressed) {
      if (player.mode === 'foot') enterNearestVehicle();
      else exitVehicle();
    }

    if (player.mode === 'foot') {
      const len = Math.hypot(move.x, move.y);
      let vx = 0;
      let vy = 0;
      if (len > 0.001) {
        vx = (move.x / len) * PLAYER.footSpeed;
        vy = (move.y / len) * PLAYER.footSpeed;
        player.angle = Math.atan2(vy, vx);
      }
      const next = city.resolve(player.x + vx * dt, player.y + vy * dt, PLAYER.footRadius);
      player.x = next.x;
      player.y = next.y;
      if (firing) fire();
    } else {
      const v = vehicles[player.carIndex];
      if (!v) {
        player.mode = 'foot';
        return;
      }
      const throttle = -move.y;
      if (throttle > 0.05) v.speed = Math.min(CAR.maxSpeed, v.speed + CAR.accel * dt);
      else if (throttle < -0.05) {
        if (v.speed > 0) v.speed = Math.max(0, v.speed - CAR.brake * dt);
        else v.speed = Math.max(-CAR.reverseSpeed, v.speed - CAR.accel * dt);
      } else if (v.speed > 0) v.speed = Math.max(0, v.speed - CAR.drag * dt);
      else v.speed = Math.min(0, v.speed + CAR.drag * dt);

      if (Math.abs(v.speed) > CAR.minTurnSpeed) {
        const sign = v.speed >= 0 ? 1 : -1;
        v.angle += move.x * CAR.turnRate * dt * sign;
      }
      const vx = Math.cos(v.angle) * v.speed;
      const vy = Math.sin(v.angle) * v.speed;
      const radius = Math.max(CAR.width, CAR.height) / 2;
      const wantX = v.x + vx * dt;
      const wantY = v.y + vy * dt;
      const next = city.resolve(wantX, wantY, radius);
      if (Math.hypot(next.x - wantX, next.y - wantY) > 2) v.speed *= 0.4;
      v.x = next.x;
      v.y = next.y;
      player.x = v.x;
      player.y = v.y;
      player.angle = v.angle;
      if (firing) fire();
    }
  }

  function updateTraffic(dt) {
    for (const v of vehicles) {
      if (!v.active || v.driver || v.parked) continue;
      if (v.laneAxis === 'row') v.x += v.laneDir * v.speed * dt;
      else v.y += v.laneDir * v.speed * dt;
      if (v.x < -CELL) v.x = WORLD + CELL;
      else if (v.x > WORLD + CELL) v.x = -CELL;
      if (v.y < -CELL) v.y = WORLD - WATER_ROWS * CELL + CELL;
      else if (v.y > WORLD - WATER_ROWS * CELL + CELL) v.y = -CELL;
    }
  }

  function updatePedestrians(dt, harmless) {
    for (const p of peds) {
      if (!p.active || !p.alive) continue;
      p.wander -= dt;
      if (p.wander <= 0) {
        const a = random() * TAU;
        p.dx = Math.cos(a);
        p.dy = Math.sin(a);
        p.wander = 1.2 + random() * 2;
      }
      const next = city.resolve(p.x + p.dx * PED.speed * dt, p.y + p.dy * PED.speed * dt, PED.radius);
      if (Math.hypot(next.x - p.x, next.y - p.y) < 0.5) p.wander = 0;
      p.x = next.x;
      p.y = next.y;
      p.angle = Math.atan2(p.dy, p.dx);

      if (!harmless && player.mode === 'car') {
        const v = vehicles[player.carIndex];
        if (v && Math.abs(v.speed) > 90 && dist(v.x, v.y, p.x, p.y) < PED.radius + Math.max(CAR.width, CAR.height) / 2) {
          p.alive = false;
          p.active = false;
          addHeat(p.isGang ? 0 : HEAT.onRamPed);
          if (p.isGang) state.eliminated += 1;
        }
      }
    }
  }

  function spawnCop() {
    const c = freeCop();
    if (!c) return;
    const point = randomOpenPoint(player.x, player.y, 420, 620, COP.radius);
    c.active = true;
    c.x = point.x;
    c.y = point.y;
    c.angle = angleTo(point.x, point.y, player.x, player.y);
    c.speed = 0;
    c.health = 40;
    c.fireCooldown = 0.6;
    c.ramCooldown = 0;
  }

  function updateCops(dt, harmless) {
    if (harmless) return;
    if (state.heat > 0) {
      state.copSpawnTimer -= dt;
      if (state.copSpawnTimer <= 0) {
        spawnCop();
        state.copSpawnTimer = Math.max(0.6, HEAT.spawnBase - HEAT.spawnPerHeat * state.heat);
      }
    } else {
      for (const c of cops) c.active = false;
    }
    const targetSpeed = COP.speed + COP.speedPerHeat * state.heat;
    for (const c of cops) {
      if (!c.active) continue;
      const target = angleTo(c.x, c.y, player.x, player.y);
      c.angle = turnToward(c.angle, target, 3.2, dt);
      c.speed = Math.min(targetSpeed, c.speed + 260 * dt);
      const next = city.resolve(c.x + Math.cos(c.angle) * c.speed * dt, c.y + Math.sin(c.angle) * c.speed * dt, COP.radius);
      c.x = next.x;
      c.y = next.y;
      const d = dist(c.x, c.y, player.x, player.y);
      if (c.ramCooldown > 0) c.ramCooldown -= dt;
      if (d < COP.contactRange && c.ramCooldown <= 0) {
        damagePlayer(COP.ramDamage);
        c.ramCooldown = 0.8;
      }
      if (c.fireCooldown > 0) c.fireCooldown -= dt;
      if (d < COP.fireRange && d > COP.contactRange && c.fireCooldown <= 0) {
        const b = freeBullet();
        if (b) {
          const spread = (random() - 0.5) * 0.12;
          const a = target + spread;
          b.active = true;
          b.owner = 'cop';
          b.x = c.x + Math.cos(a) * 16;
          b.y = c.y + Math.sin(a) * 16;
          b.vx = Math.cos(a) * COP.bulletSpeed;
          b.vy = Math.sin(a) * COP.bulletSpeed;
          b.life = COP.bulletRange / COP.bulletSpeed;
          c.fireCooldown = COP.fireCooldown;
        }
      }
    }
  }

  function updateBullets(dt, harmless) {
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || city.isBlocked(b.x, b.y, 2)) {
        b.active = false;
        continue;
      }
      if (harmless) continue;
      if (b.owner === 'player') {
        let hit = false;
        for (const p of peds) {
          if (!p.active || !p.alive) continue;
          if (dist(b.x, b.y, p.x, p.y) < PED.radius) {
            p.alive = false;
            p.active = false;
            if (p.isGang) state.eliminated += 1;
            addHeat(p.isGang ? 0.1 : HEAT.onKillPed);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const c of cops) {
            if (!c.active) continue;
            if (dist(b.x, b.y, c.x, c.y) < COP.radius) {
              c.health -= 20;
              if (c.health <= 0) {
                c.active = false;
                addHeat(HEAT.onKillCop);
              }
              hit = true;
              break;
            }
          }
        }
        if (hit) b.active = false;
      } else if (dist(b.x, b.y, player.x, player.y) < 14) {
        damagePlayer(COP.damage);
        b.active = false;
      }
    }
  }

  function updateHeat(dt) {
    if (state.heat <= 0) return;
    state.heatIdle += dt;
    if (state.heatIdle > HEAT.decayDelay) {
      state.heat = Math.max(0, state.heat - HEAT.decayPerSecond * dt);
    }
  }

  function updateMission(dt) {
    if (!state.missionReady) setupMission();
    const mission = currentMission();
    if (!mission || state.won) return 0;
    let events = 0;
    if (mission.type === 'reach') {
      if (dist(player.x, player.y, mission.marker.x, mission.marker.y) < 56) events |= completeMission();
    } else if (mission.type === 'collect') {
      for (const pickup of state.pickups) {
        if (!pickup.active) continue;
        if (dist(player.x, player.y, pickup.x, pickup.y) < PICKUP_RADIUS + 18) {
          pickup.active = false;
          state.collected += 1;
          events |= EVENT_PICKUP;
        }
      }
      if (state.collected >= mission.count) events |= completeMission();
    } else if (mission.type === 'eliminate') {
      if (state.eliminated >= mission.count) events |= completeMission();
    } else if (mission.type === 'heist') {
      if (state.stage === 'go') {
        if (dist(player.x, player.y, mission.marker.x, mission.marker.y) < 56) {
          state.stage = 'escape';
          addHeat(mission.heat);
          state.banner = 'Hit confirmed - get clear!';
          state.bannerTimer = 2.4;
        }
      } else if (dist(player.x, player.y, mission.escape.x, mission.escape.y) < 56) {
        events |= completeMission();
      }
    }
    return events;
  }

  /**
   * One fixed step. `input` is { move: {x, y}, firing, enter }. With `harmless` set (the title
   * screen's backdrop) the city still lives and breathes but nothing touches or scores against
   * the player.
   */
  function step(dt, input, harmless) {
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    let events = 0;
    updatePlayer(dt, input.move, input.firing, input.enter, harmless);
    updateTraffic(dt);
    updatePedestrians(dt, harmless);
    updateCops(dt, harmless);
    updateBullets(dt, harmless);
    if (!harmless) {
      updateHeat(dt);
      events |= updateMission(dt);
      if (player.hurtTimer > 0.25) events |= EVENT_HIT;
      if (player.health <= 0) {
        if (!state.downFired) {
          state.downFired = true;
          events |= EVENT_DOWN;
        }
      } else {
        state.downFired = false;
      }
    }
    return events;
  }

  // Used only by the screenshot stager, to put a believable chase or a finished job on screen
  // without hoping a scripted autopilot shoots and drives its way there by chance.
  function debugForceHeat(level) {
    state.heat = level;
    state.heatIdle = 0;
    for (let i = 0; i < 2; i += 1) spawnCop();
  }
  function debugForceWin() {
    state.missionIndex = MISSIONS.length - 1;
    state.missionReady = false;
    const mission = MISSIONS[MISSIONS.length - 1];
    player.x = mission.escape.x;
    player.y = mission.escape.y;
    state.stage = 'escape';
    completeMission();
  }

  reset();
  return {
    state, city, reset, respawn, step, currentMission,
    debugForceHeat, debugForceWin,
  };
}
