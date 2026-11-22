// Draw calls por objeto da cena num quadro (para achar quem estoura o orçamento).
// Uso: npm run build && node tools/draw-calls.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(join(root, 'dist/age-of-thunders.html')).href);
await page.waitForFunction(() => window.game?.ready, null, { timeout: 120000 });
const counts = await page.evaluate(async () => {
  const g = window.game, r = g.renderer;
  const out = {};
  const label = (o) => {
    const chain = [];
    for (let p = o; p && p !== g.scene; p = p.parent) chain.unshift(p.name || `${p.type}${p.parent ? p.parent.children.indexOf(p) : ''}`);
    return chain.slice(0, 2).join('/');
  };
  const orig = r.renderBufferDirect.bind(r), ro = r.render.bind(r);
  let on = false;
  r.renderBufferDirect = (cam, sc, geo, mat, obj, grp) => { if (on) { const k = label(obj); out[k] = (out[k] ?? 0) + 1; } return orig(cam, sc, geo, mat, obj, grp); };
  await new Promise((res) => { r.render = (sc, cam) => { on = sc === g.scene; ro(sc, cam); if (on) { on = false; r.render = ro; res(); } }; });
  r.renderBufferDirect = orig;
  return out;
});
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log(sorted.reduce((a, [, n]) => a + n, 0), 'draw calls');
for (const [k, n] of sorted) console.log(String(n).padStart(4), k);
await browser.close();
