import { Game } from './game/game';
import './ui/styles.css';

const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui') as HTMLElement);
// API de depuração: o smoke test e as ferramentas (tools/) só usam window.game.
(window as unknown as { game: Game }).game = game;
game.start();
