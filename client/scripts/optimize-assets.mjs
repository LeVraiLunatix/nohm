/**
 * One-off, idempotent optimizer for the oversized raster art under `public/`.
 *
 * A few of the game wordmarks/icons shipped as full-resolution 24-bit PNGs (the Clash Royale
 * wordmark alone was ~940 kB for something the UI never renders wider than ~300 px). This
 * downscales each to a sane ceiling for a 3x phone display and re-encodes as a palette PNG,
 * in place, keeping the same filenames so every `publicAsset('...')` reference stays valid.
 *
 * Run with `npm run assets:optimize -w client`. Safe to re-run: a file already at or below its
 * target is skipped.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** longest-edge ceiling in CSS px * 3 (retina headroom) for how each asset is actually rendered. */
const TARGETS = [
  { file: 'clash-royale/wordmark.png', maxEdge: 800 },
  { file: 'clash-of-clans/wordmark.png', maxEdge: 800 },
  { file: 'clash-of-clans/app-icon.png', maxEdge: 256 },
  { file: 'clash-of-clans/war-icon.png', maxEdge: 160 },
  { file: 'clash-of-clans/capital-gold-icon.png', maxEdge: 128 },
  { file: 'clash-of-clans/raid-weekend-icon.png', maxEdge: 128 },
  { file: 'clash-of-clans/raid-attack-icon.png', maxEdge: 128 },
  { file: 'clash-of-clans/star-icon.png', maxEdge: 128 },
  { file: 'minecraft/mark.png', maxEdge: 160 },
  { file: 'rocket-league/icon.png', maxEdge: 160 },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

let before = 0;
let after = 0;

for (const { file, maxEdge } of TARGETS) {
  const abs = path.join(publicDir, file);
  let original;
  try {
    original = await readFile(abs);
  } catch {
    console.warn(`skip (missing): ${file}`);
    continue;
  }

  const optimized = await sharp(original)
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

  before += original.length;

  if (optimized.length >= original.length) {
    after += original.length;
    console.log(`keep      ${file.padEnd(38)} ${kb(original.length)} (already optimal)`);
    continue;
  }

  await writeFile(abs, optimized);
  after += optimized.length;
  const saved = ((1 - optimized.length / original.length) * 100).toFixed(0);
  console.log(`optimized ${file.padEnd(38)} ${kb(original.length).padStart(9)} -> ${kb(optimized.length).padStart(9)}  (-${saved}%)`);
}

console.log(`\ntotal ${kb(before)} -> ${kb(after)}  (saved ${kb(before - after)})`);
