// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. The game in game/ is Solis: an original
// top-down open-world crime game in plain Canvas 2D. Solis is a procedurally laid-out city of
// five districts around a harbour; on foot or behind the wheel of a jacked car, you run a
// five-job chain for a fixer named Reyes while the heat you draw brings Solis PD down on you,
// with cash, health, ammo, a minimap and title, pause, down and win screens.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossierText = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossierText);

// A short, human-readable summary on stdout: what shipped and where, for whoever ran this by hand.
const dossier = JSON.parse(Buffer.from(dossierText).toString()) as {
  game?: { files?: number; bytes?: number };
  screenshots?: Array<{ name?: string }>;
};
console.log(`Solis: wrote ${out}`);
console.log(`  game/        ${dossier.game?.files ?? '?'} files, ${dossier.game?.bytes ?? '?'} bytes`);
console.log(`  screenshots/ ${dossier.screenshots?.length ?? 0} image(s): ${(dossier.screenshots ?? []).map((s) => s.name).join(', ') || '(none)'}`);
console.log(`  dossier.json ${dossierText.byteLength} bytes`);
