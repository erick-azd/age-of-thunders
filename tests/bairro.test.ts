import assert from 'node:assert/strict';
import { test } from 'node:test';
import districtJson from '../data/world/bairro.json';
import worldJson from '../data/world/mundo.json';
import { DistrictSchema, GROUND_TOP, MAT, generateDistrict, materialColors, materialGlow } from '../src/procgen/district';
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
const N = g.sx, P = def.blockPitchM / VOXEL, hs = def.streetM / VOXEL / 2;
const cheb = (r: { x0: number; z0: number; x1: number; z1: number }) => Math.max(Math.abs((r.x0 + r.x1) / 2 - N / 2), Math.abs((r.z0 + r.z1) / 2 - N / 2));

test('cidade: determinística e com hash travado', () => {
  const again = generateDistrict(def, origin);
  assert.equal(again.grid.checksum(), g.checksum());
  // Hash travado: só muda se alguém mexer no gerador ou no bairro.json de propósito. Ao mudar, diga por quê.
  assert.equal(g.checksum(), CIDADE_HASH);
  assert.ok(district.buildings.length >= 20, `poucos prédios: ${district.buildings.length}`);
  assert.equal(district.buildings.filter((b) => b.tower).length, 1, 'uma torre central');
  for (const k of ['slab', 'tiered', 'twin'] as const) assert.ok(district.buildings.some((b) => b.kind === k), `falta prédio do tipo ${k}`);
});

test('cidade: ruas livres acima do asfalto (fora das vias elevadas) e asfalto contínuo', () => {
  const viaLines = new Set(district.viaducts.map((v) => `${v.axis}${v.line}`));
  for (let l = P; l < N; l += P) for (const axis of ['x', 'z'] as const) {
    if (viaLines.has(`${axis}${l}`)) continue;
    for (let t = 0; t < N; t += 3) {
      if (district.viaducts.some((v) => v.axis !== axis && Math.abs(t - v.line) <= v.halfWidth)) continue; // passa sob a outra via
      for (const off of [-hs + 1, 0, hs - 2]) {
        const [x, z] = axis === 'x' ? [t, l + off] : [l + off, t];
        assert.notEqual(g.get(x, 0, z), 0, `buraco no asfalto em (${x}, ${z})`);
        for (let y = GROUND_TOP; y < g.sy; y += 2) assert.equal(g.get(x, y, z), 0, `obstáculo na rua em (${x}, ${y}, ${z})`);
      }
    }
  }
});

test('vias elevadas: tabuleiro na altura certa, vão livre nas faixas e rampa em degraus de 0,5 m', () => {
  assert.equal(district.viaducts.length, 2);
  const [a, b] = district.viaducts;
  assert.ok(b.deckTop - a.deckTop >= 8, 'a segunda via passa pelo menos 4 m acima');
  for (const v of district.viaducts) {
    const at = (t: number, u: number, y: number) => (v.axis === 'x' ? g.get(t, y, v.line + u) : g.get(v.line + u, y, t));
    const mid = Math.floor(N / 2) + 6;
    assert.equal(at(mid, 2, v.deckTop - 1), MAT.ASPHALT, 'pavimento do tabuleiro');
    assert.equal(at(mid, 2, v.deckTop), 0, 'ar sobre o tabuleiro');
    // Vão livre de 4 m sob o tabuleiro nas faixas (pilares só no canteiro central).
    for (const u of [-v.halfWidth + 1, v.halfWidth - 2]) for (let y = GROUND_TOP; y < GROUND_TOP + 8; y++) assert.equal(at(mid, u, y), 0, `vão livre em u=${u}, y=${y}`);
    // Rampa: o topo sobe no máximo 1 voxel (0,5 m) entre colunas vizinhas.
    const topAt = (t: number) => { let y = g.sy - 1; while (y > 0 && at(t, 2, y) !== MAT.ASPHALT) y--; return y; };
    for (let t = 1; t < v.rampLen; t++) assert.ok(topAt(t) - topAt(t - 1) <= 1, `degrau alto na rampa em t=${t}`);
  }
});

test('periferia industrial: só fora do centro, com os quatro tipos; torres só no centro', () => {
  const core = def.coreHalfM / VOXEL;
  assert.ok(district.sites.length >= 15, `poucos lotes industriais: ${district.sites.length}`);
  for (const s of district.sites) assert.ok(cheb(s) >= core, `lote industrial no centro em (${s.x0}, ${s.z0})`);
  for (const k of ['warehouse', 'containers', 'tanks', 'datacenter'] as const) assert.ok(district.sites.some((s) => s.kind === k), `falta lote do tipo ${k}`);
  for (const b of district.buildings) assert.ok(cheb(b) < core, `prédio fora do centro em (${b.x0}, ${b.z0})`);
});

test('torre central é o marco mais alto e a cidade tem luzes', () => {
  const tower = district.buildings.find((b) => b.tower)!;
  const top = (r: { x0: number; z0: number; x1: number; z1: number }) => g.topAt(origin.x + ((r.x0 + r.x1) / 2) * VOXEL, origin.z + ((r.z0 + r.z1) / 2) * VOXEL);
  const towerTop = top(tower);
  for (const b of district.buildings) if (!b.tower) assert.ok(top(b) < towerTop, 'nenhum prédio passa a torre');
  assert.ok(towerTop > origin.y + 80, `torre baixa demais: ${(towerTop - origin.y).toFixed(1)} m`);
  let glow = 0;
  for (const c of g.chunks) if (c) for (let i = 0; i < c.length; i++) if (c[i] >= MAT.GLOW0 && c[i] < MAT.GLOW0 + 4) glow++;
  assert.ok(glow > 5000, `poucas luzes: ${glow}`);
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
  assert.equal(arena.groundHeight(5000, 5000), terrain.groundHeight(5000, 5000), 'fora da cidade vale o terreno');
});

test('malha: só faces visíveis, fundidas por material, com brilho por material', () => {
  const colors = materialColors(def), glowT = materialGlow(def);
  const quads = (m: { positions: number[] }) => m.positions.length / 18;
  const one = new VoxelGrid(32, 32, 32, v3());
  one.set(5, 5, 5, MAT.TRIM);
  assert.equal(quads(meshRegion(one, 0, 0, 32, 32, colors)), 6, 'cubo isolado = 6 faces');
  one.fill(5, 5, 5, 9, 7, 8, MAT.TRIM);
  assert.equal(quads(meshRegion(one, 0, 0, 32, 32, colors)), 6, 'caixa de um material = 6 quads fundidos');
  one.set(8, 6, 7, MAT.GLOW_CYAN);
  const lit = meshRegion(one, 0, 0, 32, 32, colors, 32, glowT);
  assert.ok(quads(lit) > 6, 'material diferente quebra a fusão');
  assert.equal(lit.glow!.length, lit.positions.length / 3, 'um brilho por vértice');
  assert.equal(lit.glow!.filter((v) => v === 1).length, 6 * 3, 'só as 3 faces expostas da luz brilham');
  const floor = new VoxelGrid(32, 32, 32, v3());
  floor.fill(0, 0, 0, 32, 1, 32, MAT.ASPHALT);
  assert.equal(quads(meshRegion(floor, 0, 0, 32, 32, colors)), 5, 'laje no fundo: sem face de baixo');
  const left = quads(meshRegion(floor, 0, 0, 16, 32, colors)), right = quads(meshRegion(floor, 16, 0, 16, 32, colors));
  assert.equal(left + right, 8, 'duas metades: topo + 3 laterais cada, sem a face do meio');
});

const CIDADE_HASH = -59204834; // estilo industrial-militar: torres em recuo, periferia industrial, vias elevadas e luzes (pedido do Erick)
