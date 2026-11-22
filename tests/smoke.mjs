// Smoke test no navegador: abre o build com um gamepad simulado, entra no jogo, voa, confere o
// estado, o orçamento de draw calls e o editor F1, tira screenshots e falha se houver erro no console.
// Uso: npm run build && node tests/smoke.mjs [--shots pasta]
// Lições do Polygonizer: sem GPU os quadros são lentos, então espere por CONDIÇÕES (nunca por tempo
// fixo), conte esperas de jogo no tempo da simulação e imprima o estado antes de falhar.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : join(root, 'tests/screenshots');
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Gamepad simulado (mapeamento "standard")
await page.addInitScript(() => {
  const pad = {
    id: 'Gamepad simulado', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
const btn = (i, v) => page.evaluate(([i, v]) => { const b = window.__pad.buttons[i]; b.value = v; b.pressed = v > 0.5; }, [i, v]);
const axis = (i, v) => page.evaluate(([i, v]) => { window.__pad.axes[i] = v; }, [i, v]);
const shot = (name) => page.screenshot({ path: join(shots, name) });
const st = () => page.evaluate(() => window.game.debugState());
const waitFor = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const assert = async (c, msg) => { if (!c) { console.error('estado:', JSON.stringify(await st())); throw new Error(msg); } };

/** Draw calls de um quadro da cena (GDD: orçamento é requisito). */
const drawCalls = () => page.evaluate(async () => {
  const g = window.game, r = g.renderer;
  const orig = r.renderBufferDirect.bind(r), ro = r.render.bind(r);
  let on = false, total = 0;
  r.renderBufferDirect = (...a) => { if (on) total++; return orig(...a); };
  await new Promise((res) => { r.render = (sc, cam) => { on = sc === g.scene; ro(sc, cam); if (on) { on = false; r.render = ro; res(); } }; });
  r.renderBufferDirect = orig;
  return total;
});

await page.goto(pathToFileURL(join(root, 'dist/age-of-thunders.html')).href);
await waitFor(() => window.game?.ready === true, null, 120000);
await shot('01-titulo.png');

// Título → jogo (A)
await btn(0, 1);
await waitFor(() => window.game.debugState().screen === 'playing');
await btn(0, 0);
await assert(await page.evaluate(() => !document.querySelector('.title')?.checkVisibility()), 'o título deveria sumir ao começar');

// Acelera pela rua central por 3 s de jogo (tempo da simulação, não do relógio)
const p0 = (await st()).pos;
await btn(7, 1);
await waitFor(() => window.game.debugState().simTime > 3);
const s1 = await st();
await btn(7, 0);
await assert(s1.speed > 25 && Math.hypot(s1.pos.x - p0.x, s1.pos.z - p0.z) > 40 && s1.onGround && s1.wallHits === 0, 'o carro deveria acelerar pela rua sem bater');
await shot('02-carro.png');
// Curva com freio de mão (derrapagem)
await axis(0, 1);
await btn(1, 1);
await waitFor((t) => window.game.debugState().simTime > t + 0.5, s1.simTime);
await shot('02b-derrapagem.png');
await axis(0, 0);
await btn(1, 0);

const dc = await drawCalls();
console.log('draw calls =', dc);
await assert(dc <= 150, `acima do orçamento de 150 draw calls: ${dc}`);

// Editor F1
await page.keyboard.down('F1');
await waitFor(() => window.game.debugState().editorOpen);
await page.keyboard.up('F1');
await shot('03-editor.png');

// Vista aérea fixa (o mesmo recurso das ferramentas de screenshot)
await page.evaluate(() => window.game.debugCamera({ pos: [0, 900, 2600], look: [0, 0, 0], fov: 60 }));
const f0 = await page.evaluate(() => window.game.frames);
await waitFor((f) => window.game.frames >= f + 4, f0);
await shot('04-aerea.png');

// Bairro de voxels (M0.1): vista de cima em 3/4 e vista da rua
await page.keyboard.down('F1'); // fecha o editor para as vistas
await waitFor(() => !window.game.debugState().editorOpen);
await page.keyboard.up('F1');
const d = (await st()).district;
console.log('bairro:', JSON.stringify(d));
await assert(d.buildings >= 20 && d.sites >= 15 && d.viaducts === 2 && d.meshes > 0, 'a cidade deveria ter prédios, lotes industriais, vias elevadas e malhas');
const view = async (name, cam) => {
  await page.evaluate((c) => window.game.debugCamera(c), cam);
  const f = await page.evaluate(() => window.game.frames);
  await waitFor((f) => window.game.frames >= f + 4, f);
  await shot(name);
};
await view('05-bairro.png', { pos: [290, 150, 290], look: [-10, 14, -10], fov: 55 });
await view('08-periferia.png', { pos: [175, 32, 230], look: [120, 15, 120], fov: 60 });
await view('09-via-elevada.png', { pos: [-125, 15.8, -92], look: [-131, 21, -150], fov: 75 });
await view('06-rua.png', { pos: [2, 16.2, 110], look: [0, 22, 0], fov: 65 });
await view('07-ilha.png', { pos: [900, 420, 900], look: [0, 20, 0], fov: 55 });
const spots = (await st()).showcase;
await assert(Object.keys(spots).length === 4, 'a vitrine do Dummy deveria ter 4 poses');
await view('10-dummy.png', { pos: [0, spots.tpose[1] + 1.5, spots.tpose[2] + 8.5], look: [0, spots.tpose[1] + 0.9, spots.tpose[2]], fov: 55 });
const dcCity = await drawCalls();
console.log('draw calls (bairro) =', dcCity);
await assert(dcCity <= 150, `acima do orçamento de 150 draw calls no bairro: ${dcCity}`);

await browser.close();
const fatal = errors.filter((e) => !/pointer ?lock|AudioContext|GPU stall|GL Driver Message/i.test(e));
if (fatal.length) { console.error('erros no console:', [...new Set(fatal)].slice(0, 5)); process.exit(1); }
console.log('smoke ok — olhe as screenshots em', shots);
