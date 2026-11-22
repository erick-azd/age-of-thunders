import assert from 'node:assert/strict';
import { test } from 'node:test';
import playerJson from '../data/config/player.json';
import worldJson from '../data/world/mundo.json';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import { v3 } from '../src/sim/math';
import { PlayerParamsSchema, createPlayer, stepPlayer } from '../src/sim/player';
import type { WorldQuery } from '../src/sim/world';

const world = new Terrain(WorldSchema.parse(worldJson)).generate();

test('mundo: determinístico e com hash travado', () => {
  const again = new Terrain(WorldSchema.parse(worldJson)).generate();
  assert.equal(again.checksum(), world.checksum());
  // Hash travado: só muda se alguém mexer no mundo de propósito. Ao mudar, atualize e diga por quê.
  // M0.1: ilha de ~2 km (3000 m, 257 vértices) com platô central de 14 m para o bairro de voxels.
  assert.equal(world.checksum(), 419332219);
  assert.equal(world.trees.length, 811); // ilha menor que o quadrado: nem todas as 1200 tentativas caem em terra
});

test('mundo: árvores em terra, nenhuma no mar', () => {
  for (const t of world.trees) assert.ok(world.groundHeight(t.x, t.z) > 3, `árvore no mar em (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
});

/** Voo reto através de (x, y, z) no rumo dado, mantendo a altura; devolve se bateu. */
function flyThrough(w: WorldQuery, x: number, y: number, z: number, heading: number): boolean {
  const s = createPlayer(v3(x - Math.sin(heading) * 300, y, z + Math.cos(heading) * 300), heading, 60);
  const p = PlayerParamsSchema.parse(playerJson);
  for (let i = 0; i < 60 * 10 && !s.crashed; i++) {
    stepPlayer(s, { steer: 0, throttle: 1, climb: 0 }, p, w, 1 / 60);
    s.pos.y = y;
  }
  return s.crashed;
}

test('sólidos: bater numa coluna é acidente; passar ao lado, não', () => {
  // Uma coluna de 10 m de raio em (0, 0), de 0 a 200 m (exemplo de marco sólido).
  const column: WorldQuery = { groundHeight: () => 0, waterHeight: () => 0, solidAt: (x, y, z) => Math.hypot(x, z) < 10 && y < 200 };
  assert.ok(flyThrough(column, 0, 50, 0, 0), 'contra a coluna bate');
  assert.ok(!flyThrough(column, 30, 50, 0, 0), 'ao lado passa');
  assert.ok(!flyThrough(column, 0, 250, 0, 0), 'por cima passa');
});
