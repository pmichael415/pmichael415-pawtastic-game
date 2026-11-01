// Builds the home-screen icons and the link-preview image from the two PAWtastic logos and real game art.
// Run from tycoon/:  node scripts/make-share-images.cjs [game-screenshot.png]
// Outputs (committed): public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, public/brand/og-image.png
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataUri = (p, type) => `data:${type};base64,${fs.readFileSync(path.join(root, p)).toString("base64")}`;
const dog = dataUri("src/assets/brand/pawtastic-academy-sitting-dog.jpg", "image/jpeg");
const cap = dataUri("src/assets/brand/pawtastic-academy-grad-cap.png", "image/png");
const shotPath = process.argv[2] || "qa/out/busy-phone-overhead.png";
const shot = dataUri(shotPath, "image/png");
const BG = "#FAF8F5";

const icon = (size, inner) => `<!doctype html><html><body style="margin:0">
  <div style="width:${size}px;height:${size}px;background:#FFFFFF;display:flex;align-items:center;justify-content:center">
    <img src="${dog}" style="max-width:${inner}%;max-height:${inner}%;object-fit:contain"></div></body></html>`;

const og = `<!doctype html><html><head><style>
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{width:1200px;height:630px;background:${BG};display:flex;align-items:center;gap:40px;padding:0 56px;box-sizing:border-box}
  .left{flex:1;display:flex;flex-direction:column;gap:18px}
  .logos{display:inline-flex;align-items:center;gap:22px;background:#fff;border-radius:22px;padding:10px 18px;align-self:flex-start;box-shadow:0 4px 14px rgba(49,39,33,.08)}
  .logos img{height:150px;object-fit:contain}
  h1{margin:0;font-size:64px;line-height:1.02;color:#312721;letter-spacing:-1px}
  p{margin:0;font-size:28px;color:#5b4f47;line-height:1.3}
  .pill{display:inline-block;background:#0068D6;color:#fff;font-weight:700;font-size:24px;padding:10px 20px;border-radius:14px}
  .shot{width:470px;height:470px;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(49,39,33,.22);border:6px solid #fff}
  .shot img{width:100%;height:100%;object-fit:cover}
</style></head><body><div class="wrap">
  <div class="left">
    <div class="logos"><img src="${dog}"><img src="${cap}"></div>
    <h1>PAWtastic Games</h1>
    <p>Free dog games from PAWtastic Academy: Daycare Tycoon, Recess Rush and Graduation Day.</p>
    <div><span class="pill">Play free</span></div>
  </div>
  <div class="shot"><img src="${shot}"></div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const out = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: "load" });
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    await page.screenshot({ path: path.join(root, file), clip: { x: 0, y: 0, width: w, height: h } });
    console.log("wrote", file);
  };
  await out(icon(192, 88), 192, 192, "public/icons/icon-192.png");
  await out(icon(512, 88), 512, 512, "public/icons/icon-512.png");
  await out(icon(512, 70), 512, 512, "public/icons/icon-maskable-512.png"); // logo inside the centre safe zone
  await out(og, 1200, 630, "public/brand/og-image.png");
  await browser.close();
})();
