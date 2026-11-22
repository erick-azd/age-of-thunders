// Gera o PDF do GDD a partir do Markdown (docs/gdd/*_GDD.md), com capa e imagens do jogo.
// Uso: node tools/gdd-pdf.mjs   → docs/gdd/age-of-thunders_GDD_v<versão>.pdf
// Converte o subconjunto de Markdown que o GDD usa (títulos, parágrafos, listas, tabelas, negrito,
// código) e imprime com o Chromium do Playwright (o mesmo do smoke).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gddDir = join(root, 'docs/gdd');
const md = readFileSync(join(gddDir, 'age-of-thunders_GDD.md'), 'utf8');
const version = (md.match(/\*\*Versão:\*\*\s*([\d.]+)/) ?? [, '0'])[1];
const date = (md.match(/\*\*Versão:\*\*\s*[\d.]+\s*·\s*([\d/]+)/) ?? [, ''])[1];
const img = (f) => `data:image/png;base64,${readFileSync(join(gddDir, 'img', f)).toString('base64')}`;

// Imagens depois de cada seção (número da seção → figuras).
const FIGURES = {
  3: [['carro.png', 'Pilotar: o carro a 131 km/h na rua central.'], ['moto.png', 'A moto inclina nas curvas e nunca cai.']],
  4: [['dummy.png', 'O Dummy: piloto-mecha de 1,8 m, branco, azul e laranja, com painéis luminosos.']],
  6: [['transformacao.png', 'Transformação carro → moto: 0%, 25%, 50%, 75% e 100%. As peças sobem num arco, giram e mudam de tamanho em volta do Dummy.']],
  8: [['ilha.png', 'A Ilha do Trovão (~2 km) com a cidade no platô central.'], ['periferia.png', 'Periferia industrial: galpões com telhado em serra, pátio de contêineres com pórtico, via elevada.'], ['via-elevada.png', 'Via elevada a 8 m cruzando a rua, com mureta iluminada.']],
  9: [['mira.png', 'Em jogo: a torre do canhão no santantônio e a mira no centro da tela.'], ['explosao.png', 'Tiro: clarão, entulho na cor do material e buraco no galpão.']],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

function toHtml(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0, section = 0;
  const flushFigures = () => {
    const figs = FIGURES[section] ?? [];
    if (!figs.length) return;
    out.push(`<div class="figs${figs.length > 1 ? ' duas' : ''}">${figs.map(([f, cap]) => `<figure><img src="${img(f)}"><figcaption>${esc(cap)}</figcaption></figure>`).join('')}</div>`);
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^# /.test(l) || /^\*\*Versão/.test(l)) { i++; continue; } // vão para a capa
    if (/^## /.test(l)) {
      flushFigures();
      const t = l.slice(3);
      section = Number((t.match(/^(\d+)\./) ?? [, 0])[1]);
      out.push(`<h2>${inline(t)}</h2>`);
      i++; continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l), items = [];
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]))) items.push(lines[i++].replace(/^\s*([-*]|\d+\.) /, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*[-*] |\s*\d+\. )/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  flushFigures();
  return out.join('\n');
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  :root { --azul: #2a56d8; --laranja: #f28a1a; --ciano: #1fbf86; --tinta: #1d2230; --cinza: #5a606c; --linha: #d9dde6; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: var(--tinta); font-size: 10.5pt; line-height: 1.45; margin: 0; }
  .capa { height: 257mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .capa .faixa { height: 6mm; background: repeating-linear-gradient(-45deg, #f5b81c 0 6mm, #262833 6mm 12mm); border-radius: 2px; }
  .capa h1 { font-size: 40pt; margin: 12mm 0 2mm; letter-spacing: 1px; color: var(--azul); }
  .capa .sub { font-size: 14pt; color: var(--cinza); margin: 0 0 8mm; }
  .capa img { width: 100%; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
  .capa .meta { font-size: 11pt; color: var(--cinza); border-top: 3px solid var(--laranja); padding-top: 4mm; }
  .capa .meta strong { color: var(--tinta); }
  h2 { font-size: 15pt; color: var(--azul); border-bottom: 2px solid var(--laranja); padding-bottom: 1.5mm; margin: 8mm 0 3mm; page-break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  strong { color: #0f1730; }
  code { font-family: Consolas, monospace; font-size: 9pt; background: #eef1f7; padding: 0 3px; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.3pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th { background: var(--azul); color: #fff; text-align: left; padding: 2mm; font-weight: 600; }
  td { border-bottom: 1px solid var(--linha); padding: 1.8mm 2mm; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f5f7fb; }
  .figs { margin: 3mm 0 5mm; }
  .figs.duas { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  figure { margin: 0 0 3mm; page-break-inside: avoid; }
  .figs:not(.duas) figure img { max-height: 95mm; object-fit: cover; }
  figure img { width: 100%; border-radius: 4px; border: 1px solid var(--linha); }
  figcaption { font-size: 8.8pt; color: var(--cinza); margin-top: 1.2mm; font-style: italic; }
</style></head><body>
<section class="capa">
  <div class="faixa"></div>
  <div>
    <h1>Age of Thunders</h1>
    <p class="sub">Game Design Document · combate veicular com transformação em cidades de voxels destrutíveis</p>
    <img src="${img('cidade.png')}">
  </div>
  <div class="meta"><strong>Versão ${version}</strong> · ${date}<br><strong>Dono do design:</strong> Erick · <strong>Implementação:</strong> Claude Code<br>Repositório: github.com/erick-azd/age-of-thunders</div>
</section>
${toHtml(md)}
</body></html>`;

const outPdf = join(gddDir, `age-of-thunders_GDD_v${version}.pdf`);
const tmp = join(gddDir, '_gdd.html');
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(tmp).href);
await page.pdf({
  path: outPdf, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-size:8px;color:#888;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial"><span>Age of Thunders · GDD v${version}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
});
await browser.close();
const { unlinkSync } = await import('node:fs');
if (!process.env.KEEP_HTML) unlinkSync(tmp);
console.log(outPdf);
