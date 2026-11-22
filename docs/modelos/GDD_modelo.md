# <Nome do Jogo> — Game Design Document

**Versão:** 0.1 · DD/MM/AAAA · **Dono do design:** Erick · **Implementação:** Claude Code

## 1. Visão

<Uma frase com a fantasia central. Gênero, plataforma (navegador desktop com gamepad? celular?), sessão típica.>

## 2. Referências

| Jogo | O que estudar | O que evitar |
| --- | --- | --- |
| <jogo> | <mecânica, câmera, ritmo, visual> | <o que não funcionou nele> |

Regra: estudar e reimplementar, nunca copiar código, dados, nomes ou assets.

## 3. Sensação de jogo

<Os 3 ou 4 verbos do jogador e como cada um deve ser sentido. Valores iniciais generosos (pouso, colisão, mira) e apertados só com playtest.>

## 4. Visual e orçamento

- **Estilo:** <ex.: low-poly chapado estilo Virtua Racing, cor por face, sem texturas>.
- **Orçamento:** até <150> draw calls e <N> triângulos por quadro; 30 FPS no celular; build em HTML único.
- **Perfis visuais:** <padrão e celular>.

## 5. Controles

| Ação | Gamepad | Teclado | Toque |
| --- | --- | --- | --- |

## 6. <Personagens / veículos>

## 7. Modos de jogo

## 8. Fases ou mundos

<Tabela: tema, marco visual, set-piece, paleta. Elementos obrigatórios de toda fase.>

## 9. HUD, UI e UX

## 10. Áudio

## 11. Editor

<O editor vem cedo (logo depois do M1): é ele que produz o conteúdo. Parâmetros por specs; colocar objetos no mundo.>

## 12. Tecnologia

TypeScript + Three.js + Zod, build com esbuild em arquivo único, testes com node:test + tsx, smoke com Playwright. Arquitetura da skill `jogo-web-3d-base`.

## 13. Roadmap e marcos

| Marco | Entrega | Portão |
| --- | --- | --- |
| M0 | <sensação de jogo: uma cena, um personagem> | <o Erick joga e aprova> |
| M1 | <primeiro modo completo> | <...> |
| M1.1 | <refino e editor> | <...> |

## 14. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Escopo grande para um projeto de estudo | Alto | Portões por marco; conteúdo gerado por código; cortes planejados que não quebram o jogo |

## 15. Decisões registradas

- **DD/MM/AAAA, <tema>:** <o que foi decidido> (pedido do <quem>).
