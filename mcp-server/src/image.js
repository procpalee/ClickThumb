// Convert a local image path or remote URL into a data URL.
// data URLs keep the canvas un-tainted so dom-to-image / brightness analysis work.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

export async function imageToDataUrl({ imagePath, imageUrl } = {}) {
  if (imagePath) {
    // Already a data URL? pass through.
    if (imagePath.startsWith('data:')) return imagePath;
    const buf = await readFile(imagePath);
    const mime = EXT_MIME[path.extname(imagePath).toLowerCase()] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  if (imageUrl) {
    if (imageUrl.startsWith('data:')) return imageUrl;
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`이미지를 불러오지 못했습니다 (${res.status}): ${imageUrl}`);
    const mime = res.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  return null;
}
