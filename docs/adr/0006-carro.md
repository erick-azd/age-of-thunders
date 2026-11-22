# ADR 0006: Carro arcade sobre voxels

**Status:** aceita · 22/11/2026 · fatia M0.3 (`Claude/Prompts/PLANO_M0_proposta.md`)

## Contexto

Primeira forma jogável. Decisões já aprovadas para o M0: a parede faz quicar (não é acidente), o veículo sobe o meio-fio de 0,5 m e a transformação mantém a velocidade. A cidade é de voxels de 0,5 m sobre um terreno em heightfield (ADR 0002).

## Decisão

### Física (`src/sim/car.ts`, puro, parâmetros em `data/config/carro.json` e no F1)
- Velocidade decomposta em **frente** e **lado**. Aceleração 16 m/s², máxima 38 m/s (137 km/h), freio 34 m/s², ré até 12 m/s, arrasto e resistência de rolagem.
- **Direção:** nula parado, cheia a partir de 7 m/s, 55% em velocidade máxima; respeita o sentido da marcha (ré inverte).
- **Aderência lateral** (9/s) apaga a velocidade de lado; com **freio de mão** cai para 1/s e o giro sobe 50%: derrapagem controlável.
- **Degrau automático** até 0,55 m: o carro sobe meio-fio e as rampas da via elevada (degraus de 0,5 m a cada 2 m), mas não um degrau de 1 m.
- **Paredes:** a carroceria (2 × 4,2 × 1,4 m) é testada no contorno, em três alturas acima do degrau. Ao bater, desliza no eixo livre e o eixo bloqueado volta com 35% (quique). Girar contra uma parede é recusado.
- Movimento em subpassos de 25 cm (nada atravessa uma parede de 0,5 m a 137 km/h).
- **Gravidade** 24 m/s² quando sai do chão; desce rampas e degraus pequenos colado ao piso.
- Inclinação visual (pitch e roll) pelos pisos sob os cantos; giro das rodas e esterço só para a vista.
- Cair na água ou abaixo de −60 m leva de volta ao ponto de partida.

### Mundo
- `VoxelGrid.floorBelow(x, z, yMax)`: topo do voxel sólido mais alto que **tem ar em cima** e não passa de `yMax`. O meio de uma parede não serve de degrau; sob a via elevada, o piso é a rua.
- `Arena.floorAt` junta isso ao terreno.

### Modelo e vista
- `src/procgen/car-model.ts`: buggy arcade de cockpit aberto na paleta do Dummy (branco, azul, laranja), bico em cunha, pontões com faixa luminosa, santantônio, aerofólio laranja, faróis e lanternas que brilham. Design próprio.
- `src/render/car-view.ts`: carroceria (1 draw call), rodas instanciadas (1) e o Dummy na pose `car` (1).
- Câmera de perseguição presa ao carro, 7,5 m atrás e 3,1 m acima; só o giro é suavizado, pelo tempo real (não depende da taxa de quadros).
- Controles no GDD §5: RT/W acelera, LT/S freia e dá ré, B/Espaço freio de mão.

### Limpeza
- O planador de exemplo do kit (`src/sim/player.ts`, `data/config/player.json`) saiu; o teste de pureza agora roda o carro na cidade.

## Consequências

- Testes novos em `tests/carro.test.ts`: aceleração e determinismo, parede de 3 m (para, quica, nunca atravessa), meio-fio de 0,5 m sim e degrau de 1 m não, rampa até 4 m sem bater, derrapagem com freio de mão, queda de um platô com pouso, e 9 s pela rua central da cidade passando sob a via elevada sem bater.
- Smoke: o carro acelera 3 s pela rua sem bater; vistas `02-carro.png` e `02b-derrapagem.png`. 72 draw calls na vista da cidade.
- A câmera ainda atravessa paredes em curvas fechadas; um recuo por raio entra quando incomodar.
- A vitrine ao sul da cidade agora mostra o carro de verdade estacionado; a moto continua com assento provisório até a M0.4.
