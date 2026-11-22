# Age of Thunders — Game Design Document

**Versão:** 0.1 · 21/11/2026 · **Dono do design:** Erick · **Implementação:** Claude Code

## 1. Visão

Você é o **Dummy**, um boneco articulado que pilota uma carcaça mecânica capaz de se remontar, em segundos, em moto, carro, hover, tanque, avião ou helicóptero. Combate em arenas urbanas de voxels, onde tudo pode ser destruído: cada tiro arranca blocos, prédios perdem apoio e desabam.

- **Gênero:** combate veicular em arena, 3ª pessoa, com transformação.
- **Plataforma:** navegador, desktop (teclado/mouse e gamepad) e celular (toque), build em HTML único.
- **Sessão típica:** partidas de 3 a 5 minutos.
- **Oponentes:** bots agora; online num marco futuro (a simulação pura já nasce pronta para rodar num servidor).

## 2. Referências

| Referência | O que estudar | O que evitar |
| --- | --- | --- |
| Bonecos articulados impressos em 3D (`References/Images/Character_Dummy`) | Peças rígidas, juntas pretas aparentes, rosto liso facetado, plástico fosco de uma cor + preto | Copiar um modelo de produto específico; o Dummy é desenho nosso |
| Polygonizer (projeto do Erick) | Ilha urbana como arena, voo arcade, orçamento de draw calls, pousos tolerantes | Túneis e tetos que a física não sustenta |
| Jogos de voxel destrutível (gênero) | Destruição por blocos, desabamento por falta de apoio, entulho | Mundo blocado demais; aqui o voxel é de 0,5 m e chapado como o low-poly |
| Combate veicular em arena (gênero) | Ritmo de partida curta, coleta de armas e reparo | Controles de simulação; aqui é arcade |

Regra: estudar e reimplementar, nunca copiar código, dados, nomes ou assets.

## 3. Sensação de jogo

Verbos do jogador:

1. **Pilotar:** cada forma tem uma física própria e legível. Carro aderente e com derrapagem controlável; moto ágil, que inclina nas curvas e não cai sozinha; hover desliza e sobe degraus baixos; avião rápido, sem stall punitivo. Valores iniciais generosos.
2. **Transformar:** um botão e uma roda de formas. A transformação dura cerca de 0,6 s, com as peças deslizando e girando em volta do Dummy, e deve ser **satisfatória de ver** e útil no combate (fugir pelo ar, virar tanque para aguentar dano).
3. **Atirar:** mira assistida generosa no começo; o impacto mostra blocos voando.
4. **Destruir:** derrubar a cobertura do inimigo ou um prédio inteiro em cima dele é uma tática, não só efeito visual.

## 4. Visual e orçamento

- **Personagem:** o Dummy em estilo boneco articulado, montado por código com o `MeshBuilder` (peças rígidas facetadas, juntas pretas). Cor do jogador por time (ex.: dourado, branco, vermelho) + preto.
- **Veículos:** carcaças low-poly chapadas, cor por face, montadas por código a partir de peças que se reorganizam entre as formas.
- **Mundo:** voxels de **0,5 m** com cor chapada por face, em chunks com malha otimizada (faces vizinhas fundidas). Combina com o low-poly do resto.
- **Orçamento:** até 150 draw calls por quadro; 30 FPS no celular; build em HTML único.
- **Perfis visuais:** padrão e celular (distância de visão e entulho menores no celular).

## 5. Controles (provisório)

| Ação | Gamepad | Teclado/mouse | Toque |
| --- | --- | --- | --- |
| Mover / pilotar | Analógico esquerdo | WASD | Joystick virtual |
| Câmera / mira | Analógico direito | Mouse | Arrastar na metade direita |
| Atirar | RT | Botão esquerdo | Botão de tiro |
| Transformar | Y (segurar abre a roda) | Q / 1–6 | Botão de forma |
| Ação da forma (turbo, subir) | A | Espaço | Botão de ação |

## 6. O Dummy e as formas

O **Dummy é sempre o mesmo personagem** e fica visível: no assento da moto, no cockpit do carro e do avião, encaixado no chassi do tanque. Isso preserva a identidade do jogador entre as formas. A carcaça é que se transforma.

| Forma | Papel | Marco |
| --- | --- | --- |
| Carro (4 rodas) | Equilíbrio, padrão de partida | M0 |
| Moto (2 rodas) | Velocidade e manobra | M0 |
| Hover | Mobilidade, atravessa água e entulho | M1 |
| Tanque | Resistência e dano alto, lento | M1 |
| Helicóptero | Pairar e atirar de cima | M2 |
| Avião | Velocidade no ar, passadas | M2 |

A estudar: o Dummy sair da carcaça e lutar a pé (pistola, katana) num marco posterior.

## 7. Modos de jogo

- **M0:** arena livre com alvos e um bot simples.
- **M1:** mata-mata contra bots (pontos por abate, reaparecimento).
- **Futuro:** times, captura de bandeira, online.

## 8. Arenas

Ilhas urbanas no espírito da ilha do Polygonizer, feitas de voxels: quarteirões, prédios, pontes e água. Toda arena tem: prédios altos destrutíveis, um marco visual central, rotas de chão e de ar, e água nas bordas.

## 9. HUD, UI e UX

Vida, forma atual e as disponíveis, munição, placar e minimapa. Roda de formas ao segurar o botão de transformar.

## 10. Áudio

A definir (M1).

## 11. Editor

Editor F1 com os parâmetros de cada forma (velocidade, aderência, vida, armas) e da destruição (resistência por material). Depois: editor de arena por voxels.

## 12. Tecnologia

TypeScript + Three.js + Zod, build com esbuild em arquivo único, testes com node:test + tsx, smoke com Playwright. Arquitetura da skill `jogo-web-3d-base`. O mundo de voxels responde pela `WorldQuery` (`solidAt`, altura do chão) e a física nunca conhece a malha.

## 13. Roadmap e marcos

| Marco | Entrega | Portão |
| --- | --- | --- |
| M0 | Arena pequena de voxels 0,5 m; o Dummy em carro e moto com a transformação entre eles; tiro que destrói blocos | O Erick joga no desktop e no celular e aprova a sensação |
| M1 | Hover e tanque; desabamento por falta de apoio; mata-mata contra bots; HUD | Partida completa divertida |
| M1.1 | Editor de parâmetros completo, refino de controle | Aprovação do Erick |
| M2 | Helicóptero e avião; arena maior com rotas aéreas | Combate ar-solo funciona |
| M3+ | Online, Dummy a pé, novas arenas | A definir |

## 14. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escopo grande (6 formas + voxel + online) | Alto | Portões por marco; 2 formas no M0; tudo gerado por código |
| Desempenho do voxel no celular | Alto | Chunks com malha otimizada, re-malha só do chunk tocado, entulho instanciado e com limite; medir no M0 |
| Transformações caras de animar | Médio | Peças rígidas interpoladas por código, mesmo sistema para todas as formas |
| Desabamento instável ou pesado | Médio | Checagem de apoio por ilhas de voxels, limitada por quadro, só no M1 |

## 15. Decisões registradas

- **21/11/2026, motor:** Web com Three.js, base `jogo-web-3d-base` (Erick).
- **21/11/2026, plataforma:** desktop e celular (Erick).
- **21/11/2026, conceito:** o Dummy é piloto fixo e só a carcaça se transforma (Erick).
- **21/11/2026, visual:** Dummy de boneco articulado num mundo low-poly (Erick).
- **21/11/2026, mundo:** voxels de 0,5 m, destruição real com entulho e desabamento (Erick).
- **21/11/2026, oponentes:** bots agora, online depois (Erick).
- **21/11/2026, M0:** Dummy + carro e hover + arena de voxels destrutível (Erick).
- **21/11/2026, M0 revisado:** o M0 começa com **carro e moto**; o hover passa para o M1, junto com o tanque (Erick).
