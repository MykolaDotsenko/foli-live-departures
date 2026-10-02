import { copyFile, mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = "artifacts/play-store";
await mkdir(outputDir, { recursive: true });
await copyFile("public/icon-512.png", `${outputDir}/app-icon.png`);

const iconSvg = await readFile("public/foli-icon.svg", "utf8");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box}
html,body{margin:0;width:1024px;height:500px;overflow:hidden}
body{
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:#fff;
  background:
    radial-gradient(circle at 5% 4%,rgba(255,255,255,.07) 0 38%,transparent 38.3%),
    linear-gradient(135deg,#05757f 0%,#078692 100%);
}
main{display:grid;grid-template-columns:minmax(0,1fr) 284px;gap:38px;height:100%;padding:48px 50px 42px 58px}
.left{display:flex;min-width:0;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-size:25px;font-weight:820;letter-spacing:-.02em}
.icon{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:rgba(0,72,80,.46)}
.icon svg{width:33px;height:33px}
h1{max-width:610px;margin:42px 0 0;font-size:46px;line-height:1.05;letter-spacing:-.038em}
.lead{max-width:610px;margin:24px 0 0;font-size:22px;line-height:1.3;color:rgba(255,255,255,.94)}
.trust{margin-top:auto;font-size:16px;font-weight:750;color:rgba(226,248,249,.88)}
.ride{align-self:center;padding:24px 22px 22px;border:3px solid #f1c452;border-radius:24px;background:#0f1a1d;box-shadow:12px 14px 0 rgba(0,63,69,.4)}
.eyebrow{color:#89d9df;font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.ride h2{margin:10px 0 22px;font-size:26px;line-height:1.05}
.label{color:#95a4a6;font-size:14px}
.stop{margin-top:3px;font-size:34px;font-weight:830;letter-spacing:-.03em}
.instruction{margin-top:28px;padding:14px 15px;border-radius:13px;background:#f1c452;color:#1c180f;font-size:22px;line-height:1;font-weight:850}
.meta{margin-top:24px;color:#cad4d5;font-size:14px;font-weight:700}
</style>
</head>
<body>
<main aria-label="Turku Departures Google Play feature graphic">
  <section class="left">
    <div class="brand"><span class="icon">${iconSvg}</span><span>Turku Departures</span></div>
    <h1>Know what leaves next.<br>Know when to press STOP.</h1>
    <p class="lead">Live bus times, disruptions and get-off alerts for Turku.</p>
    <p class="trust">Independent · Privacy-first</p>
  </section>
  <aside class="ride">
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

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1024,height:500},deviceScaleFactor:1});
  await page.setContent(html,{waitUntil:"load"});
  await page.screenshot({
    path:`${outputDir}/feature-graphic.jpg`,
    type:"jpeg",
    quality:92,
    fullPage:false
  });
}finally{
  await browser.close();
}
console.log("Generated Google Play app icon copy and 1024x500 feature graphic.");
