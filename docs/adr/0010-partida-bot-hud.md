# ADR 0010: Partida do M0 — vida, alvos, bot e HUD arcade

**Status:** aceita · 22/11/2026 · fatia M0.7a (`Claude/Prompts/PLANO_M0_proposta.md`); controles de toque e perfil de celular ficam para a M0.7b

## Contexto

O portão do M0 pede uma arena com alvos, um bot simples que dirige e atira, e o HUD arcade combinado no GDD §9.

## Decisão

### Partida (`src/sim/match.ts`, pura, `data/config/combate.json` no F1)
- `MatchState`: combatentes (id 0 = jogador, 1… = bots), alvos, projéteis com dono, tempo e RNG. `stepMatch` roda tudo num passo fixo; a mira e a boca do canhão do jogador entram como comando.
- **Vida e dano:** 100 de vida; acerto direto 14 + explosão até 10 (cai a zero em 2× o raio). Quem atira não se fere com o próprio tiro. Zerou: é abatido (estilhaços na cor do time), conta abate e derrota, e volta em 3 s (o jogador no ponto de partida, o bot num cruzamento a mais de 60 m dele).
- **Alvos:** 8 torres-sinalizadoras na quina da calçada de cruzamentos internos, 30 de vida, voltam em 15 s; derrubar conta ponto.
- Os projéteis agora têm dono e acertam a carroceria (caixa orientada com folga para o Dummy) e os alvos, além de voxels e terreno.

### Bot (`src/sim/bot.ts`)
- Anda só pelas **ruas internas** (grafo de cruzamentos): as da borda são meia rua e recebem as pontas das rampas, onde ele empacava.
- **No meio da rua** (curvas mais abertas); sob as vias elevadas usa a faixa da direita, longe dos pilares. Mira um ponto 10 m à frente na linha da faixa (não corta caminho).
- Planeja a próxima curva e reduz para 8 m/s antes de virar; cruzeiro ~25 m/s. Nunca dá meia-volta no cruzamento (contorna o quarteirão).
- Vê o jogador a até 130 m com linha de visão livre (checada a cada 0,25 s): passa a ir para o cruzamento mais perto dele e atira a até 90 m, com 3,5° de erro, a cada 0,6 s.
- Empacou (velocidade < 1,5 m/s por 1,2 s): ré de 0,9 s virando ao contrário.
- Cores do time do bot: armadura vermelha, detalhes amarelos, brilho laranja. A torre dele gira para o jogador quando o vê.

### Mapa
- Via elevada com **um pilar por trecho**, no meio (antes eram três; o primeiro, a 16 m do cruzamento, pegava quem virava para baixo da via). Hash da cidade atualizado.

### HUD arcade (`src/render/hud.ts`, DOM, 0 draw call)
- Topo: barra inclinada de vida **VOCÊ** (verde-ciano, à esquerda) e **INIMIGO** (laranja, à direita) com o número, piscando ao levar dano; **cronômetro** grande no meio (mm'ss"cc).
- Embaixo à esquerda: forma (CARRO, MOTO, TRANSFORMANDO) e velocidade em km/h. Embaixo à direita: abates, derrotas e alvos derrubados (e quantos estão de pé).
- Mira no centro, que pisca em laranja quando o tiro acerta. Faixa "DESTRUÍDO · VOLTA EM N" quando o jogador cai.
- Estilo próprio, inspirado nos arcades de mecha dos anos 90 (sem copiar o HUD da referência).

### Vistas
- `game.ts` reorganizado em torno da partida: uma vista por combatente (veículo, Dummy e torre na cor do time), alvos instanciados (`src/render/targets.ts`, 1 draw call).

## Consequências

- Testes novos em `tests/partida.test.ts`: o bot patrulha 90 s sem sair da cidade e anda mais de 900 m; vendo o jogador perto, atira e acerta; dano direto + explosão abate, conta ponto e o bot volta com a vida cheia; o jogador derruba um alvo, que volta depois; a partida é determinística (mesma seed e comandos, mesmo estado e mesmos buracos).
- Smoke: confere 1 bot e 8 alvos, o HUD visível, um alvo derrubado com tiros e o bot andando; vista `13-hud.png`. 90 draw calls na vista da cidade inteira (meta ≤ 150).
- O bot ainda não sobe as vias elevadas, não se transforma e não desvia de tiros. O entulho não bloqueia ninguém.
