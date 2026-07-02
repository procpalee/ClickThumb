// MCP tool registration for ClickThumb.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getThemes } from './browser.js';
import { buildSmartConfig, buildManualConfig, renderAndSave } from './render.js';
import { THEMES } from './config.js';

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
      '결과 이미지를 인라인으로 함께 반환하므로 결과를 보고 theme/문구를 바꿔 다시 호출할 수 있습니다.',
    inputSchema: {
      title: z.string().describe('메인 제목'),
      subtitle: z.string().optional().describe('부제/설명 (선택)'),
      tag: z.string().optional().describe('상단 카테고리 라벨 (예: DEVELOPMENT). 비우려면 빈 문자열'),
      tags: z.string().optional().describe('부제 아래 해시태그 (쉼표 구분, 예: "웹개발, 디자인")'),
      imagePath: z.string().optional().describe('대표 이미지 로컬 파일 경로'),
      imageUrl: z.string().optional().describe('대표 이미지 URL (imagePath 대신)'),
      aspect: z.enum(['16:9', '1:1']).optional().describe('비율 프리셋 (기본 16:9 = 1280×720, 1:1 = 1080×1080)'),
      theme: themeEnum.optional().describe('디자인 테마 (이미지 없을 때 배경/포인트 색). list_themes로 목록 확인'),
      handle: z.string().optional().describe('블로그 핸들/워터마크 (예: @procpa)'),
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
      return resultContent(result, '✅ 스마트 썸네일을 생성했습니다.');
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
