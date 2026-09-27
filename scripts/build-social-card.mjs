// Renders public/social-card.jpg, the 1200×630 preview a chat app or social
// network shows when someone shares a link to the app. Run it after changing
// the copy or the look:
//
//   node scripts/build-social-card.mjs
//   CHROMIUM_PATH=/path/to/chrome FONT_DIR=/path/to/inter/woff2 node scripts/build-social-card.mjs
//
// FONT_DIR, if set, holds Inter's inter-latin-{400,700,800,900}-normal.woff2
// files (the @fontsource/inter package has them); without it the system's
// sans-serif is used.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const WIDTH = 1200;
const HEIGHT = 630;

const icon = await readFile("public/foli-icon.svg", "utf8");

async function fontFaces() {
  const dir = process.env.FONT_DIR;
  if (!dir) return "";

  const faces = await Promise.all(
    [400, 700, 800, 900].map(async (weight) => {
      const file = path.join(dir, `inter-latin-${weight}-normal.woff2`);
      const data = (await readFile(file)).toString("base64");
      return `@font-face{font-family:"Inter";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    })
  );
  return faces.join("");
}

// The card leads with what no other departure board does: the get-off
// alert, drawn as the panel a passenger sees one stop before theirs. It
// promises what the app does, telling you when to press STOP, not "never
// miss your stop", which the app itself says it cannot guarantee. A Finnish
// line follows, for the city most links are shared in.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${await fontFaces()}
* { box-sizing: border-box; margin: 0; }
body {
  width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
  font-family: Inter, "Segoe UI", Roboto, "DejaVu Sans", sans-serif;
  background:
    radial-gradient(circle at 12% 0%, rgba(71, 195, 207, 0.35), transparent 42rem),
    linear-gradient(135deg, #005e67 0%, #007985 55%, #00656f 100%);
  color: #ffffff;
}
.card { display: grid; grid-template-columns: 1fr 346px; gap: 56px; height: 100%; padding: 64px 72px; }
.copy { display: flex; flex-direction: column; justify-content: center; }
.brand { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
.brand svg { width: 56px; height: 56px; border-radius: 13px; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18); }
h1 { margin-top: 36px; font-size: 48px; font-weight: 900; line-height: 1.02; letter-spacing: -0.045em; }
.lede { margin-top: 24px; max-width: 34ch; color: #d9f3f5; font-size: 24px; font-weight: 600; line-height: 1.35; }
.lede-fi { margin-top: 12px; max-width: 40ch; color: #b6e6ea; font-size: 18px; font-weight: 600; line-height: 1.35; }
.fine { margin-top: auto; color: #a9dce0; font-size: 20px; font-weight: 600; }
.panel {
  align-self: center; padding: 30px 30px 32px; border: 4px solid #e7b74b; border-radius: 30px;
  background: radial-gradient(circle at top right, rgba(34, 211, 238, 0.16), transparent 16rem), #10191c;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
}
.eyebrow { color: #8ee7ee; font-size: 17px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
.title { margin-top: 6px; font-size: 30px; font-weight: 900; letter-spacing: -0.03em; }
.label { margin-top: 22px; color: #93abb1; font-size: 18px; font-weight: 600; }
.stop { font-size: 40px; font-weight: 900; letter-spacing: -0.045em; line-height: 1.05; }
.instruction { margin-top: 22px; padding: 16px 18px; border-radius: 16px; background: #e7b74b; color: #1b1300; font-size: 25px; font-weight: 900; line-height: 1.18; }
.meta { margin-top: 18px; color: #b9ccd0; font-size: 20px; font-weight: 700; }
</style></head>
<body><div class="card">
  <div class="copy">
    <div class="brand">${icon.replace("<svg ", '<svg aria-hidden="true" ')}Turku Departures</div>
    <h1>Know what leaves next.<br>Know when to press STOP.</h1>
    <p class="lede">Live bus times, disruptions and get-off alerts for Turku.</p>
    <p class="lede-fi" lang="fi">Reaaliaikaiset bussiajat, häiriöt ja pysäkkihälytykset.</p>
    <p class="fine">Independent · Privacy-first · No account · No ads</p>
  </div>
  <div class="panel">
    <div class="eyebrow">Next stop</div>
    <div class="title">Your stop is next</div>
    <div class="label">Your stop</div>
    <div class="stop">Puistokatu</div>
    <div class="instruction">Press the STOP button now.</div>
    <div class="meta">Line 1 · 1 stop · ~1 min</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "public/social-card.jpg",
    type: "jpeg",
    quality: 88,
  });
  console.log(`wrote public/social-card.jpg (${WIDTH}×${HEIGHT})`);
} finally {
  await browser.close();
}
