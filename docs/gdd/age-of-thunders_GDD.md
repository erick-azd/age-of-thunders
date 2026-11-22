# Age of Thunders — Game Design Document

**Versão:** 0.2 · 22/11/2026 · **Dono do design:** Erick · **Implementação:** Claude Code

## 1. Visão

Você é o **Dummy**, um piloto-mecha de 1,8 m que pilota uma carcaça mecânica capaz de se remontar, em segundos, em carro, moto, hover, tanque, helicóptero ou avião. Combate em arenas urbanas de voxels, onde tudo pode ser destruído: cada tiro arranca blocos e, mais adiante, prédios sem apoio desabam.

- **Gênero:** combate veicular em arena, 3ª pessoa, com transformação.
- **Plataforma:** navegador, desktop (teclado/mouse e gamepad) e celular (toque), build em HTML único.
- **Sessão típica:** partidas de 3 a 5 minutos.
- **Oponentes:** bots agora; online num marco futuro (a simulação pura já nasce pronta para rodar num servidor).
- **Estilo:** arcade de mecha dos anos 90, polígonos chapados e cores saturadas.

## 2. Referências

| Referência | O que estudar | O que evitar |
| --- | --- | --- |
| Bonecos articulados impressos em 3D (`References/Images/Character_Dummy`) | Peças rígidas, juntas aparentes, rosto liso facetado | Copiar um modelo de produto específico; o Dummy é desenho nosso |
| Arcades de mecha dos anos 90 em placa Model 2 (`References/Images/Virtual On`) | Cores saturadas (branco, azul, laranja), armadura em placas, ombros e pés grandes, painéis luminosos, arenas com faixas fortes, HUD arcade de barras grandes e cronômetro | Copiar robôs, nomes, armas ou o HUD do jogo; o design é nosso |
| Polygonizer (projeto do Erick) | Ilha urbana como arena, orçamento de draw calls, colisões tolerantes | Túneis e tetos que a física não sustenta |
| Jogos de voxel destrutível (gênero) | Destruição por blocos, desabamento por falta de apoio, entulho | Mundo blocado demais; aqui o voxel é de 0,5 m e chapado como o low-poly |
| Combate veicular em arena (gênero) | Ritmo de partida curta, coleta de armas e reparo | Controles de simulação; aqui é arcade |

Regra: estudar e reimplementar, nunca copiar código, dados, nomes ou assets.

## 3. Sensação de jogo

Verbos do jogador:

1. **Pilotar:** cada forma tem física própria e legível. Carro aderente, com derrapagem controlável no freio de mão; moto ágil, que inclina nas curvas e nunca cai; sobe meio-fio de 0,5 m e rampas; bater numa parede faz quicar, não é acidente. Valores iniciais generosos, ajustáveis no editor F1.
2. **Transformar:** um botão. Em 0,6 s as peças da carcaça sobem num arco, giram e mudam de tamanho em volta do Dummy até virar a outra forma; a velocidade e a direção não mudam. Deve ser **satisfatório de ver** e útil no combate (passar onde o carro não cabe, fugir pelo ar, virar tanque para aguentar dano).
3. **Atirar:** a mira é o centro da tela; a câmera gira em volta do veículo e o canhão, numa torre, aponta sozinho. Dirigir e atirar ficam independentes.
4. **Destruir:** cada tiro arranca uma esfera de voxels e solta entulho; derrubar a cobertura do inimigo (e, no M1, um prédio inteiro) é tática, não só efeito.

## 4. Visual e orçamento

- **Estilo geral: arcade de mecha dos anos 90.** Polígonos chapados com cores saturadas (cores dos dados em sRGB, convertidas para linear), luz de céu fria e sol branco forte, painéis que brilham sem custo de draw call.
- **Personagem:** o Dummy, piloto-mecha de 1,8 m e 17 juntas, montado por código: corpo branco, armadura azul, detalhes laranja, juntas escuras, viseira e painéis verde-ciano luminosos, ombreiras e pés grandes, mochila com propulsores. Cor da armadura por time.
- **Veículos:** carcaças feitas de peças (caixas e cilindros) na mesma paleta, que se reorganizam entre as formas.
- **Mundo:** mapa híbrido. A ilha é terreno low-poly (heightfield); tudo o que é construído é voxel de **0,5 m**, destrutível, com cor chapada por face e malha otimizada.
- **Cidade: industrial-militar.** Concreto escuro, aço, janelas em fita, faixas de perigo amarelo e preto, faixas de luz verde-ciano nas fachadas, luzes vermelhas em antenas e chaminés. Centro de torres em recuo (algumas gêmeas com passarela, helipontos no topo) e periferia de galpões, pátios de contêineres, tanques e data centers. Duas vias elevadas sobre as ruas.
- **Orçamento:** até 150 draw calls por quadro (medido: ~84 na vista da cidade inteira); 30 FPS no celular; build em HTML único (~600 KB).
- **Perfis visuais:** padrão e celular (`data/config/perfis.json`). O celular usa menos pixels, sem antialias, visão de 1,6 km com neblina e menos entulho. Escolha automática pela tela de toque, ou `?perfil=celular|padrao` na URL. Medidor de FPS: F3, `?fps=1`, ligado no celular.

## 5. Controles

| Ação | Gamepad | Teclado/mouse | Toque |
| --- | --- | --- | --- |
| Direção | Analógico esquerdo | A/D ou ←/→ | Joystick à esquerda (para os lados) |
| Acelerar | LT | W ou ↑ | Joystick para cima |
| Freio / ré | A | S ou ↓ | Joystick para baixo |
| Freio de mão (derrapar) | B | Espaço | Botão DERRAPAR |
| Câmera / mira | Analógico direito | Mouse (clique no jogo para prender; Esc solta) | Arrastar na metade direita |
| Atirar | RT (ou RB) | Clique esquerdo ou F | Botão TIRO |
| Transformar | Y (no futuro, segurar abre a roda de formas) | Tab ou Q | Botão FORMA |
| Começar | A | Enter | Tocar na tela |
| Editor | — | F1 | — |
| Medidor de FPS | — | F3 | ligado no perfil celular |

## 6. O Dummy e as formas

O **Dummy é sempre o mesmo personagem** e fica visível: sentado no cockpit do carro, montado na moto e, depois, no hover, no tanque e nas aeronaves. Isso preserva a identidade do jogador entre as formas. A carcaça é que se transforma.

| Forma | Papel | Marco | Estado |
| --- | --- | --- | --- |
| Carro (4 rodas) | Equilíbrio, padrão de partida; 137 km/h | M0 | Pronto |
| Moto (2 rodas) | Velocidade e manobra; 158 km/h, passa em vãos de 1,5 m | M0 | Pronto |
| Hover | Mobilidade, atravessa água e entulho | M1 | — |
| Tanque | Resistência e dano alto, lento | M1 | — |
| Helicóptero | Pairar e atirar de cima | M2 | — |
| Avião | Velocidade no ar, passadas | M2 | — |
| Aquáticos (lancha, jet ski, a definir) | Rotas pelo mar, rios e lagos; emboscadas pela água | A definir | — |

A estudar: o Dummy sair da carcaça e lutar a pé (pistola, katana) num marco posterior.

## 7. Modos de jogo

- **M0:** arena livre com 8 alvos e um bot simples que patrulha, persegue e atira (pronto na M0.7).
- **M1:** mata-mata contra bots (pontos por abate, reaparecimento).
- **Futuro:** times, captura de bandeira, online.

## 8. Arenas

Ilhas urbanas no espírito das ilhas do Polygonizer: terreno com morros, praias e mar em volta, e uma cidade de voxels destrutíveis. Toda arena tem prédios altos destrutíveis, um marco visual central, rotas de chão, de ar e de água. A água é parte do mapa: **mar em volta da ilha, rios e lagos** por dentro, para os veículos aquáticos.

**Ilha do Trovão (M0):** ~2 km de terra, morros de até 140 m, platô central de 14 m e a **Cidade do Trovão** com 384 × 384 m: centro de 53 torres (5 a 20 andares) com a torre central de 24 andares (~92 m) e anel de 20 lotes industriais. Ruas de 10 m em grade de 64 m, calçadas de 3 m com meio-fio de 0,5 m e postes; duas vias elevadas a 8 m e 12 m com rampas.

Escala futura: mapas grandes como as ilhas do Polygonizer, com espaço para as aeronaves; rios e lagos entram com os veículos aquáticos.

## 9. HUD, UI e UX

**Estilo arcade (pronto na M0.7):** barras inclinadas de vida no topo (VOCÊ em verde-ciano à esquerda, INIMIGO em laranja à direita), cronômetro grande no meio, forma e velocidade embaixo à esquerda, abates, derrotas e alvos embaixo à direita, mira circular no centro que pisca ao acertar, faixa "DESTRUÍDO" ao cair. Números em fonte monoespaçada e cores fortes.

A fazer: munição, minimapa e a roda de formas (ao segurar o botão de transformar).

## 10. Áudio

A definir (M1).

## 11. Editor

Editor F1 gerado dos dados, com efeito ao vivo e botão de salvar (no `npm run dev`). Seções atuais: **Carro**, **Moto**, **Transformação**, **Canhão**, **Dummy** e **Cidade** (regenera ao mudar). Depois: vida e dano por forma, resistência por material e editor de arena por voxels.

## 12. Tecnologia

TypeScript + Three.js + Zod, build com esbuild em arquivo único, testes com node:test + tsx, smoke no navegador com Playwright. Arquitetura da skill `jogo-web-3d-base`:

- `src/sim` e `src/procgen` puros e determinísticos (sem relógio, DOM, `Math.random` ou Three.js); um teste vigia a regra.
- Passo fixo de 60 Hz com interpolação na renderização.
- Dados antes de código: todo parâmetro nasce num esquema Zod com JSON em `data/` e aparece no editor F1.
- O mundo responde por consultas (`solidAt`, `floorAt`, altura do chão); a física nunca conhece a malha.
- Voxels esparsos (1 byte por voxel, chunks de 32³); malha por subcolunas de 16 m desenhada em grupos de 48 m; depois de uma explosão, só as subcolunas atingidas são refeitas.
- Carcaça, rodas e Dummy em malhas dinâmicas transformadas na CPU (1 draw call cada).
- Repositório: github.com/erick-azd/age-of-thunders (branch `m0`).

## 13. Roadmap e marcos

| Marco | Entrega | Portão |
| --- | --- | --- |
| M0 | Ilha com cidade de voxels 0,5 m; o Dummy em carro e moto com a transformação entre eles; tiro que destrói blocos; alvos, bot simples, HUD arcade e toque | O Erick joga no desktop e no celular e aprova a sensação |
| M1 | Hover e tanque; desabamento por falta de apoio; mata-mata contra bots; HUD completo | Partida completa divertida |
| M1.1 | Editor de parâmetros completo, refino de controle | Aprovação do Erick |
| M2 | Helicóptero e avião; arena maior com rotas aéreas | Combate ar-solo funciona |
| M3+ | Online, Dummy a pé, veículos aquáticos, novas arenas | A definir |

**Andamento do M0 (22/11/2026):**

| Fatia | Entrega | Estado |
| --- | --- | --- |
| M0.1 | Ilha e cidade de voxels (dobrada, industrial-militar, vias elevadas, faixas de luz) | Pronta |
| M0.2 | O Dummy (17 juntas, poses em dados, estilo arcade) | Pronta |
| M0.3 | Carro arcade | Pronta |
| M0.4 | Moto que inclina | Pronta |
| M0.5 | Transformação animada por peças | Pronta |
| M0.6 | Canhão com mira pela câmera, crateras e entulho | Pronta |
| M0.7a | Vida e dano, alvos, bot que patrulha e atira, HUD arcade | Pronta |
| M0.7b | Controles de toque, perfil de celular e medidor de FPS | Pronta |
| Portão | O Erick joga no desktop e no celular e aprova | Aguardando |

## 14. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escopo grande (6 formas + voxel + online) | Alto | Portões por marco; 2 formas no M0; tudo gerado por código |
| Desempenho no celular (~420 mil triângulos na cidade) | Alto | Cortar faces internas dos prédios ocos; distância de visão menor no perfil celular; medir na M0.7 |
| Transformação caótica com mais formas | Médio | Peças com nomes (ex.: "roda-dianteira") casadas por nome a partir do M1 |
| Desabamento instável ou pesado | Médio | Checagem de apoio por ilhas de voxels, limitada por quadro, só no M1 |
| Câmera atravessando paredes | Baixo | Recuo por raio quando incomodar |

## 15. Decisões registradas

- **21/11/2026, motor:** Web com Three.js, base `jogo-web-3d-base` (Erick).
- **21/11/2026, plataforma:** desktop e celular (Erick).
- **21/11/2026, conceito:** o Dummy é piloto fixo e só a carcaça se transforma (Erick).
- **21/11/2026, mundo:** voxels de 0,5 m, destruição real com entulho e desabamento (Erick).
- **21/11/2026, oponentes:** bots agora, online depois (Erick).
- **21/11/2026, M0:** o M0 traz **carro e moto**; o hover passa para o M1, junto com o tanque (Erick).
- **21/11/2026, M0:** mira pela câmera com torre; parede faz quicar; veículo atropela entulho; transformação mantém a velocidade (Erick).
- **21/11/2026, veículos aquáticos:** entram no jogo, com mar em volta da ilha, rios e lagos; marco a definir (Erick).
- **21/11/2026, mapa híbrido:** mapas grandes como as ilhas do Polygonizer; terreno da ilha em heightfield e estruturas em voxel destrutível (Erick).
- **21/11/2026, cidade:** dobrada para 384 m; estilo **industrial-militar** no lugar do bairro residencial ("bucólico demais"): periferia industrial, torres mais altas e variadas, faixas de luz, vias elevadas, antenas e helipontos (Erick).
- **22/11/2026, estilo arcade:** o jogo inteiro (Dummy, cidade e HUD) segue o estilo dos arcades de mecha dos anos 90; o Dummy fica com 1,8 m e passa a branco, azul e laranja com painéis luminosos (substitui o "azul e preto" de 21/11) (Erick).
- **22/11/2026, controle:** acelerar no gatilho esquerdo (LT), atirar no gatilho direito (RT) e freio no A, para mirar com o analógico direito e atirar ao mesmo tempo; em teste (Erick).
- **22/11/2026, repositório:** github.com/erick-azd/age-of-thunders; merge do `m0` na `main` só com a aprovação do portão (Erick).
