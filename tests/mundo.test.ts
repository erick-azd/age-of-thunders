import assert from 'node:assert/strict';
import { test } from 'node:test';
import worldJson from '../data/world/mundo.json';
import { Terrain, WorldSchema } from '../src/procgen/terrain';

const world = new Terrain(WorldSchema.parse(worldJson)).generate();

test('mundo: determinístico e com hash travado', () => {
  const again = new Terrain(WorldSchema.parse(worldJson)).generate();
  assert.equal(again.checksum(), world.checksum());
  // Hash travado: só muda se alguém mexer no mundo de propósito. Ao mudar, atualize e diga por quê.
  // M0.1: ilha de ~2 km (3000 m, 257 vértices) com platô central de 14 m para o bairro de voxels.
  // M0.1b: platô alargado para 215 m (cidade de 384 m).
  assert.equal(world.checksum(), -1438949356);
  assert.equal(world.trees.length, 751); // ilha menor que o quadrado: nem todas as 1200 tentativas caem em terra
});

test('mundo: árvores em terra, nenhuma no mar', () => {
  for (const t of world.trees) assert.ok(world.groundHeight(t.x, t.z) > 3, `árvore no mar em (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
});
