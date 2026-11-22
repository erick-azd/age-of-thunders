import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import playerJson from '../data/config/player.json';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import worldJson from '../data/world/mundo.json';
import { v3 } from '../src/sim/math';
import { PlayerParamsSchema, createPlayer, stepPlayer } from '../src/sim/player';

/**
 * Proteção da arquitetura (ADR 0018 do Polygonizer): `src/sim` e `src/procgen` são puros, então
 * rodam no Node, no servidor de um futuro online e dão o mesmo resultado sempre.
 *  1. Sem relógio, DOM, Math.random nem Three.js.
 *  2. O estado é só dado: copiado no meio da partida, continua idêntico ao original.
 */
const ROOT = join(import.meta.dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});

test('pureza: src/sim e src/procgen sem relógio, DOM, Math.random nem three', () => {
  const forbidden = [/Math\.random\s*\(/, /Date\.now\s*\(/, /performance\.now\s*\(/, /\bdocument\./, /\bwindow\./, /requestAnimationFrame/, /localStorage/, /from ['"]three['"]/];
  for (const f of [...files(join(ROOT, 'src/sim')), ...files(join(ROOT, 'src/procgen'))]) {
    const src = readFileSync(f, 'utf8');
    for (const re of forbidden) assert.ok(!re.test(src), `${relative(ROOT, f)} usa ${re}`);
  }
});

test('pureza: estado copiado no meio termina igual ao original', () => {
  const world = new Terrain(WorldSchema.parse(worldJson)).generate();
  const p = PlayerParamsSchema.parse(playerJson);
  const a = createPlayer(v3(0, 120, 1200), 0, 40);
  const input = (t: number) => ({ steer: Math.sin(t * 0.7), throttle: 1, climb: Math.cos(t * 0.3) * 0.5 });
  for (let i = 0; i < 600; i++) stepPlayer(a, input(a.time), p, world, 1 / 60);
  const b = structuredClone(a); // falha se o estado tiver funções
  for (let i = 0; i < 600; i++) { stepPlayer(a, input(a.time), p, world, 1 / 60); stepPlayer(b, input(b.time), p, world, 1 / 60); }
  assert.deepEqual(b, a);
});
