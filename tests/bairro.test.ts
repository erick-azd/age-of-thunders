import assert from 'node:assert/strict';
import { test } from 'node:test';
import districtJson from '../data/world/bairro.json';
import worldJson from '../data/world/mundo.json';
import { DistrictSchema, GROUND_TOP, MAT, generateDistrict, materialColors } from '../src/procgen/district';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import { meshRegion } from '../src/procgen/voxel-mesher';
import { Arena } from '../src/sim/arena';
import { v3 } from '../src/sim/math';
import { VOXEL, VoxelGrid } from '../src/sim/voxels';

const def = DistrictSchema.parse(districtJson);
const terrainDef = WorldSchema.parse(worldJson);
const origin = v3(-def.sizeM / 2, terrainDef.plateauHeight - 0.5, -def.sizeM / 2);
const district = generateDistrict(def, origin);
const g = district.grid;

test('bairro: determinístico e com hash travado', () => {
  const again = generateDistrict(def, origin);
  assert.equal(again.grid.checksum(), g.checksum());
  // Hash travado: só muda se alguém mexer no gerador ou no bairro.json de propósito. Ao mudar, diga por quê.
  assert.equal(g.checksum(), BAIRRO_HASH);
  assert.ok(district.buildings.length >= 20, `poucos prédios: ${district.buildings.length}`);
  assert.equal(district.buildings.filter((b) => b.tower).length, 1, 'uma torre central');
});

test('bairro: ruas livres acima do asfalto e asfalto contínuo', () => {
  const P = def.blockPitchM / VOXEL, hs = def.streetM / VOXEL / 2;
  for (let l = P; l < g.sx; l += P) {
    for (let t = 0; t < g.sx; t += 3) for (const off of [-hs + 1, 0, hs - 2]) {
      const x = l + off;
      assert.notEqual(g.get(x, 0, t), 0, `buraco no asfalto em (${x}, ${t})`);
      for (let y = GROUND_TOP; y < g.sy; y += 2) assert.equal(g.get(x, y, t), 0, `obstáculo na rua em (${x}, ${y}, ${t})`);
    }
  }
});

test('bairro: calçada é meio-fio de 1 voxel (0,5 m) e a torre é o ponto mais alto', () => {
  const P = def.blockPitchM / VOXEL, hs = def.streetM / VOXEL / 2;
  assert.equal(g.get(hs + 1, GROUND_TOP, hs + 1), MAT.SIDEWALK);
  assert.equal(g.get(hs + 1, GROUND_TOP + 1, hs + 1), 0);
  const tower = district.buildings.find((b) => b.tower)!;
  const towerTop = g.topAt(origin.x + ((tower.x0 + tower.x1) / 2) * VOXEL, origin.z + ((tower.z0 + tower.z1) / 2) * VOXEL);
  for (const b of district.buildings) if (!b.tower) assert.ok(b.floors < tower.floors);
  assert.ok(towerTop > origin.y + 50, `torre baixa demais: ${towerTop}`);
  assert.ok(P > 0);
});

test('arena: terreno no platô fica escondido sob o asfalto; prédio é sólido, rua não', () => {
  const terrain = new Terrain(terrainDef).generate();
  const arena = new Arena(terrain, g);
  const asphaltTop = origin.y + GROUND_TOP * VOXEL;
  assert.equal(terrain.groundHeight(0, 0), terrainDef.plateauHeight);
  assert.ok(terrain.groundHeight(0, 0) < asphaltTop);
  assert.equal(arena.groundHeight(0, 0), asphaltTop, 'centro do cruzamento: chão = topo do asfalto');
  const b = district.buildings[0];
  const wx = origin.x + (b.x0 + 0.5) * VOXEL, wz = origin.z + (b.z0 + 0.5) * VOXEL;
  assert.ok(arena.solidAt(wx, origin.y + 4 * VOXEL + 0.1, wz), 'parede do prédio é sólida');
  assert.ok(!arena.solidAt(0, asphaltTop + 1, 0), 'ar sobre a rua não é sólido');
  assert.equal(arena.groundHeight(5000, 5000), terrain.groundHeight(5000, 5000), 'fora do bairro vale o terreno');
});

test('malha: só faces visíveis, fundidas por material', () => {
  const colors = materialColors(def);
  const quads = (m: { positions: number[] }) => m.positions.length / 18;
  const one = new VoxelGrid(32, 32, 32, v3());
  one.set(5, 5, 5, MAT.TRIM);
  assert.equal(quads(meshRegion(one, 0, 0, 32, 32, colors)), 6, 'cubo isolado = 6 faces');
  one.fill(5, 5, 5, 9, 7, 8, MAT.TRIM);
  assert.equal(quads(meshRegion(one, 0, 0, 32, 32, colors)), 6, 'caixa de um material = 6 quads fundidos');
  one.set(8, 6, 7, MAT.GLASS);
  assert.ok(quads(meshRegion(one, 0, 0, 32, 32, colors)) > 6, 'material diferente quebra a fusão');
  const floor = new VoxelGrid(32, 32, 32, v3());
  floor.fill(0, 0, 0, 32, 1, 32, MAT.ASPHALT);
  assert.equal(quads(meshRegion(floor, 0, 0, 32, 32, colors)), 5, 'laje no fundo: sem face de baixo');
  // Duas colunas lado a lado não desenham a face entre elas.
  const left = quads(meshRegion(floor, 0, 0, 16, 32, colors)), right = quads(meshRegion(floor, 16, 0, 16, 32, colors));
  assert.equal(left + right, 8, 'duas metades: topo + 3 laterais cada, sem a face do meio');
});

const BAIRRO_HASH = 21704978; // M0.1: bairro inicial (seed 2077, 256 m, quarteirões de 64 m)
