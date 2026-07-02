// Unit test for the persistent store (series presets + defaults) and the
// buildSmartConfig precedence: explicit args > series preset > defaults.
// Uses CLICKTHUMB_HOME to sandbox the store in a temp directory (no browser needed).
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.CLICKTHUMB_HOME = await mkdtemp(path.join(os.tmpdir(), 'clickthumb-store-'));

// Import AFTER setting CLICKTHUMB_HOME (store.js reads it at module load).
const { setDefaults, getDefaults, saveSeries, getSeries, listSeries } = await import('../src/store.js');
const { buildSmartConfig } = await import('../src/render.js');

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fail++;
};

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const FAVICON = path.resolve(__dirname, '..', '..', 'favicon.png');

// 1) defaults: set + read back
await setDefaults({ logoPath: FAVICON, handle: '@procpa' });
const defaults = await getDefaults();
check('defaults saved (logoPath, handle)', defaults.logoPath === FAVICON && defaults.handle === '@procpa');

// 2) series: save copies the background bytes into the store
const entry = await saveSeries('재무제표 읽기', { backgroundDataUrl: TINY_PNG, theme: 'forest', tag: 'FINANCE' });
check('series saved with copied image', !!entry.imagePath && (await stat(entry.imagePath)).size > 0, entry.imagePath);
check('series listed', Object.keys(await listSeries()).includes('재무제표 읽기'));

// 3) buildSmartConfig reuses the series background + theme + tag, applies default logo/handle
const cfg1 = await buildSmartConfig({ title: '2편', seriesName: '재무제표 읽기' });
check('series background reused', typeof cfg1.backgroundImage === 'string' && cfg1.backgroundImage.startsWith('data:image/png'));
check('series theme reused', cfg1.theme === 'forest');
check('series tag reused', cfg1.series === 'FINANCE');
check('default logo applied', typeof cfg1.logo === 'string' && cfg1.logo.startsWith('data:image/png'));
check('default handle applied', cfg1.handle === '@procpa');

// 4) explicit args override the preset
const cfg2 = await buildSmartConfig({ title: '2편', seriesName: '재무제표 읽기', theme: 'warm', tag: 'DEV', handle: '@other' });
check('explicit theme overrides preset', cfg2.theme === 'warm');
check('explicit tag overrides preset', cfg2.series === 'DEV');
check('explicit handle overrides default', cfg2.handle === '@other');

// 5) a missing default-logo file is skipped silently (render must not fail)
await setDefaults({ logoPath: '/nonexistent/logo.png' });
const cfg3 = await buildSmartConfig({ title: 't' });
check('missing default logo skipped', cfg3.logo === null);

// 6) empty string removes a default
await setDefaults({ logoPath: '' });
check('empty string removes default', (await getDefaults()).logoPath === undefined);

// 7) unknown series -> no background, no crash
const cfg4 = await buildSmartConfig({ title: 't', seriesName: '없는시리즈' });
check('unknown series is harmless', cfg4.backgroundImage === null);

console.log(fail === 0 ? '\n🎉 스토어/시리즈 테스트 통과' : `\n⚠️ ${fail}개 실패`);
process.exit(fail ? 1 : 0);
