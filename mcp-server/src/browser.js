// Headless rendering engine: lazily boots a static server + Chromium,
// loads index.html, injects the config via the in-page window.ClickThumb API,
// and captures the thumbnail using the SAME dom-to-image code path as the
// human download button (pixel parity).
import { chromium } from 'playwright';
import { startStaticServer } from './staticServer.js';

let staticHandle = null; // { server, port, url }
let browser = null;

async function ensureStatic() {
  if (!staticHandle) staticHandle = await startStaticServer();
  return staticHandle;
}

async function ensureBrowser() {
  if (!browser) {
    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
    };
    // Allow pointing at a system Chrome/Chromium when the Playwright-bundled
    // browser isn't installed (e.g. restricted networks).
    //   CLICKTHUMB_CHROME=/path/to/chrome   -> explicit executable
    //   CLICKTHUMB_CHANNEL=chrome|msedge     -> use an installed channel
    const exe = process.env.CLICKTHUMB_CHROME || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const channel = process.env.CLICKTHUMB_CHANNEL;
    if (exe) launchOpts.executablePath = exe;
    else if (channel) launchOpts.channel = channel;
    browser = await chromium.launch(launchOpts);
  }
  return browser;
}

/**
 * Render a thumbnail and return a data URL.
 * @param {object} config  full thumbnail config (already merged with defaults)
 * @param {object} opts    { smart: boolean, scale, format }
 * @returns {Promise<string>} dataUrl
 */
export async function renderConfig(config, opts = {}) {
  const { smart = true, scale, format } = opts;
  const { url } = await ensureStatic();
  const b = await ensureBrowser();

  const page = await b.newPage({ deviceScaleFactor: 1 });
  try {
    await page.goto(`${url}/index.html`, { waitUntil: 'load', timeout: 30000 });
    // Wait for the programmatic API to be defined.
    await page.waitForFunction(() => !!(window.ClickThumb), null, { timeout: 15000 });

    // Apply config. smartLayout = auto overlay/contrast + font-fit + balance + extras.
    // applyConfig = literal config (advanced/manual, no auto behaviour).
    await page.evaluate(async ({ cfg, useSmart }) => {
      if (useSmart) {
        await window.ClickThumb.smartLayout(cfg);
      } else {
        window.ClickThumb.applyConfig(cfg);
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      }
      return true;
    }, { cfg: config, useSmart: smart });

    // Capture via the in-page dom-to-image path for visual parity.
    const dataUrl = await page.evaluate(async ({ s, f }) => {
      return await window.ClickThumb.renderToDataURL({ scale: s, format: f });
    }, { s: scale, f: format });

    return dataUrl;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Read the in-page theme catalog (so list_themes reflects index.html exactly). */
export async function getThemes() {
  const { url } = await ensureStatic();
  const b = await ensureBrowser();
  const page = await b.newPage();
  try {
    await page.goto(`${url}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!(window.ClickThumb), null, { timeout: 15000 });
    return await page.evaluate(() => window.ClickThumb.THEMES);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdown() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  if (staticHandle) { staticHandle.server.close(); staticHandle = null; }
}
