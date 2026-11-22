# ADR 0004: O Dummy — peças rígidas, poses em dados e malha única

**Status:** aceita · 21/11/2026 · fatia M0.2 (`Claude/Prompts/PLANO_M0_proposta.md`)

## Contexto

O Dummy é o piloto fixo de todas as formas (GDD §6) e precisa aparecer no carro, na moto e, depois, nas outras carcaças. A referência são os bonecos articulados de `Claude/References/Images/Character_Dummy`: peças rígidas facetadas, juntas pretas aparentes, rosto liso. A cor do jogador é azul e preto.

## Decisão

### Modelo (`src/procgen/dummy.ts`, puro)
- 17 juntas: `root` (pelve), `spine`, `chest`, `neck`, `head`, e ombro, cotovelo e punho, quadril, joelho e tornozelo dos dois lados. O lado esquerdo do boneco é −X (frente em −Z).
- Cada junta tem uma peça desenhada no seu próprio espaço com o `MeshBuilder`: blocos octogonais esticados (`seg`) para o visual facetado, esferas pretas nas juntas, placas em V no peito, placas na coxa e joelheiras, cabeça lisa em três facetas com um vinco de viseira.
- Altura natural de 1,84 m, escalada para `heightM` (1,8 m, no F1). ~3,4 mil vértices.

### Poses (`data/config/dummy.json`)
- Uma pose é `rootY` (altura da pelve acima do chão ou do assento) e rotações por junta em graus `[x, y, z]`, aplicadas como Y · X · Z. Juntas ausentes ficam em zero.
- Convenção útil: em membros pendurados (−Y), +X leva para a frente; no tronco (+Y), +X inclina para trás.
- Poses da M0.2: `tpose`, `standing`, `car` (encostado, mãos no volante) e `bike` (inclinado para a frente, mãos no guidão, pés para trás).

### Desenho (`src/render/dummy-view.ts`)
- `writePose` transforma todos os vértices na CPU para um buffer só (`DynamicDrawUsage`): **1 draw call por Dummy**. O mesmo esquema vai servir para a carcaça que se transforma (M0.5), com interpolação entre poses.
- Vitrine provisória no gramado ao sul da cidade: as quatro poses lado a lado, com assentos provisórios para carro e moto (`buildShowcase`, posições em `window.game.showcaseSpots`).

## Consequências

- Testes em `tests/dummy.test.ts`: uma peça por junta (pai antes do filho), altura de 1,8 m e pés no chão em T, simetria, envergadura de gente, lado esquerdo em −X, poses sentadas com joelhos e mãos à frente e acima do assento, moto inclinada para a frente e carro encostado, pose determinística.
- Smoke: nova vista `10-dummy.png`; draw calls continuam ≤ 150 (68 na vista da cidade).
- Os assentos da vitrine são provisórios: o carro e a moto de verdade entram na M0.3 e na M0.4, e as poses serão ajustadas a eles.
- Ainda não há animação; interpolar poses (para a transformação e para virar o guidão) é da M0.5.
