// Build com esbuild (ADR 0001 do Polygonizer).
//   node build.mjs          → dist/age-of-thunders.html (arquivo único, abre direto no navegador)
//   node build.mjs --serve  → servidor de desenvolvimento em http://localhost:5173 com rebuild automático
//                             e o endpoint local do editor (POST /__editor/save grava em data/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const serve = process.argv.includes('--serve');
const OUT = 'age-of-thunders';

const options = {
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  write: false,
  outdir: join(root, 'dist'),
  loader: { '.json': 'json', '.css': 'css' },
  legalComments: 'none',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': serve ? '"development"' : '"production"' },
};

/** Junta JS e CSS no index.html (um arquivo só, que abre por file:// e publica como link). */
function assemble(result) {
  const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const tpl = readFileSync(join(root, 'src/index.html'), 'utf8');
  const safeJs = js.replace(/<\/script/gi, '<\\/script'); // "</script>" dentro do bundle não pode fechar a tag
  return tpl.replace('<!--APP_CSS-->', `<style>\n${css}</style>`).replace('<!--APP_JS-->', () => `<script>\n${safeJs}</script>`);
}

/** Editor: grava JSON em data/ (só conexões locais, só dentro de data/). */
function handleSave(req, res) {
  if (req.method !== 'POST' || req.url !== '/__editor/save') return false;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      if (!local) throw new Error('só local');
      const { path, data } = JSON.parse(body);
      const file = normalize(join(root, 'data', path));
      if (relative(join(root, 'data'), file).startsWith('..') || !file.endsWith('.json')) throw new Error('caminho inválido');
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: String(e) }));
    }
  });
  return true;
}

if (!serve) {
  const result = await esbuild.build(options);
  mkdirSync(join(root, 'dist'), { recursive: true });
  const html = assemble(result);
  writeFileSync(join(root, `dist/${OUT}.html`), html);
  console.log(`dist/${OUT}.html  ${(html.length / 1024).toFixed(0)} KB`);
} else {
  let html = '<p>compilando…</p>';
  const ctx = await esbuild.context({
    ...options,
    plugins: [{
      name: 'assemble',
      setup(b) {
        b.onEnd((r) => { if (r.errors.length === 0) { html = assemble(r); console.log(`[${new Date().toLocaleTimeString()}] rebuild ok`); } });
      },
    }],
  });
  await ctx.watch();
  createServer((req, res) => {
    if (handleSave(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  }).listen(5173, () => console.log('dev: http://localhost:5173  (Ctrl+C para sair)'));
}
