# ADR 0012: Peças com nome e roda de formas

**Status:** aceita · 22/11/2026 · fatia M1.2 (`Claude/Prompts/PLANO_M1_proposta.md`)

## Contexto

No M1 a carcaça passa a ter quatro formas (carro, moto, hover e tanque). Casar as peças só pela ordem (ADR 0008) funcionava com duas formas, mas com quatro a transformação ficaria caótica. Também faltava um jeito de escolher a forma, e não só alternar.

## Decisão

### Peças com nome (`src/procgen/vehicle-shape.ts`)
- Cada peça pode ter um **nome de papel**, o mesmo em todas as formas: `chassi`, `frente`, `capo`, `lateral-e/d`, `faixa-e/d`, `luz-e/d`, `farol-e/d`, `lanterna-e/d`, `banco`, `encosto`, `comando` (volante ou guidão), `painel` (painel ou tanque), `motor`, `traseira` (aerofólio ou rabeta), `coluna-e/d`, `suporte-e/d`, `escape-e/d`, `paralama-…`, `arco`.
- `pairPieces` casa primeiro **pelo nome** (mesmo nome e tipo), depois o resto por tipo e brilho, da frente para trás; o que sobra nasce ou se recolhe.
- A forma guarda também o encaixe da torre (`turret`); a torre desliza junto na transformação.
- `VehicleView` aceita qualquer conjunto de formas e calcula os pares de cada (de → para) uma vez só; os buffers crescem se um par novo precisar de mais vértices.

### Roda de formas (`src/render/form-wheel.ts`)
- Quatro setores: **CARRO** (cima), **MOTO** (direita), **HOVER** (baixo), **TANQUE** (esquerda). Formas que ainda não existem aparecem apagadas com "em breve".
- **Controle:** toque rápido no Y troca para a próxima forma; segurar o Y por 0,25 s abre a roda, o analógico direito escolhe e soltar o Y confirma. A roda guarda a última direção (soltar o analógico junto com o botão não perde a escolha). Com a roda aberta, a câmera não gira.
- **Teclado e mouse:** Tab ou Q (toque rápido troca, segurar abre a roda e o mouse escolhe); teclas **1 a 4** escolhem direto.
- **Toque:** toque rápido no FORMA troca; segurar abre a roda, que fica aberta até tocar num setor (ou tocar de novo no FORMA para fechar). Um toque muito rápido não se perde entre dois quadros.
- Se o jogador for destruído com um pedido de transformação pendente, o pedido espera a volta.

## Consequências

- Testes novos: as peças de papel casam pelo nome (frente, capô, laterais, banco, comando, motor, traseira, luzes), os nomes não se repetem dentro de uma forma, a transformação moto → carro também começa e termina certo, e a direção do analógico vira o setor certo da roda.
- Smoke: toque rápido no Y vira moto; segurar o Y abre a roda, para cima escolhe CARRO e soltar transforma (`15-roda-de-formas.png`); no celular, toque rápido no FORMA.
- Hover e tanque entram na roda quando existirem (M1.3 e M1.4); basta acrescentar a forma em `FORMS` e as peças com os mesmos nomes.
