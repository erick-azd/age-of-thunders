# ADR 0011: Celular — controles de toque, perfil visual e medidor de desempenho

**Status:** aceita · 22/11/2026 · fatia M0.7b (`Claude/Prompts/PLANO_M0_proposta.md`); fecha as entregas do M0

## Contexto

O portão do M0 é o Erick jogar no desktop **e no celular** e aprovar a sensação. Faltavam os controles de toque, um perfil leve para o celular, um jeito de ver o FPS no aparelho e um jeito de abrir o jogo no celular.

## Decisão

### Controles de toque (`src/core/touch.ts`)
- **Joystick** à esquerda: para os lados vira, para cima acelera, para baixo freia e dá ré (zona morta de 15%).
- **Mira:** arrastar o dedo na metade direita gira a câmera (como o mouse).
- **Botões** à direita: **TIRO** (segurar = rajada), **DERRAPAR** (segurar) e **FORMA** (toque).
- Tocar na tela de título começa o jogo ("Toque para começar").
- Feitos com Pointer Events (dedo, caneta ou mouse). Entram na mesma `Input` do teclado e do controle, então tudo o que existe vale nos três.
- Com toque ligado, o HUD de forma e o placar mudam de lugar para não ficar embaixo dos controles; em telas baixas (celular deitado) o HUD fica mais compacto.

### Perfil visual (`data/config/perfis.json`, `src/game/profile.ts`)
- **padrão:** densidade de pixels até 2, antialias, visão até 12 km, neblina de 1,2 a 5,5 km, até 300 pedaços de entulho.
- **celular:** densidade até 1,25, sem antialias, visão até 1,6 km com neblina de 350 m a 1,5 km (esconde o corte), até 120 pedaços de entulho, medidor de desempenho ligado.
- Escolha automática: tela de toque = celular e controles de toque. Na URL: `?perfil=celular|padrao`, `?toque=1|0`, `?fps=1|0`.

### Medidor de desempenho
- F3 liga e desliga (ou `?fps=1`); no perfil celular já vem ligado. Mostra FPS (média móvel), tempo de quadro, draw calls, triângulos e o perfil.

### Jogar no celular
- `npm run dev` agora escuta na rede local e imprime o endereço para o celular (`celular: http://<ip-do-pc>:5173`). Basta o celular estar no mesmo Wi-Fi. O editor F1 só grava arquivos pelo PC.

## Consequências

- Smoke ganhou uma etapa de celular (844 × 390, toque, perfil celular): toca para começar, o joystick acelera, TIRO atira, FORMA transforma; confere draw calls ≤ 150; vista `14-celular.png`. Medido: ~66 draw calls; ~430 mil triângulos na vista da rua.
- O tempo de quadro do smoke (~130 ms) é do navegador sem GPU (SwiftShader) e não vale como medida: **o FPS de verdade é o do aparelho**, pelo medidor. Se ficar abaixo de 30 FPS, a ordem de economia é: cortar as faces internas dos prédios ocos (só aparecem por buracos), baixar a densidade para 1,0 e encurtar a visão.
- O Windows pode pedir permissão para o Node aceitar conexões da rede na primeira vez (decisão do Erick).
