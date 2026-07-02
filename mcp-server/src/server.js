// MCP tool registration for ClickThumb.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { getThemes } from './browser.js';
import { buildSmartConfig, buildManualConfig, renderAndSave, dataUrlToBuffer } from './render.js';
import { THEMES, ASPECTS } from './config.js';
import { imageToDataUrl } from './image.js';
import { saveSeries, listSeries, setDefaults, getDefaults, STORE_DIR } from './store.js';

const INLINE_MAX_BYTES = 750 * 1024; // cap inline preview payload
const IMG_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

function resultContent({ savedPath, width, height, format, buffer }, headline) {
  const content = [{
    type: 'text',
    text: `${headline}\n저장 경로: ${savedPath}\n크기: ${width}×${height}px · 포맷: ${format}`
  }];
  // Inline preview so the AI can visually verify and iterate.
  if (buffer && buffer.length <= INLINE_MAX_BYTES) {
    content.push({ type: 'image', data: buffer.toString('base64'), mimeType: IMG_MIME[format] || 'image/png' });
  }
  return { content };
}

function errorResult(e) {
  return { content: [{ type: 'text', text: `오류: ${e && e.message ? e.message : String(e)}` }], isError: true };
}

const themeEnum = z.enum(['midnight', 'mono', 'warm', 'forest', 'berry']);
const formatEnum = z.enum(['png', 'jpeg', 'webp']);
const scaleEnum = z.union([z.literal(1), z.literal(2), z.literal(4)]);

export function createServer() {
  const server = new McpServer({ name: 'clickthumb', version: '1.0.0' });

  // ---- smart_thumbnail (primary) ----
  server.registerTool('smart_thumbnail', {
    title: '스마트 썸네일 생성',
    description:
      '대표 이미지 + 제목 + 부제만 주면 ClickThumb이 자동으로 보기 좋게 배치해 썸네일을 만들고 파일로 저장합니다. ' +
      '배경 이미지 밝기를 분석해 오버레이 농도를 자동 조절(글자색 흰색 고정), 제목/부제가 넘치면 폰트 크기를 자동 축소, ' +
      '한국어 어절 단위 줄바꿈 균형을 적용합니다. 네이버 블로그/개인 웹사이트용으로 16:9 또는 1:1 비율을 지원합니다. ' +
      '결과 이미지를 인라인으로 함께 반환하므로 결과를 보고 theme/문구를 바꿔 다시 호출할 수 있습니다. ' +
      'seriesName을 주면 그 시리즈의 배경/테마/카테고리가 자동 저장·재사용됩니다(같은 시리즈는 항상 같은 배경). ' +
      '배경 후보를 사용자에게 먼저 고르게 하려면 propose_thumbnails를 사용하세요.',
    inputSchema: {
      title: z.string().describe('메인 제목'),
      subtitle: z.string().optional().describe('부제/설명 (선택)'),
      tag: z.string().optional().describe('상단 카테고리 라벨 (예: DEVELOPMENT). 비우려면 빈 문자열'),
      tags: z.string().optional().describe('부제 아래 해시태그 (쉼표 구분, 예: "웹개발, 디자인")'),
      seriesName: z.string().optional().describe('시리즈 이름. 처음 쓰면 이번 배경/테마/카테고리를 저장하고, 다음부터는 이미지 없이 호출해도 같은 배경을 재사용'),
      imagePath: z.string().optional().describe('대표 이미지 로컬 파일 경로'),
      imageUrl: z.string().optional().describe('대표 이미지 URL (imagePath 대신)'),
      aspect: z.enum(['16:9', '1:1']).optional().describe('비율 프리셋 (기본 16:9 = 1280×720, 1:1 = 1080×1080)'),
      theme: themeEnum.optional().describe('디자인 테마 (이미지 없을 때 배경/포인트 색). list_themes로 목록 확인'),
      handle: z.string().optional().describe('블로그 핸들/워터마크 텍스트 (예: @procpa). 미지정 시 set_defaults의 기본값 사용'),
      logoPath: z.string().optional().describe('워터마크 로고 이미지 로컬 경로 (하단 중앙 표시). 미지정 시 set_defaults의 기본 로고 사용'),
      logoUrl: z.string().optional().describe('워터마크 로고 이미지 URL (logoPath 대신)'),
      badge: z.string().optional().describe('숫자 배지 (예: TOP 5)'),
      highlightKeywords: z.array(z.string()).optional().describe('제목/부제에서 강조할 키워드 목록'),
      highlightMode: z.enum(['marker', 'color']).optional().describe('강조 방식 (marker=밑줄, color=글자색). 기본 marker'),
      outputPath: z.string().describe('저장할 파일 경로 (확장자는 format에 맞게 자동 보정)'),
      scale: scaleEnum.optional().describe('출력 배율 1/2/4 (기본 2)'),
      format: formatEnum.optional().describe('출력 포맷 png/jpeg/webp (기본 webp)')
    }
  }, async (args) => {
    try {
      const config = await buildSmartConfig(args);
      const result = await renderAndSave(config, args.outputPath, { smart: true });
      // 시리즈 기억: 렌더 성공 후 배경/테마/카테고리를 저장해 다음 호출에서 재사용
      let note = '';
      if (args.seriesName) {
        await saveSeries(args.seriesName, {
          backgroundDataUrl: config.backgroundImage,
          theme: config.theme,
          tag: config.series
        });
        note = `\n시리즈 '${args.seriesName}' 프리셋 저장됨 — 다음부터 seriesName만 넘기면 같은 배경을 사용합니다.`;
      }
      return resultContent(result, '✅ 스마트 썸네일을 생성했습니다.' + note);
    } catch (e) { return errorResult(e); }
  });

  // ---- propose_thumbnails (human-in-the-loop candidates) ----
  server.registerTool('propose_thumbnails', {
    title: '썸네일 후보 생성 (사용자 선택용)',
    description:
      '같은 문구로 배경(대표 이미지)이 서로 다른 후보 썸네일을 여러 장 만들어 인라인 이미지로 반환합니다. ' +
      '후보들을 사용자에게 보여주고 하나를 고르게 한 뒤, 선택된 후보의 backgroundPath를 smart_thumbnail의 ' +
      'imagePath로 넘겨 최종본(고화질)을 만드세요. 시리즈로 기억하려면 그때 seriesName도 함께 넘기면 됩니다. ' +
      'imagePaths/imageUrls를 주면 그 이미지들로 후보를 만들고, 없으면 무료 랜덤 사진(picsum.photos)을 가져오며, ' +
      '네트워크가 안 되면 테마 그라디언트 후보로 대체합니다.',
    inputSchema: {
      title: z.string().describe('메인 제목'),
      subtitle: z.string().optional().describe('부제/설명'),
      tag: z.string().optional().describe('상단 카테고리 라벨'),
      tags: z.string().optional().describe('부제 아래 해시태그 (쉼표 구분)'),
      count: z.number().int().min(1).max(5).optional().describe('후보 개수 (기본 3, 최대 5)'),
      imagePaths: z.array(z.string()).optional().describe('후보 배경으로 쓸 로컬 이미지 경로들'),
      imageUrls: z.array(z.string()).optional().describe('후보 배경으로 쓸 이미지 URL들'),
      aspect: z.enum(['16:9', '1:1']).optional().describe('비율 프리셋 (기본 16:9)'),
      theme: themeEnum.optional().describe('디자인 테마'),
      handle: z.string().optional().describe('워터마크 텍스트'),
      logoPath: z.string().optional().describe('워터마크 로고 로컬 경로'),
      outputDir: z.string().describe('후보 이미지들을 저장할 폴더')
    }
  }, async (args) => {
    try {
      const count = Math.min(5, Math.max(1, args.count || 3));
      const aspect = ASPECTS[args.aspect || '16:9'] || ASPECTS['16:9'];
      await mkdir(path.resolve(args.outputDir), { recursive: true });

      // 1) 후보 배경 소스 결정: 명시 이미지 > picsum 랜덤 > (실패 시) 테마 그라디언트
      let sources = [];
      if ((args.imagePaths && args.imagePaths.length) || (args.imageUrls && args.imageUrls.length)) {
        sources = [
          ...(args.imagePaths || []).map(p => ({ imagePath: p, label: p })),
          ...(args.imageUrls || []).map(u => ({ imageUrl: u, label: u }))
        ].slice(0, 5);
      } else {
        const stamp = Date.now();
        for (let i = 0; i < count; i++) {
          sources.push({
            imageUrl: `https://picsum.photos/seed/ct-${stamp}-${i}/${aspect.width}/${aspect.height}`,
            label: '랜덤 사진'
          });
        }
      }

      // 2) 배경 로드 (실패한 소스는 건너뜀)
      const backgrounds = [];
      for (const src of sources) {
        try {
          backgrounds.push({ dataUrl: await imageToDataUrl(src), label: src.label });
        } catch { /* skip failed source */ }
      }

      // 3) 전부 실패하면 테마 그라디언트 후보로 대체
      const themeFallback = backgrounds.length === 0;
      const themeNames = Object.keys(THEMES).slice(0, count);
      const variants = themeFallback
        ? themeNames.map(name => ({ theme: name, label: `테마 ${name}` }))
        : backgrounds;

      const baseArgs = {
        title: args.title, subtitle: args.subtitle, tag: args.tag, tags: args.tags,
        aspect: args.aspect, handle: args.handle, logoPath: args.logoPath,
        scale: 1, format: 'webp'
      };

      const content = [];
      const lines = [];
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const config = await buildSmartConfig({
          ...baseArgs,
          theme: v.theme || args.theme,
          imagePath: v.dataUrl // data URL 그대로 통과 (imageToDataUrl가 pass-through)
        });
        const candidatePath = path.join(path.resolve(args.outputDir), `candidate-${i + 1}.webp`);
        const result = await renderAndSave(config, candidatePath, { smart: true });

        // 선택을 재현할 수 있도록 배경 원본도 저장
        let bgLine = v.theme ? `테마 그라디언트 (theme: ${v.theme})` : '';
        if (v.dataUrl) {
          const { mime, buffer } = dataUrlToBuffer(v.dataUrl);
          const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
          const bgPath = path.join(path.resolve(args.outputDir), `background-${i + 1}${ext}`);
          await writeFile(bgPath, buffer);
          bgLine = `backgroundPath: ${bgPath}`;
        }
        lines.push(`후보 ${i + 1}: ${result.savedPath}\n  ${bgLine}`);
        if (result.buffer && result.buffer.length <= INLINE_MAX_BYTES) {
          content.push({ type: 'image', data: result.buffer.toString('base64'), mimeType: 'image/webp' });
        }
      }

      const guide = themeFallback
        ? '\n(이미지를 가져오지 못해 테마 그라디언트 후보로 대체했습니다. 최종본은 theme 값으로 smart_thumbnail을 호출하세요.)'
        : '\n사용자가 후보를 고르면 해당 backgroundPath를 imagePath로 넘겨 smart_thumbnail(scale 2 권장)로 최종본을 만드세요.';
      content.unshift({ type: 'text', text: `🎨 후보 ${variants.length}장을 생성했습니다.\n${lines.join('\n')}${guide}` });
      return { content };
    } catch (e) { return errorResult(e); }
  });

  // ---- set_defaults (persistent logo / handle) ----
  server.registerTool('set_defaults', {
    title: '기본 워터마크 설정 (로고/핸들)',
    description:
      '모든 smart_thumbnail에 자동 적용되는 기본 로고(logoPath)와 핸들 텍스트(handle)를 영구 저장합니다. ' +
      `저장 위치: ${STORE_DIR}. 빈 문자열("")을 주면 해당 기본값을 제거합니다.`,
    inputSchema: {
      logoPath: z.string().optional().describe('기본 워터마크 로고 이미지의 로컬 경로 (예: C:\\Users\\PC\\...\\logo.png)'),
      handle: z.string().optional().describe('기본 워터마크 텍스트 (예: @procpa)')
    }
  }, async (args) => {
    try {
      // 로고 경로가 주어지면 즉시 읽어서 유효성 검증
      if (args.logoPath) await imageToDataUrl({ imagePath: args.logoPath });
      const defaults = await setDefaults({ logoPath: args.logoPath, handle: args.handle });
      const desc = Object.entries(defaults).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(비어 있음)';
      return { content: [{ type: 'text', text: `✅ 기본값을 저장했습니다.\n${desc}` }] };
    } catch (e) { return errorResult(e); }
  });

  // ---- list_series (saved presets) ----
  server.registerTool('list_series', {
    title: '시리즈 프리셋 목록',
    description:
      '저장된 시리즈 프리셋(배경 이미지·테마·카테고리)과 기본 워터마크 설정을 반환합니다. ' +
      '시리즈 썸네일을 만들기 전에 호출해 이미 저장된 시리즈인지 확인하세요.',
    inputSchema: {}
  }, async () => {
    try {
      const [series, defaults] = [await listSeries(), await getDefaults()];
      const seriesLines = Object.entries(series).map(([name, s]) =>
        `- ${name}: 배경=${s.imagePath || '(없음)'}${s.theme ? `, 테마=${s.theme}` : ''}${s.tag ? `, 카테고리=${s.tag}` : ''} (갱신: ${s.updatedAt || '?'})`);
      const defaultLines = Object.entries(defaults).map(([k, v]) => `- ${k}: ${v}`);
      const text =
        `저장 위치: ${STORE_DIR}\n\n` +
        `[시리즈 프리셋]\n${seriesLines.join('\n') || '(없음)'}\n\n` +
        `[기본 워터마크]\n${defaultLines.join('\n') || '(없음)'}`;
      return { content: [{ type: 'text', text }] };
    } catch (e) { return errorResult(e); }
  });

  // ---- generate_thumbnail (advanced / manual, no auto behaviour) ----
  server.registerTool('generate_thumbnail', {
    title: '썸네일 생성 (수동/고급)',
    description:
      '자동 배치 없이 전체 설정을 직접 지정해 썸네일을 렌더링합니다. 세밀한 제어가 필요할 때 사용하세요. ' +
      'config의 모든 필드는 선택이며 생략 시 기본값이 적용됩니다.',
    inputSchema: {
      config: z.object({
        series: z.string().optional(),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        tags: z.string().optional(),
        fontFamilyMain: z.string().optional(),
        fontFamilySeries: z.string().optional(),
        sizeSeries: z.number().optional(),
        sizeTitle: z.number().optional(),
        sizeSubtitle: z.number().optional(),
        weightSeries: z.union([z.number(), z.string()]).optional(),
        weightTitle: z.union([z.number(), z.string()]).optional(),
        weightSubtitle: z.union([z.number(), z.string()]).optional(),
        colorTextTitle: z.string().optional(),
        colorTextSubtitle: z.string().optional(),
        colorTextSeries: z.string().optional(),
        colorAccent: z.string().optional(),
        colorBgStart: z.string().optional(),
        colorBgEnd: z.string().optional(),
        overlayOpacity: z.number().optional(),
        aspectRatio: z.string().optional(),
        contentRatio: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        imagePath: z.string().optional(),
        imageUrl: z.string().optional(),
        logoPath: z.string().optional(),
        logoUrl: z.string().optional(),
        theme: themeEnum.optional(),
        handle: z.string().optional(),
        badge: z.string().optional(),
        highlightKeywords: z.array(z.string()).optional(),
        highlightMode: z.enum(['marker', 'color']).optional()
      }).optional().describe('전체 썸네일 설정 (모든 필드 선택)'),
      outputPath: z.string().describe('저장할 파일 경로'),
      scale: scaleEnum.optional().describe('출력 배율 1/2/4 (기본 1)'),
      format: formatEnum.optional().describe('출력 포맷 (기본 webp)'),
      auto: z.boolean().optional().describe('true면 자동 배치(smartLayout) 적용, 기본 false')
    }
  }, async (args) => {
    try {
      const config = await buildManualConfig(args);
      const result = await renderAndSave(config, args.outputPath, { smart: !!args.auto });
      return resultContent(result, '✅ 썸네일을 생성했습니다.');
    } catch (e) { return errorResult(e); }
  });

  // ---- list_themes ----
  server.registerTool('list_themes', {
    title: '디자인 테마 목록',
    description: '사용 가능한 디자인 테마(프리셋) 목록과 설명을 반환합니다.',
    inputSchema: {}
  }, async () => {
    try {
      let themes;
      try { themes = await getThemes(); } catch { themes = THEMES; }
      const lines = Object.entries(themes).map(([name, t]) => `- ${name}: ${t.desc || ''}`);
      return { content: [{ type: 'text', text: '사용 가능한 테마:\n' + lines.join('\n') }] };
    } catch (e) { return errorResult(e); }
  });

  return server;
}
