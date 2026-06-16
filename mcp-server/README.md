# ClickThumb MCP Server

AI 에이전트(Claude 등)가 **ClickThumb으로 썸네일을 자동 생성·내보내기**할 수 있게 해주는 MCP 서버입니다.
헤드리스 Chromium(Playwright)으로 저장소의 `index.html`을 띄우고, 실제 앱과 **동일한 dom-to-image 렌더 경로**를 재사용해 이미지를 캡처합니다. 결과는 실제 다운로드 버튼과 픽셀 단위로 동일합니다.

## 핵심 아이디어

`index.html`에 추가된 `window.ClickThumb` API를 헤드리스 브라우저에서 호출합니다.

- **smart_thumbnail**: 대표 이미지 + 제목 + 부제만 주면 자동으로 보기 좋게 배치
  - 배경 이미지 밝기 분석 → 오버레이 농도 자동 조절 (글자색은 **흰색 고정**)
  - 제목/부제가 세이프존을 넘치면 **폰트 크기 자동 축소**
  - 한국어 어절 단위 **줄바꿈 균형** (`text-wrap: balance` + `word-break: keep-all`)
  - 디자인 테마, 블로그 핸들/워터마크, 키워드 강조(형광펜/색), 숫자 배지(TOP N)
  - 결과 이미지를 인라인으로 함께 반환 → AI가 보고 다듬어 재호출
- **generate_thumbnail**: 자동 배치 없이 전체 설정을 직접 지정 (고급/수동)
- **list_themes**: 사용 가능한 테마 목록

비율은 네이버 블로그/개인 웹사이트용으로 **16:9(1280×720)** 와 **1:1(1080×1080)** 두 프리셋을 지원합니다.

## 설치

```bash
cd mcp-server
npm install          # postinstall에서 playwright install chromium 자동 실행
```

> 네트워크 정책으로 Chromium 다운로드가 막히면 `npx playwright install chromium`을 별도로 실행하세요.

### 시스템 Chrome 사용 (브라우저 다운로드가 막힌 환경)

Playwright 번들 Chromium을 받을 수 없으면 이미 설치된 Chrome/Chromium을 가리키게 할 수 있습니다.

```bash
# 실행 파일 경로 직접 지정
export CLICKTHUMB_CHROME=/usr/bin/google-chrome
# 또는 설치된 채널 사용 (chrome / msedge)
export CLICKTHUMB_CHANNEL=chrome
```

## Claude Code(CLI)에 등록

```bash
claude mcp add clickthumb -- node /절대경로/ClickThumb/mcp-server/src/index.js
```

## Claude Desktop에 등록

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clickthumb": {
      "command": "node",
      "args": ["/절대경로/ClickThumb/mcp-server/src/index.js"]
    }
  }
}
```

## 직접 테스트

```bash
# MCP Inspector로 툴 확인
npm run inspect

# 스모크 테스트 (정적 서버 + 헤드리스 렌더 + 파일 저장)
node test/smoke.js
```

## smart_thumbnail 입력

| 필드 | 설명 |
|---|---|
| `title` (필수) | 메인 제목 |
| `subtitle` | 부제/설명 |
| `tag` | 상단 태그 라벨 (예: DEVELOPMENT) |
| `imagePath` / `imageUrl` | 대표 이미지 (로컬 경로 또는 URL) |
| `aspect` | `16:9`(기본) 또는 `1:1` |
| `theme` | midnight / mono / warm / forest / berry |
| `handle` | 블로그 핸들/워터마크 (예: @procpa) |
| `badge` | 숫자 배지 (예: TOP 5) |
| `highlightKeywords` | 강조할 키워드 배열 |
| `highlightMode` | `marker`(형광펜, 기본) / `color`(색) |
| `outputPath` (필수) | 저장 경로 (확장자는 format에 맞게 자동 보정) |
| `scale` | 1 / 2 / 4 (기본 2) |
| `format` | png / jpeg / webp (기본 webp) |

### 예시 호출

```json
{
  "title": "모던 웹 디자인의 정석",
  "subtitle": "HTML/CSS로 만드는 썸네일 생성기",
  "imagePath": "/home/user/photos/cover.jpg",
  "aspect": "16:9",
  "handle": "@procpa",
  "badge": "TOP 5",
  "highlightKeywords": ["썸네일"],
  "outputPath": "/home/user/out/thumb.webp",
  "scale": 2
}
```
