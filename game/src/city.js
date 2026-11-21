// Solis, procedurally laid out: an orthogonal street grid over a GRID x GRID cell field, a
// harbour along the south edge, and five districts with their own palette. Generation is a pure
// function of the seed, so the same seed always builds the same city. Buildings are one per
// non-road, non-water cell (inset for a sidewalk margin), which keeps both drawing and collision
// a plain per-cell lookup: nothing here needs a spatial index.
import { BLOCK_PERIOD, CELL, DISTRICTS, GRID, WATER_ROWS, WORLD } from './config.js';
import { createRandom } from './random.js';

/** A cheap, deterministic hash of (seed, x, y) folded into [0, 1), used to vary one cell. */
function cellRandom(seed, x, y) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ y, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

export function isWaterCell(cx, cy) {
  return cy >= GRID - WATER_ROWS;
}

export function isRoadCell(cx, cy) {
  if (isWaterCell(cx, cy)) return false;
  return cx % BLOCK_PERIOD === 0 || cy % BLOCK_PERIOD === 0 || cx === 0 || cy === 0 || cx === GRID - 1;
}

export function districtAt(cx, cy) {
  if (isWaterCell(cx, cy)) return 'portside';
  const nx = cx / GRID;
  const ny = cy / GRID;
  if (nx > 0.32 && nx < 0.68 && ny > 0.26 && ny < 0.6) return 'core';
  if (ny > (GRID - WATER_ROWS - 6) / GRID) return 'portside';
  if (nx < 0.5 && ny < 0.5) return 'mesa';
  if (nx >= 0.5 && ny < 0.5) return 'goldrow';
  return 'ashfield';
}

export function buildCity(seed) {
  const random = createRandom(seed);
  const buildings = [];
  const cellInfo = new Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy += 1) {
    for (let cx = 0; cx < GRID; cx += 1) {
      const water = isWaterCell(cx, cy);
      const road = !water && isRoadCell(cx, cy);
      const district = districtAt(cx, cy);
      const index = cy * GRID + cx;
      if (!water && !road) {
        const palette = DISTRICTS[district].building;
        const r = cellRandom(seed, cx, cy);
        const color = palette[Math.floor(r * palette.length) % palette.length];
        const margin = 8 + Math.floor(cellRandom(seed, cx + 97, cy + 13) * 10);
        const height = 10 + cellRandom(seed, cx + 5, cy + 5) * 26;
        const building = {
          x: cx * CELL + margin,
          y: cy * CELL + margin,
          w: CELL - margin * 2,
          h: CELL - margin * 2,
          color,
          height,
          cx,
          cy,
        };
        buildings.push(building);
        cellInfo[index] = { water, road, district, solid: true, building };
      } else {
        cellInfo[index] = { water, road, district, solid: water, building: null };
      }
    }
  }

  // Lanes for ambient traffic: one per road row/column, with a fixed travel direction so cars
  // never need to negotiate with each other.
  const laneRows = [];
  const laneCols = [];
  for (let cy = 0; cy < GRID; cy += 1) if (cy % BLOCK_PERIOD === 0 && !isWaterCell(0, cy)) laneRows.push({ cy, dir: cy % (BLOCK_PERIOD * 2) === 0 ? 1 : -1 });
  for (let cx = 0; cx < GRID; cx += 1) if (cx % BLOCK_PERIOD === 0) laneCols.push({ cx, dir: cx % (BLOCK_PERIOD * 2) === 0 ? -1 : 1 });

  function cellAt(worldX, worldY) {
    const cx = Math.floor(worldX / CELL);
    const cy = Math.floor(worldY / CELL);
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return { water: true, road: false, district: 'portside', solid: true, building: null };
    return cellInfo[cy * GRID + cx];
  }

  /** Whether a circle at (x, y) with this radius overlaps any solid cell (building or water). */
  function isBlocked(x, y, radius) {
    if (x - radius < 0 || y - radius < 0 || x + radius >= WORLD || y + radius >= WORLD - WATER_ROWS * CELL) {
      if (y + radius >= WORLD - WATER_ROWS * CELL) return true;
      if (x - radius < 0 || y - radius < 0 || x + radius >= WORLD) return true;
    }
    const minCx = Math.floor((x - radius) / CELL);
    const maxCx = Math.floor((x + radius) / CELL);
    const minCy = Math.floor((y - radius) / CELL);
    const maxCy = Math.floor((y + radius) / CELL);
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const cell = cellAt(cx * CELL, cy * CELL);
        if (!cell.solid) continue;
        const nearX = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL));
        const nearY = Math.max(cy * CELL, Math.min(y, cy * CELL + CELL));
        const dx = x - nearX;
        const dy = y - nearY;
        if (dx * dx + dy * dy < radius * radius) return true;
      }
    }
    return false;
  }

  /** Push (x, y) out of any solid cell it has strayed into; used after each move. */
  function resolve(x, y, radius) {
    let px = x;
    let py = y;
    for (let pass = 0; pass < 3; pass += 1) {
      const cx = Math.floor(px / CELL);
      const cy = Math.floor(py / CELL);
      let moved = false;
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
          const cell = cellAt(gx * CELL, gy * CELL);
          if (!cell.solid) continue;
          const left = gx * CELL;
          const top = gy * CELL;
          const nearX = Math.max(left, Math.min(px, left + CELL));
          const nearY = Math.max(top, Math.min(py, top + CELL));
          let dx = px - nearX;
          let dy = py - nearY;
          const distSq = dx * dx + dy * dy;
          if (distSq >= radius * radius) continue;
          const dist = Math.sqrt(distSq) || 0.0001;
          dx /= dist;
          dy /= dist;
          px = nearX + dx * radius;
          py = nearY + dy * radius;
          moved = true;
        }
      }
      if (!moved) break;
    }
    px = Math.max(radius, Math.min(WORLD - radius, px));
    py = Math.max(radius, Math.min(WORLD - WATER_ROWS * CELL - radius, py));
    return { x: px, y: py };
  }

  return { seed, buildings, laneRows, laneCols, cellAt, isBlocked, resolve, bounds: { width: WORLD, height: WORLD } };
}
