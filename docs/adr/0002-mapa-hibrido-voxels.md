# ADR 0002: Mapa híbrido — ilha em heightfield, estruturas em voxels

**Status:** aceita · 21/11/2026 · fatia M0.1 (`Claude/Prompts/PLANO_M0_proposta.md`)

## Contexto

O Erick quer mapas do tamanho das ilhas do Polygonizer e destruição total estilo voxel. Voxel de 0,5 m na ilha inteira não cabe: 4 km × 4 km × 64 m dariam ~16 bilhões de voxels. A decisão dele foi o mapa híbrido.

## Decisão

### Ilha (`src/procgen/terrain.ts`, `data/world/mundo.json`)
- 3000 m de lado, 257 vértices (~11,7 m por vértice), raio da ilha 1050 m (~2 km de terra), morros até 140 m.
- **Platô central** para o bairro: plano em 14 m até 150 m do centro (medido no eixo, quadrado), misturando com o relevo em 160 m (`plateauHalf`, `plateauBlend`, `plateauHeight`). Sem árvores no platô.

### Voxels (`src/sim/voxels.ts`)
- `VoxelGrid` esparso: 1 byte por voxel (0 = vazio, demais = material), chunks de 32³ alocados só quando têm algo.
- Consultas puras: `get/set/fill`, `solidAtWorld`, `topAt` (topo da coluna), `checksum`.

### Bairro (`src/procgen/district.ts`, `data/world/bairro.json`)
- 256 × 256 m e 64 m de altura = 512 × 128 × 512 voxels; origem em y = 13,5 m, então o asfalto (2 voxels) termina em 14,5 m e esconde o platô, 0,5 m abaixo. A borda do bairro vira um meio-fio de 0,5 m.
- Ruas de 10 m em grade de 64 m, faixa central tracejada, calçadas de 3 m elevadas 0,5 m (meio-fio).
- Lotes divididos em até 8 prédios com vielas de 2 m. Prédios **ocos**: paredes de 1 voxel, laje a cada andar (3 m), linha escura por andar, janelas, vitrine no térreo, telhado com platibanda e caixa d'água. Mais altos perto do centro (2 a 12 andares).
- Marco central: torre envidraçada de 18 andares com antena vermelha (topo em ~75 m).
- Materiais por índice (`MAT`), cores na paleta do JSON; 7 cores de parede.
- Editor F1, seção **Bairro**: seed, andares, torre, quarteirão, rua e calçada. Mudar regenera na hora.

### Malha (`src/procgen/voxel-mesher.ts`)
- *Greedy meshing* por coluna de 64 × 64 voxels (32 × 32 m): só faces entre sólido e vazio, retângulos iguais fundidos, vizinhos lidos do grid (sem faces entre colunas), sem a face de baixo do grid.
- 1 malha (1 draw call) por coluna: 64 no bairro inteiro, menos com o corte por frustum.

### Mundo da física (`src/sim/arena.ts`)
- `Arena` implementa `WorldQuery`: chão = maior entre terreno e topo dos voxels; `solidAt` = voxel sólido.

## Consequências

- Testes novos em `tests/bairro.test.ts`: hash do bairro travado (`21704978`), ruas livres, meio-fio de 1 voxel, torre mais alta, arena coerente com terreno e voxels, malha sem faces escondidas e fundida por material.
- Hash da ilha mudou de propósito (`419332219`, ilha nova com platô); 811 árvores (a ilha é menor que o quadrado de amostragem).
- Medido no smoke: 59 prédios, 64 malhas, **~172 mil triângulos** no bairro, **69 draw calls** na vista do bairro (meta ≤ 150).
- Os triângulos internos dos prédios ocos são desenhados (paredes por dentro). Se o celular sofrer, a primeira economia é cortar faces internas não visíveis de fora.
- Rios e lagos ainda não existem (só o mar); entram quando os veículos aquáticos tiverem marco.
- Redesenhar uma coluna depois de um tiro é o assunto da M0.6.

## Atualização (21/11/2026): cidade dobrada com periferia de casas

Pedido do Erick: dobrar a área urbana com casas na periferia.

- Cidade de **384 × 384 m** (2,25× a área): o centro de prédios continua com 256 m (`coreHalfM` = 128) e ganhou um anel de quarteirões de casas em volta. Platô da ilha alargado para 215 m.
- **Casas** (`houseBlock`, `house` em `district.ts`): lotes de 12 m gramados; as casas ficam na borda do quarteirão, viradas para a rua, com jardim na frente, e o miolo do quarteirão vira quintal com árvores. 1 ou 2 andares (30%), paredes ocas, porta de 1 × 2,5 m, janelas e telhado de duas águas em degraus de 45° com beiral. 6 cores de parede e 4 de telha.
- **Árvores de voxel** nos quintais: tronco de 2 m e copa arredondada.
- Novos parâmetros no F1: raio do centro, lote de casa, chance de 2 andares e de árvores.
- Malhas por coluna de 48 × 48 m (eram 32 m) para manter **64 malhas**: 69 draw calls na vista da cidade inteira.
- Medido: 59 prédios, **240 casas**, ~2,9 milhões de voxels em 820 chunks (~26 MB), **~310 mil triângulos**.
- Hashes atualizados de propósito: cidade `-719087486`, ilha `-1438949356` (751 árvores).
- Ponto de atenção: memória e triângulos subiram; no celular, a primeira economia continua sendo cortar as faces internas, e a segunda, chunks menores no eixo vertical para não alocar 32 KB por chunk quase vazio de chão.
