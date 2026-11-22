# ADR 0001: Ferramentas e estrutura (M0)

**Status:** aceita · 21/11/2026

## Contexto

Projeto novo criado a partir do kit da skill `jogo-web-3d-base` (aprendizados do Polygonizer).

## Decisão

- **Linguagem e motor:** TypeScript com Three.js 0.170, Zod para os dados.
- **Build:** esbuild (`build.mjs`) gerando um HTML único (`dist/age-of-thunders.html`), que abre direto no navegador e publica como link; `npm run dev` serve com rebuild e o endpoint do editor.
- **Testes:** `node:test` com `tsx`; smoke no navegador com Playwright (Chromium sem GPU, SwiftShader).
- **Arquitetura:** `src/sim` e `src/procgen` puros e determinísticos (`tests/pureza.test.ts`); dados em `data/` validados por Zod; editor F1 gerado das specs; API de depuração em `window.game`.

## Consequências

- O kit sai com uma cena de exemplo (ilha procedural, planador, árvores instanciadas, céu em degradê) que deve ser trocada pela do jogo no M0.
