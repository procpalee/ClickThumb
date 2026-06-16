// Smoke test: render a few thumbnails headlessly and verify files + dimensions.
// Run: node test/smoke.js
import { buildSmartConfig, renderAndSave } from '../src/render.js';
import { shutdown } from '../src/browser.js';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 1x1 PNG data URLs: a bright (white) and a dark (black) image to test auto-overlay.
const WHITE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const BLACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const tmp = os.tmpdir();
let fail = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fail++;
}

async function run() {
  // Case 1: gradient bg, basic smart layout, 16:9 @2x
  {
    const cfg = await buildSmartConfig({
      title: '모던 웹 디자인의 정석',
      subtitle: 'HTML/CSS로 만드는 썸네일 생성기',
      aspect: '16:9',
      theme: 'midnight',
      handle: '@procpa',
      badge: 'TOP 5',
      highlightKeywords: ['썸네일'],
      outputPath: path.join(tmp, 'ct_basic.webp'),
      scale: 2
    });
    const r = await renderAndSave(cfg, path.join(tmp, 'ct_basic.webp'), { smart: true });
    const st = await stat(r.savedPath);
    check('case1 file written', st.size > 1000, `${st.size} bytes`);
    check('case1 dimensions 2560×1440', r.width === 2560 && r.height === 1440, `${r.width}×${r.height}`);
  }

  // Case 2: bright image -> overlay should be strong; just verify it renders.
  {
    const cfg = await buildSmartConfig({
      title: '밝은 이미지 위 가독성 테스트',
      subtitle: '오버레이가 충분히 어두워야 함',
      aspect: '1:1',
      imagePath: WHITE_PNG,
      outputPath: path.join(tmp, 'ct_bright.png'),
      scale: 1,
      format: 'png'
    });
    const r = await renderAndSave(cfg, path.join(tmp, 'ct_bright.png'), { smart: true });
    const st = await stat(r.savedPath);
    check('case2 (1:1, bright img) written', st.size > 1000, `${st.size} bytes`);
    check('case2 dimensions 1080×1080', r.width === 1080 && r.height === 1080, `${r.width}×${r.height}`);
  }

  // Case 3: very long title -> auto font-fit should not overflow (renders without error).
  {
    const longTitle = '이것은 매우 긴 제목입니다 자동 폰트 맞춤이 동작해서 세이프존을 넘치지 않아야 합니다 정말로 길어요';
    const cfg = await buildSmartConfig({
      title: longTitle,
      subtitle: '부제도 함께 들어갑니다',
      aspect: '16:9',
      imagePath: BLACK_PNG,
      outputPath: path.join(tmp, 'ct_long.webp'),
      scale: 1
    });
    const r = await renderAndSave(cfg, path.join(tmp, 'ct_long.webp'), { smart: true });
    const st = await stat(r.savedPath);
    check('case3 (long title) written', st.size > 1000, `${st.size} bytes`);
  }

  console.log(fail === 0 ? '\n🎉 모든 스모크 테스트 통과' : `\n⚠️ ${fail}개 실패`);
}

run()
  .catch((e) => { console.error('스모크 테스트 오류:', e); fail++; })
  .finally(async () => { await shutdown(); process.exit(fail ? 1 : 0); });
