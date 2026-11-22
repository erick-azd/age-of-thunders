// Screenshots de câmeras fixas (para revisar modelos e cenários sem jogar, e mandar ao design).
// Uso: npm run build && node tools/view-shot.mjs <pasta> "<nome>|<expressão JS com g que devolve {pos, look, fov}>" ...
// Ex.: node tools/view-shot.mjs shots "aerea|{ pos: [0, 900, 2600], look: [0, 0, 0], fov: 60 }"
//      node tools/view-shot.mjs shots "jogador|(() => { const p = g.state.pos; return { pos: [p.x + 40, p.y + 20, p.z + 40], look: [p.x, p.y, p.z] }; })()"
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...views] = process.argv.slice(2);
if (!out || !views.length) { console.log('uso: node tools/view-shot.mjs <pasta> "nome|expr" ...'); process.exit(1); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(join(root, 'dist/age-of-thunders.html')).href);
await page.waitForFunction(() => window.game?.ready, null, { timeout: 120000 });
for (const v of views) {
  const [name, expr] = v.split('|');
  await page.evaluate((expr) => { const g = window.game; g.debugCamera(new Function('g', `return (${expr})`)(g)); }, expr);
  const f0 = await page.evaluate(() => window.game.frames);
  await page.waitForFunction((f) => window.game.frames >= f + 6, f0, { timeout: 60000 });
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(join(out, `${name}.png`));
}
if (errors.length) console.log('ERROS:', errors.join('\n'));
await browser.close();
