// Drawing only: the world's state and the current screen in, pixels out. A camera follows the
// player through the city; the 1280x720 viewport is then scaled to fit the window and centred.
// Flat rectangles and circles, canvas text for the HUD, minimap and panels.
import { CELL, DISTRICTS, FIELD, FONT, GRID, PALETTE, PLAYER, WATER_ROWS, WORLD } from './config.js';
import { districtAt, isRoadCell, isWaterCell } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DOWN = 'down';
export const SCREEN_WIN = 'win';

const PANEL = { width: 620, top: 128, line: 32, bottom: 68 };
const MINI = { size: 170, margin: 18, scale: 170 / WORLD };

export function createRenderer(canvas, city) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const camera = { x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function worldToScreen(x, y) {
    return { x: x - camera.x, y: y - camera.y };
  }

  function drawGround() {
    const minCx = Math.max(0, Math.floor(camera.x / CELL) - 1);
    const maxCx = Math.min(GRID - 1, Math.ceil((camera.x + FIELD.width) / CELL) + 1);
    const minCy = Math.max(0, Math.floor(camera.y / CELL) - 1);
    const maxCy = Math.min(GRID - 1, Math.ceil((camera.y + FIELD.height) / CELL) + 1);
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const sx = cx * CELL - camera.x;
        const sy = cy * CELL - camera.y;
        if (isWaterCell(cx, cy)) {
          context.fillStyle = PALETTE.water;
          context.fillRect(sx, sy, CELL, CELL);
          continue;
        }
        const district = DISTRICTS[districtAt(cx, cy)];
        const road = isRoadCell(cx, cy);
        context.fillStyle = road ? PALETTE.road : district.ground;
        context.fillRect(sx, sy, CELL, CELL);
        if (road) {
          context.strokeStyle = PALETTE.laneLine;
          context.lineWidth = 2;
          context.setLineDash([10, 10]);
          context.beginPath();
          if (cy % 4 === 0) {
            context.moveTo(sx, sy + CELL / 2);
            context.lineTo(sx + CELL, sy + CELL / 2);
          } else {
            context.moveTo(sx + CELL / 2, sy);
            context.lineTo(sx + CELL / 2, sy + CELL);
          }
          context.stroke();
          context.setLineDash([]);
        }
      }
    }
    // The harbour's waterline, drawn once along the coast edge within view.
    const waterY = WORLD - WATER_ROWS * CELL - camera.y;
    if (waterY > -4 && waterY < FIELD.height + 4) {
      context.strokeStyle = PALETTE.waterLine;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, waterY);
      context.lineTo(FIELD.width, waterY);
      context.stroke();
    }
  }

  function drawBuildings() {
    for (const b of city.buildings) {
      if (b.x + b.w < camera.x || b.x > camera.x + FIELD.width) continue;
      if (b.y + b.h < camera.y || b.y > camera.y + FIELD.height) continue;
      const sx = b.x - camera.x;
      const sy = b.y - camera.y;
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(sx + 3, sy + 3, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(sx, sy, b.w, b.h);
    }
  }

  function drawMarker(x, y, color, label) {
    const s = worldToScreen(x, y);
    if (s.x < -80 || s.x > FIELD.width + 80 || s.y < -80 || s.y > FIELD.height + 80) return;
    const pulse = 10 + Math.sin(performance.now() / 180) * 4;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(s.x, s.y, 26 + pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(s.x, s.y - 54);
    context.lineTo(s.x - 9, s.y - 38);
    context.lineTo(s.x + 9, s.y - 38);
    context.closePath();
    context.fill();
    if (label) text(label, s.x, s.y - 60, 16, color, 'center');
  }

  function drawVehicle(v, color, isCop) {
    const s = worldToScreen(v.x, v.y);
    if (s.x < -60 || s.x > FIELD.width + 60 || s.y < -60 || s.y > FIELD.height + 60) return;
    context.save();
    context.translate(s.x, s.y);
    context.rotate(v.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-23, -13, 46, 26);
    context.fillStyle = color;
    context.fillRect(-23, -13, 46, 26);
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(-6, -10, 14, 20);
    context.restore();
    if (isCop) {
      const on = Math.floor(performance.now() / 180) % 2 === 0;
      context.fillStyle = on ? PALETTE.copLight : PALETTE.copLight2;
      context.beginPath();
      context.arc(s.x, s.y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPed(p) {
    const s = worldToScreen(p.x, p.y);
    if (s.x < -30 || s.x > FIELD.width + 30 || s.y < -30 || s.y > FIELD.height + 30) return;
    context.fillStyle = p.isGang ? PALETTE.gang : PALETTE.ped;
    context.beginPath();
    context.arc(s.x, s.y, 10, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.4)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(s.x, s.y);
    context.lineTo(s.x + Math.cos(p.angle) * 12, s.y + Math.sin(p.angle) * 12);
    context.stroke();
  }

  function drawBullet(b) {
    const s = worldToScreen(b.x, b.y);
    context.fillStyle = b.owner === 'player' ? PALETTE.bulletPlayer : PALETTE.bulletCop;
    context.beginPath();
    context.arc(s.x, s.y, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state) {
    const s = worldToScreen(state.player.x, state.player.y);
    const hurt = state.player.hurtTimer > 0 && Math.floor(performance.now() / 70) % 2 === 0;
    if (state.player.mode === 'car') {
      const v = state.vehicles[state.player.carIndex];
      if (v) drawVehicle(v, hurt ? '#ff8a65' : PALETTE.player, false);
      return;
    }
    context.fillStyle = hurt ? '#ff8a65' : PALETTE.player;
    context.beginPath();
    context.arc(s.x, s.y, PLAYER.footRadius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.playerGun;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(s.x, s.y);
    context.lineTo(s.x + Math.cos(state.player.angle) * 20, s.y + Math.sin(state.player.angle) * 20);
    context.stroke();
  }

  function missionTarget(mission, state) {
    if (!mission) return null;
    if (mission.type === 'reach') return mission.marker;
    if (mission.type === 'heist') return state.stage === 'go' ? mission.marker : mission.escape;
    return null;
  }

  function drawWorld(state, mission) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawGround();
    drawBuildings();
    const target = missionTarget(mission, state);
    if (target) drawMarker(target.x, target.y, state.stage === 'escape' ? PALETTE.markerEscape : PALETTE.marker, state.stage === 'escape' ? 'ESCAPE' : 'JOB');
    if (mission && mission.type === 'collect') {
      for (const pickup of state.pickups) if (pickup.active) drawMarker(pickup.x, pickup.y, PALETTE.cash, null);
    }
    for (const v of state.vehicles) if (v.active && v.driver !== 'player') drawVehicle(v, v.color, false);
    for (const p of state.peds) if (p.active && p.alive) drawPed(p);
    for (const c of state.cops) if (c.active) drawVehicle(c, PALETTE.cop, true);
    for (const b of state.bullets) if (b.active) drawBullet(b);
    drawPlayer(state);
  }

  function drawBar(x, y, w, h, fraction, color) {
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.fillRect(x, y, w, h);
    context.fillStyle = color;
    context.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
    context.strokeStyle = PALETTE.panelBorder;
    context.strokeRect(x, y, w, h);
  }

  function drawHud(state, mission) {
    context.textBaseline = 'top';
    drawBar(24, 20, 180, 16, state.player.health / PLAYER.maxHealth, PALETTE.health);
    text('HEALTH', 24, 40, 12, PALETTE.muted, 'left');
    drawBar(24, 60, 180, 10, state.player.ammo / PLAYER.maxAmmo, '#cfd6e4');
    text('AMMO', 24, 73, 11, PALETTE.muted, 'left');
    text(`$${Math.floor(state.cash)}`, 24, 96, 26, PALETTE.cash, 'left');

    for (let i = 0; i < 5; i += 1) {
      context.fillStyle = i < Math.ceil(state.heat) ? PALETTE.cop : 'rgba(255,255,255,0.15)';
      context.beginPath();
      const cx = FIELD.width - 24 - (4 - i) * 22;
      context.moveTo(cx, 22);
      for (let k = 1; k < 5; k += 1) {
        const a = (Math.PI * 2 * k) / 5 - Math.PI / 2;
        context.lineTo(cx + Math.cos(a) * 9, 31 + Math.sin(a) * 9);
      }
      context.closePath();
      context.fill();
    }

    if (mission) {
      text(mission.title.toUpperCase(), FIELD.width / 2, 18, 16, PALETTE.marker, 'center');
      const objective = mission.type === 'collect'
        ? `Stashes ${state.collected}/${mission.count}`
        : mission.type === 'eliminate'
          ? `Crew down ${state.eliminated}/${mission.count}`
          : mission.type === 'heist'
            ? (state.stage === 'go' ? 'Reach the job marker' : 'Reach the escape marker')
            : 'Reach the marker';
      text(objective, FIELD.width / 2, 40, 18, PALETTE.text, 'center');
    } else {
      text('FREE ROAM - SOLIS IS YOURS', FIELD.width / 2, 24, 18, PALETTE.marker, 'center');
    }
    if (state.bannerTimer > 0) {
      context.globalAlpha = Math.min(1, state.bannerTimer);
      text(state.banner, FIELD.width / 2, 70, 22, PALETTE.text, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawMinimap(state, mission) {
    const x = FIELD.width - MINI.size - MINI.margin;
    const y = FIELD.height - MINI.size - MINI.margin;
    context.fillStyle = 'rgba(10,12,18,0.72)';
    context.fillRect(x, y, MINI.size, MINI.size);
    context.strokeStyle = PALETTE.panelBorder;
    context.strokeRect(x, y, MINI.size, MINI.size);
    const map = (wx, wy) => ({ x: x + wx * MINI.scale, y: y + wy * MINI.scale });
    const target = missionTarget(mission, state);
    if (target) {
      const m = map(target.x, target.y);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(m.x, m.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    for (const c of state.cops) {
      if (!c.active) continue;
      const m = map(c.x, c.y);
      context.fillStyle = PALETTE.copLight;
      context.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }
    const p = map(state.player.x, state.player.y);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y, 4, 0, Math.PI * 2);
    context.fill();
  }

  function drawPanel(title, lines, prompt, color) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelBorder;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, color || PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 22, PALETTE.marker, 'center');
  }

  const TITLE_LINES = [
    'Solis never sleeps, and it never forgets a face.',
    'WASD/Arrows move. E jacks or leaves a car. Space fires.',
    'Five jobs from Reyes stand between you and the city.',
  ];

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, mission) {
    camera.x = Math.max(0, Math.min(WORLD - FIELD.width, state.player.x - FIELD.width / 2));
    camera.y = Math.max(0, Math.min(WORLD - FIELD.height, state.player.y - FIELD.height / 2));

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    drawWorld(state, mission);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLIS', TITLE_LINES, 'Press Enter or click to start', PALETTE.marker);
      return;
    }
    drawHud(state, mission);
    drawMinimap(state, mission);
    if (screen === SCREEN_PAUSED) drawPanel('On Hold', ['The city keeps turning without you.'], 'Press P or Enter to resume', PALETTE.text);
    else if (screen === SCREEN_DOWN) {
      drawPanel('Down And Out', [`Banked so far: $${Math.floor(state.cash)}`, 'Reyes drags you out before the sirens arrive.'], 'Press Enter to get back up', '#ff8a65');
    } else if (screen === SCREEN_WIN) {
      drawPanel('Solis Is Yours', [`Final take: $${Math.floor(state.cash)}`, 'Every job Reyes had is done. The city is quiet.'], 'Press Enter to keep roaming', PALETTE.marker);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
