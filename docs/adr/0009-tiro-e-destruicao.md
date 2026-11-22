# ADR 0009: Tiro, cratera em voxels e re-malha por subcoluna

**Status:** aceita · 22/11/2026 · fatia M0.6 (`Claude/Prompts/PLANO_M0_proposta.md`)

## Contexto

O M0 precisa provar que dá para destruir a cidade atirando, sem travar o jogo. Decisões já aprovadas: mira pela câmera com o canhão numa torre (dirigir e atirar ficam independentes) e o veículo atropela entulho.

## Decisão

### Simulação (`src/sim/weapons.ts`, puro, `data/config/canhao.json` no F1)
- `fire`: projétil a 140 m/s da boca do canhão até o ponto mirado; cai devagar (4 m/s²) e some em 3 s.
- `stepProjectiles`: voo em subpassos de 25 cm (não atravessa parede de 0,5 m nem a 400 m/s); ao tocar voxel ou terreno, explode.
- `VoxelGrid.carveSphere`: a explosão arranca os voxels de uma esfera de 1,6 m de raio e devolve a lista do que saiu (determinística), que alimenta o entulho e a re-malha. Cadência de 0,22 s.
- `raycast`: o raio da câmera até o primeiro sólido (alcance de 320 m) define o ponto mirado.

### Mira e torre
- A câmera de perseguição ganhou **desvio de mira**: mouse (com o ponteiro preso no jogo, clique para prender e Esc solta) ou analógico direito giram e inclinam a câmera em volta do veículo. Sem mexer na mira por 2 s, ela volta para a frente.
- A mira é o centro da tela (círculo verde-ciano). O canhão atira da boca até o ponto que o raio da câmera tocar.
- **Torre** (`Turret` em `src/render/fx.ts`): base, corpo azul, cano com ponta luminosa. Fica no alto do santantônio no carro e na rabeta da moto (desliza junto na transformação) e gira para o alvo.
- Controles: RB/X ou clique/F atiram (segurar = rajada).

### Re-malha por subcoluna (`src/render/district-view.ts`)
- A malha da cidade agora é feita por subcolunas de 16 m (32 voxels), desenhadas em grupos de 48 m (continua 1 draw call por grupo, 64 no total).
- Depois de uma explosão, só as subcolunas tocadas (e as vizinhas, se o buraco encosta na borda) são refeitas; o grupo é remontado por concatenação. No máximo uma vez por quadro.

### Efeitos (`src/render/fx.ts`, só visuais)
- **Entulho:** até 40 cubos por explosão, na cor do material arrancado, voam para fora e para cima, quicam no piso, giram e somem em 3 a 5 s; limite de 300 (o mais velho sai).
- **Atropelar entulho:** o veículo chuta o entulho em que encosta, com a velocidade dele.
- **Clarões:** esfera laranja que cresce e some em 0,35 s na explosão e na boca do canhão.
- **Projéteis:** barras curtas verde-ciano luminosas.
- Cada efeito é um InstancedMesh: +4 draw calls no total (torre 2, entulho, clarões, projéteis... ~84 na vista da cidade).

## Consequências

- Testes novos em `tests/tiro.test.ts`: o projétil explode na face do muro e arranca uma esfera do tamanho certo (nada fora do raio), não atravessa parede de 0,5 m a 400 m/s, o buraco é determinístico, o projétil some no fim da vida, o raio da mira para no primeiro sólido, e refazer por subcoluna dá a mesma área de faces que refazer tudo.
- Smoke: atira com RB, depois 6 tiros na torre central; confere voxels arrancados e subcolunas refeitas; vista `12-cratera.png`. O smoke agora volta ao ponto de partida antes de cada etapa (a derrapagem às vezes deixava o veículo preso numa parede).
- O entulho é só visual: não bloqueia o veículo nem fica no grid. Prédio sem apoio ainda não desaba (M1).
- Ainda não há dano em veículos nem alvos: entram na M0.7, com o bot.

## Atualização (22/11/2026): sem esfera na explosão

O Erick achou que a esfera laranja da explosão (a ideia era um clarão, quase uma fumaça) não ficou boa e pediu para tirar por enquanto. A explosão agora mostra só o entulho e o buraco. Logo depois, a pedido dele, saiu também o clarão pequeno da boca do canhão: o tiro mostra só o projétil, o entulho e o buraco. A classe `Flashes` ficou no código para uma próxima tentativa (por exemplo, partículas de fumaça ou um anel no chão).

## Atualização (22/11/2026): tiro no gatilho esquerdo

No controle, mirar (analógico direito) e atirar (RB ou X) ao mesmo tempo ficou difícil. Pedido do Erick, em teste: **LT atira** (RB continua como alternativa) e **A freia e dá ré** (A segue confirmando na tela de título). X deixou de atirar. Teclado, mouse e toque não mudaram.
