// Build configs from tool args, render, and write the output file.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULTS, ASPECTS } from './config.js';
import { imageToDataUrl } from './image.js';
import { renderConfig } from './browser.js';

const MIME_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('렌더 결과가 올바른 data URL이 아닙니다.');
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

/** Merge the simplified smart_thumbnail args into a full config. */
export async function buildSmartConfig(args) {
  const aspect = ASPECTS[args.aspect || '16:9'] || ASPECTS['16:9'];
  const backgroundImage = await imageToDataUrl({ imagePath: args.imagePath, imageUrl: args.imageUrl });
  return {
    ...DEFAULTS,
    ...aspect,
    series: args.tag !== undefined ? args.tag : DEFAULTS.series,
    title: args.title,
    subtitle: args.subtitle !== undefined ? args.subtitle : '',
    theme: args.theme,
    handle: args.handle,
    badge: args.badge,
    highlightKeywords: args.highlightKeywords || [],
    highlightMode: args.highlightMode || 'marker',
    backgroundImage,
    exportScale: args.scale || 2,
    exportFormat: args.format || 'webp'
  };
}

/** Merge full manual config (generate_thumbnail) over defaults. */
export async function buildManualConfig(args) {
  const cfg = { ...DEFAULTS, ...(args.config || {}) };
  if (args.config && (args.config.imagePath || args.config.imageUrl)) {
    cfg.backgroundImage = await imageToDataUrl({
      imagePath: args.config.imagePath,
      imageUrl: args.config.imageUrl
    });
  }
  if (args.scale) cfg.exportScale = args.scale;
  if (args.format) cfg.exportFormat = args.format;
  return cfg;
}

/**
 * Render a config and save to outputPath.
 * @returns {Promise<{savedPath, width, height, format, buffer}>}
 */
export async function renderAndSave(config, outputPath, { smart }) {
  const scale = parseInt(config.exportScale, 10) || 2;
  const format = config.exportFormat || 'webp';

  const dataUrl = await renderConfig(config, { smart, scale, format });
  const { buffer } = dataUrlToBuffer(dataUrl);

  // Resolve / normalize output path, ensure extension matches format.
  let out = path.resolve(outputPath);
  const wantExt = '.' + (MIME_EXT[format] || format);
  if (path.extname(out).toLowerCase() !== wantExt) out += wantExt;

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buffer);

  return {
    savedPath: out,
    width: Math.round((parseInt(config.width, 10) || 1280) * scale),
    height: Math.round((parseInt(config.height, 10) || 720) * scale),
    format,
    buffer
  };
}
