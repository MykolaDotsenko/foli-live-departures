// Generates the canonical 1200×630 Turku Departures brand card used in
// README and social sharing. Keep it reproducible so the artwork never
// depends on a manually uploaded binary.
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const PRODUCT_NAME = "Turku Departures";
const DOCS_OUTPUT = "docs/assets/turku-departures-social-card.jpg";
const PUBLIC_OUTPUT = "public/social-card.jpg";

const iconSvg = await readFile("public/foli-icon.svg", "utf8");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #fff;
    background:
      radial-gradient(circle at 4% 2%, rgba(255,255,255,.075) 0 42%, transparent 42.2%),
      linear-gradient(135deg, #05757f 0%, #078692 100%);
  }
  .card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 50px;
    width: 100%;
    height: 100%;
    padding: 64px 62px 54px 72px;
  }
  .left {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 31px;
    font-weight: 800;
    letter-spacing: -.025em;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 14px;
    background: rgba(0, 83, 91, .42);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
  }
  .icon svg { width: 38px; height: 38px; }
  h1 {
    margin: 46px 0 0;
    max-width: 690px;
    font-size: 54px;
    line-height: 1.08;
    letter-spacing: -.035em;
    font-weight: 820;
  }
  .lead {
    margin: 34px 0 0;
    max-width: 700px;
    font-size: 26px;
    line-height: 1.3;
    color: rgba(255,255,255,.94);
  }
  .fi {
    margin: 12px 0 0;
    font-size: 19px;
    line-height: 1.35;
    color: rgba(226, 248, 249, .82);
  }
  .trust {
    margin-top: auto;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: .01em;
    color: rgba(226, 248, 249, .84);
  }
  .ride {
    align-self: center;
    width: 340px;
    min-height: 438px;
    padding: 30px 28px 26px;
    border: 4px solid #f1c452;
    border-radius: 28px;
    background: #0f1a1d;
    box-shadow: 16px 18px 0 rgba(0, 63, 69, .42);
  }
  .eyebrow {
    color: #89d9df;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: .03em;
    text-transform: uppercase;
  }
  .ride h2 {
    margin: 14px 0 28px;
    color: #fff;
    font-size: 31px;
    line-height: 1.05;
    letter-spacing: -.025em;
  }
  .label {
    color: #8f9da0;
    font-size: 17px;
  }
  .stop {
    margin-top: 4px;
    color: #fff;
    font-size: 40px;
    line-height: 1.02;
    font-weight: 820;
    letter-spacing: -.03em;
  }
  .instruction {
    margin-top: 38px;
    padding: 17px 18px;
    border-radius: 15px;
    background: #f1c452;
    color: #1c180f;
    font-size: 27px;
    line-height: .98;
    font-weight: 850;
    letter-spacing: -.015em;
  }
  .meta {
    margin-top: 38px;
    color: #cad4d5;
    font-size: 18px;
    font-weight: 700;
  }
</style>
</head>
<body>
  <main class="card" aria-label="${PRODUCT_NAME} social preview">
    <section class="left">
      <div class="brand">
        <span class="icon">${iconSvg}</span>
        <span>${PRODUCT_NAME}</span>
      </div>
      <h1>Know what leaves next.<br>Know when to press STOP.</h1>
      <p class="lead">Live bus times, disruptions and get-off alerts for Turku.</p>
      <p class="fi">Reaaliaikaiset bussiajat, häiriöt ja pysäkkihälytykset.</p>
      <p class="trust">Independent · Privacy-first · No account · No ads</p>
    </section>

    <aside class="ride" aria-label="Get-off Alert preview">
      <div class="eyebrow">Next stop</div>
      <h2>Your stop is next</h2>
      <div class="label">Your stop</div>
      <div class="stop">Puistokatu</div>
      <div class="instruction">Press the STOP<br>button now.</div>
      <div class="meta">Line 1 · 1 stop · ~1 min</div>
    </aside>
  </main>
</body>
</html>`;

await mkdir("docs/assets", { recursive: true });
await mkdir("public", { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({
    path: DOCS_OUTPUT,
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });
  await page.screenshot({
    path: PUBLIC_OUTPUT,
    type: "jpeg",
    quality: 92,
    fullPage: false,
  });
} finally {
  await browser.close();
}

console.log(`generated ${DOCS_OUTPUT} and ${PUBLIC_OUTPUT} for ${PRODUCT_NAME}`);
