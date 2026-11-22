import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import carJson from '../data/config/carro.json';
import districtJson from '../data/world/bairro.json';
import { DistrictSchema, generateDistrict } from '../src/procgen/district';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import worldJson from '../data/world/mundo.json';
import { v3 } from '../src/sim/math';
import { Arena } from '../src/sim/arena';
import { CarParamsSchema, createCar, stepCar } from '../src/sim/car';

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
  const tdef = WorldSchema.parse(worldJson), ddef = DistrictSchema.parse(districtJson);
  const grid = generateDistrict(ddef, v3(-ddef.sizeM / 2, tdef.plateauHeight - 0.5, -ddef.sizeM / 2)).grid;
  const world = new Arena(new Terrain(tdef).generate(), grid);
  const p = CarParamsSchema.parse(carJson);
  const a = createCar(v3(2.5, tdef.plateauHeight + 0.5, 150), 0);
  const input = (t: number) => ({ steer: Math.sin(t * 0.7), throttle: 1, brake: 0, handbrake: Math.cos(t * 0.9) > 0.8 });
  for (let i = 0; i < 600; i++) stepCar(a, input(a.time), p, world, 1 / 60);
  const b = structuredClone(a); // falha se o estado tiver funções
  for (let i = 0; i < 600; i++) { stepCar(a, input(a.time), p, world, 1 / 60); stepCar(b, input(b.time), p, world, 1 / 60); }
  assert.deepEqual(b, a);
});
