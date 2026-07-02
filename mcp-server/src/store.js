// Persistent memory (~/.clickthumb): series presets + user defaults (logo, handle).
// Series presets let the AI reuse the exact same background image for a series;
// defaults are applied to every smart_thumbnail unless overridden.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const STORE_DIR = process.env.CLICKTHUMB_HOME || path.join(os.homedir(), '.clickthumb');
const STORE_FILE = path.join(STORE_DIR, 'store.json');
const IMAGES_DIR = path.join(STORE_DIR, 'series-images');

const EXT_BY_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/bmp': '.bmp', 'image/svg+xml': '.svg'
};

async function load() {
  try { return JSON.parse(await readFile(STORE_FILE, 'utf8')); }
  catch { return { defaults: {}, series: {} }; }
}

async function persist(store) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

export async function getDefaults() {
  return (await load()).defaults || {};
}

/** Merge patch into defaults; empty-string values delete the key. */
export async function setDefaults(patch = {}) {
  const store = await load();
  store.defaults = { ...(store.defaults || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null || v === '') delete store.defaults[k];
    else store.defaults[k] = v;
  }
  await persist(store);
  return store.defaults;
}

export async function getSeries(name) {
  if (!name) return null;
  return (await load()).series?.[name] || null;
}

export async function listSeries() {
  return (await load()).series || {};
}

export async function deleteSeries(name) {
  const store = await load();
  const existed = !!store.series?.[name];
  if (existed) { delete store.series[name]; await persist(store); }
  return existed;
}

/**
 * Save/update a series preset. The background is persisted as a copy under
 * ~/.clickthumb/series-images so the original file can move or disappear.
 */
export async function saveSeries(name, { backgroundDataUrl, theme, tag } = {}) {
  if (!name) return null;
  const store = await load();
  const entry = { ...(store.series?.[name] || {}) };

  if (backgroundDataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(backgroundDataUrl);
    if (m) {
      await mkdir(IMAGES_DIR, { recursive: true });
      const slug = name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'series';
      const file = path.join(IMAGES_DIR, slug + (EXT_BY_MIME[m[1].split(';')[0]] || '.png'));
      await writeFile(file, Buffer.from(m[2], 'base64'));
      entry.imagePath = file;
    }
  }
  if (theme) entry.theme = theme;
  if (tag !== undefined && tag !== null) entry.tag = tag;
  entry.updatedAt = new Date().toISOString();

  store.series = store.series || {};
  store.series[name] = entry;
  await persist(store);
  return entry;
}
