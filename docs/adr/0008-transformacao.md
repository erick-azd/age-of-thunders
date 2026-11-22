# ADR 0008: Transformação animada por peças

**Status:** aceita · 22/11/2026 · fatia M0.5 (`Claude/Prompts/PLANO_M0_proposta.md`)

## Contexto

O coração do jogo: o Dummy é sempre o mesmo e a carcaça se remonta em volta dele (GDD §6). Decisões já aprovadas: a transformação dura ~0,6 s, as peças deslizam e giram, a física troca no meio e a velocidade se mantém.

## Decisão

### Simulação (`src/sim/vehicle.ts`, puro, `data/config/transformacao.json` no F1)
- `VehicleState` = estado do veículo + `form` (destino), `morphFrom`, `morphT` (0 a 1) e `physForm` (a física que vale agora).
- `startMorph` recusa durante outra transformação e quando a nova carroceria não cabe no lugar.
- `stepVehicle` avança `morphT` em `durationS` (0,6 s) e troca a física em `switchAt` (50%), **só se a nova carroceria couber**; se não couber, segue com a física antiga até caber. Posição, rumo e velocidade não mudam.

### Carcaças como peças (`src/procgen/vehicle-shape.ts`)
- Carro e moto viraram **listas de peças**: caixas e cilindros unitários com posição, rotação, tamanho, três cores (topo, base, lado) e brilho. Visual igual ao da M0.3 e M0.4.
- `pairPieces` casa as peças das duas formas por tipo e brilho, ordenadas da frente para trás (a frente do carro vira a frente da moto). Peças sem par nascem ou se recolhem até sumir, perto do centro.
- `morphPiece`: com suavização (começa e termina devagar), cada peça desliza num **arco para cima** (até 35 cm), abre um pouco para os lados, **gira meia volta em Y** (uma em cada três para cada lado) e muda de tamanho e de cor.
- As quatro rodas do carro viram as duas da moto (cada par se junta numa só) e mudam de raio e largura.
- O Dummy muda de pose junto (`lerpPose`, carro → moto) e o assento desliza.

### Vista (`src/render/vehicle-view.ts`)
- Carcaça numa malha só com as peças transformadas na CPU (**1 draw call**), rodas instanciadas (1) e o Dummy (1). Só recalcula quando o progresso muda.
- Substitui `car-model.ts` e `car-view.ts`.
- Vitrine ao sul da cidade: carro, 25%, 50%, 75% da transformação e moto, lado a lado.
- Tab, Q ou Y transformam (a troca instantânea da M0.4 saiu).

## Consequências

- Testes novos em `tests/transformacao.test.ts`: duração exata, física trocando em 50%, sem perda de velocidade além do rolamento, recusa quando não cabe e física esperando caber, pontas da transformação exatamente iguais ao carro e à moto, peças subindo no meio, rodas casando, pose do Dummy indo do carro à moto.
- Smoke: transforma com Y, fotografa no meio (`02c-transformando.png`) e depois de moto (`02d-moto.png`); vista da vitrine `11-transformacao.png`. 79 draw calls na vista da cidade (a vitrine tem 5 veículos).
- Com mais formas (M1: hover e tanque), o casamento por pares continua valendo para qualquer par de formas; para não ficar caótico, pode valer dar nomes às peças (ex.: "roda-dianteira") e casar por nome.
