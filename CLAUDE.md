# Age of Thunders — guia para agentes de IA

O GDD completo está em `docs/gdd/age-of-thunders_GDD.md`. Esta é a versão operacional do guia para agentes. Base de processo e de código: a skill `jogo-web-3d-base` (aprendizados do Polygonizer).

## Regras invioláveis
1. Nunca copiar código, dados, nomes ou assets de jogos de referência. Estudar e reimplementar; comentar "inspirado em <jogo>: <o quê>".
2. `src/sim` e `src/procgen` são puros e determinísticos: sem Three.js, DOM, `Math.random`, `Date.now` ou `performance.now`. Use `core/rng.ts` e o tempo do loop (`tests/pureza.test.ts` vigia).
3. Dados antes de código: parâmetro novo de gameplay entra no esquema Zod + JSON em `data/` e aparece no editor F1 (specs).
4. Unidades: metros, segundos, radianos no código; graus só na UI e nos JSON (sufixo `Deg`). Eixos do Three.js: Y para cima, −Z é a frente.
5. Orçamentos são requisitos: até 150 draw calls por quadro e 30 FPS no celular (ajuste no GDD).
6. Nada de serviços pagos ou que gastem créditos (inclusive geração por IA) sem aviso e aprovação do dono do projeto.
7. Merges na `main` só com a aprovação do dono do projeto.

## Definição de pronto
- `npm run typecheck` sem erros
- `npm test` passando (lógica nova da sim/procgen com teste; hash travado atualizado só de propósito, com o motivo)
- `npm run build` e `npm run smoke` sem erros no console; olhar os screenshots em `tests/screenshots/`
- Parâmetros novos expostos no editor F1
- ADR curta em `docs/adr/` por decisão técnica; GDD atualizado quando muda o design
- Commit em Conventional Commits e push da branch

## Convenções
Arquivos `kebab-case.ts`, tipos `PascalCase`, IDs de dados `snake_case`. Código e nomes em inglês; textos de jogo e documentação em português. A API de depuração fica em `window.game` (smoke e `tools/` usam só ela).

## Ferramentas
- `npm run dev` — servidor em http://localhost:5173 com rebuild e o endpoint do editor (grava em `data/`)
- `node tools/view-shot.mjs <pasta> "nome|{ pos, look, fov }"` — screenshots de câmeras fixas
- `node tools/draw-calls.mjs` — draw calls por objeto da cena
