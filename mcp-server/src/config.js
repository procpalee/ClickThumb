// Config schema, defaults, themes and aspect presets.
// Keep DEFAULTS / THEMES in sync with window.ClickThumb in index.html.

export const DEFAULTS = {
  series: 'DEVELOPMENT',
  title: '모던 웹 디자인의 정석',
  subtitle: 'HTML/CSS로 만드는 썸네일 생성기',
  fontFamilyMain: "'Pretendard', sans-serif",
  fontFamilySeries: "'Pretendard', sans-serif",
  sizeSeries: 1.4,
  sizeTitle: 4.0,
  sizeSubtitle: 2.5,
  weightSeries: 600,
  weightTitle: 900,
  weightSubtitle: 400,
  colorTextTitle: '#ffffff',
  colorTextSubtitle: '#e0e0e0',
  colorTextSeries: '#dbeafe',
  colorAccent: '#ffffff',
  colorBgStart: '#4f46e5',
  colorBgEnd: '#3b82f6',
  overlayOpacity: 0,
  aspectRatio: '1.777777778',
  contentRatio: '1',
  width: 1280,
  height: 720,
  exportScale: 1,
  exportFormat: 'webp',
  backgroundImage: null
};

// Aspect presets exposed to the AI ("16:9" / "1:1").
export const ASPECTS = {
  '16:9': { width: 1280, height: 720, aspectRatio: '1.777777778', contentRatio: '1.777777778' },
  '1:1': { width: 1080, height: 1080, aspectRatio: '1', contentRatio: '1' }
};

// Mirror of window.ClickThumb.THEMES (for list_themes + validation).
export const THEMES = {
  midnight: { desc: '인디고→블루, 기본/테크' },
  mono: { desc: '그레이/블랙, 미니멀' },
  warm: { desc: '오렌지→레드, 따뜻함' },
  forest: { desc: '딥그린→틸, 자연' },
  berry: { desc: '퍼플→핑크, 감성' }
};

export const FORMATS = ['png', 'jpeg', 'webp'];
export const SCALES = [1, 2, 4];
