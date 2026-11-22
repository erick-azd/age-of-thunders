# ADR 0005: Estilo arcade de mecha dos anos 90

**Status:** aceita · 22/11/2026 · ajuste da M0.2, pedido do Erick (referências em `Claude/References/Images/Virtual On` e `Videos/Virtual On`)

## Contexto

O Erick quer o visual próximo dos arcades de mecha da Sega em placa Model 2, no jogo inteiro, com o Dummy em escala humana (1,8 m) e paleta branco, azul e laranja. A regra do projeto continua valendo: estudar o estilo e criar um design próprio, sem copiar robôs, nomes, armas ou HUD.

## Decisão

### Cor e luz
- **Cores sRGB convertidas para linear** (`linearColors` em `src/render/mesh-utils.ts`, usado por `toGeometry` e pelo `DummyView`). Antes o Three.js recebia sRGB como se fosse linear e tudo ficava lavado; agora os dados têm a cor que se vê num editor de imagem, e o resultado é saturado como um arcade.
- Luz neutra: hemisférica `#e4f0ff` / `#8c8478` (1,7) e sol branco (2,1). A luz verde do kit deixava o branco cinza e o laranja com cara de mostarda.

### Dummy (`src/procgen/dummy.ts`, `data/config/dummy.json`)
- Mesma estrutura de 17 juntas e as mesmas poses; muda a armadura.
- Paleta: `white` (corpo), `armor` (azul), `accent` (laranja), `frame` (cinza), `dark` (juntas), `glow` (verde-ciano).
- Silhueta arcade: peitoral azul largo, ombreiras grandes com ponta laranja e faixa luminosa, antebraços robustos com punho azul, canelas que alargam para baixo, joelheiras com luz, pés grandes com calcanhar laranja, cabeça pequena com viseira luminosa, crista e "orelhas" laranja, mochila com dois propulsores e luzes.
- Partes que brilham são desenhadas num segundo `MeshBuilder` por peça e marcadas em `rig.glow` (atributo `glow` do material, ADR 0003): continua **1 draw call**.

### Cidade e ilha
- Paleta saturada: asfalto azulado, faixa branca, paredes em branco, azul-acinzentado e laranja-ferrugem, piso industrial ferrugem, contêineres vivos, brilho principal verde-ciano. Céu e mar mais azuis, grama um pouco mais escura para não ficar neon.
- Os voxels não mudaram: os hashes travados continuam os mesmos.

### HUD
- Registrado no GDD §9: barras grandes no topo, cronômetro, mira circular e números monoespaçados. Entra na M0.7.

## Consequências

- Teste novo: o Dummy tem um brilho por vértice e painéis luminosos (< 10% dos vértices).
- 17 testes e smoke ok; 68 draw calls na vista da cidade.
- A conversão de cor vale para tudo o que usa `toGeometry` (terreno, árvores, cidade, adereços). Cores novas nos JSON devem ser escolhidas como sRGB, do jeito que aparecem num seletor de cor.
