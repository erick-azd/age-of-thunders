# ADR 0003: Cidade industrial-militar, vias elevadas e faixas de luz

**Status:** aceita · 21/11/2026 · ajuste da fatia M0.1, pedido do Erick ("o cenário urbano está muito bucólico")

## Contexto

A cidade da ADR 0002 (prédios de janelas claras e periferia de casas com telhado) ficou residencial demais para um jogo de combate. O Erick escolheu o estilo **industrial-militar**, a periferia de **galpões e tech parks** e quatro extras: torres mais altas e variadas, faixas de luz, vias elevadas, antenas e heliponto.

## Decisão

### Estilo (`data/world/bairro.json`, `MAT` em `src/procgen/district.ts`)
- Paleta escura: concreto (6 tons), aço, vidro fumê, faixas de perigo amarelo e preto, piso de concreto nos lotes industriais, contêineres em 6 cores.
- **Faixas de luz:** 4 materiais com brilho (ciano, âmbar, vermelho, branco). `materialGlow()` diz quais brilham; o mesher grava um atributo `glow` por vértice e o `flatMaterial` soma a cor como emissiva (`onBeforeCompile`). **Nenhum draw call a mais**; geometrias sem o atributo não mudam.

### Centro (torres)
- Altura do grid: 96 m. Andares 5 a 20, mais altos perto do centro.
- Tipos: **caixa** simples, **em recuo** (2 ou 3 camadas, terraços com mureta de perigo) e **gêmeas** com passarela de vidro e luz a 60% da altura.
- Fachada: quinas de aço, linha escura por andar, janelas em fita, faixa ciano a cada 5 andares (`glowEvery`), térreo blindado com faixa de perigo e portas.
- Telhados: **heliponto** (35%, se o topo tiver 12 × 12 m: "H", borda de perigo, luzes âmbar nos cantos) ou antenas com luz vermelha, prato e máquinas.
- **Marco central:** torre de 24 andares em 3 recuos, envidraçada, quinas de luz ciano, coroa iluminada e mastro de 15 m com luzes vermelhas (~92 m de altura).

### Periferia (lotes industriais, cercados com portões)
- **Galpão:** chapa nervurada, portas de enrolar com moldura de perigo, telhado em serra com claraboias de vidro, contêineres no pátio.
- **Pátio de contêineres:** pilhas de 1 a 3 (2,5 × 6 m), corredores e pórtico amarelo de 15 m.
- **Tanques:** cilindros com faixas, tubulação e chaminés listradas de vermelho e branco (30 a 45 m) com luz vermelha.
- **Data center:** caixa com venezianas, porta blindada, faixa ciano e máquinas de resfriamento com luz.

### Ruas
- Meio-fio com faixa de perigo e postes de 5 m com luz branca a cada 12 m.
- **Duas vias elevadas** (`viaduct`): uma ao longo de x a 8 m e outra ao longo de z a 12 m, cruzando em alturas diferentes. Rampas maciças nas pontas com degraus de 0,5 m a cada 2 m (o meio-fio que o carro já precisa subir), tabuleiro de 1 m com mureta iluminada e faixa central, pilares só no canteiro e nunca em cruzamentos. Vão livre de 4 m nas faixas.
- Novos parâmetros no F1: faixa de luz a cada N andares, helipontos, altura da via elevada, raio do centro.

## Consequências

- Testes reescritos em `tests/bairro.test.ts`: hash novo (`-59204834`), tipos de prédio e de lote presentes, ruas livres fora das vias elevadas, tabuleiro e vão livre, rampa sem degrau maior que 0,5 m, torre central mais alta que tudo, mais de 5 mil voxels de luz, brilho por vértice no mesher.
- Smoke: nova vista `09-via-elevada.png`.
- Medido: 53 prédios, 20 lotes industriais, 2 vias elevadas, 64 malhas, **69 draw calls**, **~420 mil triângulos** (eram ~310 mil). A ilha não mudou.
- Atenção para o celular: triângulos subiram de novo. A ordem de economia continua: faces internas dos prédios ocos, depois distância de visão no perfil celular.
- A física das rampas e do tabuleiro (carro subindo a via elevada) é testada de verdade na M0.3.
