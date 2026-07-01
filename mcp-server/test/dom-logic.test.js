// DOM-level test of the in-page window.ClickThumb orchestration using jsdom.
// NOTE: jsdom has no layout engine or canvas, so fitText (needs scrollHeight)
// and analyzeBrightness (needs canvas) are no-ops/caught here. This verifies
// the config application, theme, badge, watermark and highlight logic.
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fail++;
};

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;

// Wait a tick for the inline script to define window.ClickThumb.
await new Promise(r => setTimeout(r, 200));

check('window.ClickThumb defined', !!window.ClickThumb);
check('THEMES present (5)', window.ClickThumb && Object.keys(window.ClickThumb.THEMES).length === 5);

// Simplified UI: advanced controls live inside a collapsed <details>, IDs intact.
check('advanced settings panel exists', !!window.document.getElementById('advanced-settings'));
check('auto background button exists', !!window.document.getElementById('auto-bg-btn'));
check('autoBackground API exposed', typeof window.ClickThumb.autoBackground === 'function');
// Do NOT invoke autoBackground here: jsdom has no fetch/canvas.

// Run smart layout (no bg image -> skips brightness/canvas).
await window.ClickThumb.smartLayout({
  series: 'GUIDE',
  title: '스마트 배치 테스트 제목',
  subtitle: '부제 설명입니다',
  theme: 'berry',
  handle: '@procpa',
  badge: 'TOP 5',
  highlightKeywords: ['제목'],
  highlightMode: 'marker'
});

const doc = window.document;
check('title input applied', doc.getElementById('title').value === '스마트 배치 테스트 제목');
check('theme bg-start applied (berry #7c3aed)', doc.getElementById('color-bg-start').value === '#7c3aed');
check('white text forced', doc.getElementById('color-text-title').value === '#ffffff');
check('overlay set for gradient bg (12)', doc.getElementById('overlay-opacity').value === '12');

const badge = doc.getElementById('preview-badge');
check('badge text + visible', badge.textContent === 'TOP 5' && badge.style.display === 'block');

const wm = doc.getElementById('preview-watermark');
check('watermark text + visible', wm.textContent.includes('@procpa') && wm.style.display === 'flex');

// NOTE: updatePreview() syncs text via element.innerText, which jsdom does not
// implement, so preview-title keeps its default text under jsdom. We therefore
// test applyHighlight in isolation by seeding textContent (in a real browser the
// integrated smartLayout path works end-to-end).
const titleEl = doc.getElementById('preview-title');
titleEl.textContent = '스마트 배치 테스트 제목';
window.ClickThumb.applyHighlight(['제목'], { mode: 'marker' });
check('highlight (marker) span injected', /<span class="hl">제목<\/span>/.test(titleEl.innerHTML), titleEl.innerHTML);

titleEl.textContent = '색강조 제목';
window.ClickThumb.applyHighlight(['강조'], { mode: 'color' });
check('highlight (color) class applied', /class="hl hl-color"/.test(titleEl.innerHTML));

titleEl.textContent = '<b>위험</b> 제목';
window.ClickThumb.applyHighlight(['제목']);
check('highlight escapes HTML (XSS-safe)', titleEl.innerHTML.includes('&lt;b&gt;') && /<span class="hl">제목<\/span>/.test(titleEl.innerHTML));

// applyConfig (manual) does NOT force white / overlay
window.ClickThumb.applyConfig({ colorTextTitle: '#ff0000', title: '수동' });
check('manual applyConfig keeps custom color', doc.getElementById('color-text-title').value === '#ff0000');

console.log(fail === 0 ? '\n🎉 DOM 로직 테스트 통과' : `\n⚠️ ${fail}개 실패`);
process.exit(fail ? 1 : 0);
