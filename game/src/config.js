// Every tuning number, colour and piece of game data in one place. The viewport is a fixed
// 1280x720 logical window (the renderer scales it to the window, so nothing below depends on the
// screen size); the city itself is much larger and the camera follows the player through it.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const CELL = 64;
export const GRID = 40;
export const WORLD = CELL * GRID;
/** How many cells make one block: a road runs along every line that is a multiple of this. */
export const BLOCK_PERIOD = 4;
/** Rows from the south edge that are harbour water, not land. */
export const WATER_ROWS = 4;

export const PLAYER = {
  footSpeed: 210,
  footRadius: 13,
  maxHealth: 100,
  healthRegenDelay: 4,
  healthRegenRate: 4,
  fireCooldown: 0.22,
  bulletSpeed: 780,
  bulletRange: 460,
  maxAmmo: 36,
  ammoRegenRate: 1.4,
  enterRange: 46,
};

export const CAR = {
  width: 46,
  height: 26,
  maxSpeed: 430,
  reverseSpeed: 150,
  accel: 300,
  brake: 560,
  drag: 70,
  turnRate: 3.1,
  minTurnSpeed: 18,
  ramDamage: 26,
};

export const PED = { radius: 11, speed: 60, count: 22, wanderRadius: 150 };
export const TRAFFIC = { count: 12, speed: 150 };
export const COP = {
  pool: 10,
  speed: 250,
  speedPerHeat: 24,
  radius: 12,
  fireRange: 300,
  fireCooldown: 0.9,
  bulletSpeed: 620,
  bulletRange: 320,
  damage: 7,
  ramDamage: 14,
  contactRange: 30,
};

export const BULLET_POOL = 48;

export const HEAT = {
  max: 5,
  decayPerSecond: 0.07,
  decayDelay: 2.5,
  spawnBase: 3.2,
  spawnPerHeat: 0.55,
  onKillPed: 0.65,
  onRamPed: 0.3,
  onKillCop: 1.3,
};

/** Cash and health pickups, mission stashes: small circles the player walks through. */
export const PICKUP_RADIUS = 16;

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First Job',
    brief: 'REYES: Grab wheels and get to the depot marker north of here.',
    type: 'reach',
    reward: 300,
    marker: { x: 10 * CELL, y: 6 * CELL },
  },
  {
    id: 'supply-run',
    title: 'Supply Run',
    brief: 'REYES: Three stashes are hidden around Mesa Alta. Collect all of them.',
    type: 'collect',
    count: 3,
    reward: 450,
    pickups: [
      { x: 6 * CELL, y: 10 * CELL },
      { x: 14 * CELL, y: 14 * CELL },
      { x: 9 * CELL, y: 18 * CELL },
    ],
  },
  {
    id: 'the-vault',
    title: 'The Vault',
    brief: 'REYES: Hit the Core Solis vault, then burn clear before the heat catches up.',
    type: 'heist',
    reward: 900,
    marker: { x: 20 * CELL, y: 18 * CELL },
    escape: { x: 28 * CELL, y: 10 * CELL },
    heat: 3,
  },
  {
    id: 'turf-war',
    title: 'Turf War',
    brief: 'REYES: The Driftwood Crew needs reminding whose streets these are. Drop five.',
    type: 'eliminate',
    count: 5,
    reward: 600,
    area: { x: 9 * CELL, y: 29 * CELL, radius: 7 * CELL },
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    brief: 'REYES: One last run. Hit the marker, then lose everyone on your tail at the safehouse.',
    type: 'heist',
    reward: 1500,
    final: true,
    marker: { x: 30 * CELL, y: 26 * CELL },
    escape: { x: 4 * CELL, y: 4 * CELL },
    heat: 5,
  },
];

export const DISTRICTS = {
  core: { name: 'Core Solis', ground: '#2c313d', building: ['#44506b', '#3b4459', '#505d7c'], accent: '#7fa8ff' },
  mesa: { name: 'Mesa Alta', ground: '#333324', building: ['#a9784f', '#8f6a47', '#c08f5e'], accent: '#e8b06a' },
  goldrow: { name: 'Gold Row', ground: '#2e2436', building: ['#8a4f8f', '#6e3d78', '#a9639f'], accent: '#f2c94c' },
  ashfield: { name: 'Ashfield', ground: '#2a2a22', building: ['#6b6248', '#58523c', '#7c6a3e'], accent: '#c9a227' },
  portside: { name: 'Portside', ground: '#263238', building: ['#3f6b6e', '#345a5c', '#4d8285'], accent: '#5fd0c7' },
};

export const PALETTE = {
  backdrop: '#0b0d12',
  water: '#1b3a4a',
  waterLine: '#2a5468',
  road: '#1d2027',
  laneLine: '#3a3f4b',
  sidewalk: '#262a33',
  player: '#4fc3f7',
  playerGun: '#e8edf5',
  cop: '#2b55c7',
  copLight: '#ef4b4b',
  copLight2: '#4b7bef',
  traffic: '#9aa3b2',
  ped: '#d8c9a3',
  gang: '#d9534f',
  bulletPlayer: '#fff3c4',
  bulletCop: '#ff8a65',
  cash: '#f2c94c',
  health: '#3fcf6e',
  panel: '#1a1d26',
  panelBorder: '#30374a',
  text: '#eef1f5',
  muted: '#8b93a3',
  marker: '#f2c94c',
  markerEscape: '#5fd0c7',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress (best cash banked) is kept between visits (this browser only). */
export const BEST_KEY = 'solis-crime.best';
