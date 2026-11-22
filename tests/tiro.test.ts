import assert from 'node:assert/strict';
import { test } from 'node:test';
import weaponJson from '../data/config/canhao.json';
import districtJson from '../data/world/bairro.json';
import { DistrictSchema, materialColors } from '../src/procgen/district';
import { meshRegion } from '../src/procgen/voxel-mesher';
import { Arena } from '../src/sim/arena';
import { v3 } from '../src/sim/math';
import { VOXEL, VoxelGrid } from '../src/sim/voxels';
import { WeaponSchema, fire, raycast, stepProjectiles } from '../src/sim/weapons';

const W = WeaponSchema.parse(weaponJson);
const DT = 1 / 60;
const flat = { groundHeight: () => 0, waterHeight: () => -10 };

/** Chão de 64 × 64 m em y = 0 e um muro de 4 m de altura, 1 m de espessura, em z = −10 m. */
function range(): { g: VoxelGrid; w: Arena } {
  const g = new VoxelGrid(128, 32, 128, v3(-32, -1, -32));
  g.fill(0, 0, 0, 128, 2, 128, 1);
  g.fill(0, 2, 44, 128, 10, 46, 5); // z de −10 a −9 m
  return { g, w: new Arena(flat, g) };
}

test('tiro: o projétil voa até o muro, explode lá e arranca uma esfera de voxels', () => {
  const { g, w } = range();
  const before = g.count();
  const list = [fire(v3(0, 2, 10), v3(0, 2, -20), W)];
  const blasts = [];
  for (let t = 0; t < 2 && list.length; t += DT) blasts.push(...stepProjectiles(list, w, g, W, DT));
  assert.equal(blasts.length, 1, 'uma explosão');
  const b = blasts[0];
  assert.ok(b.pos.z <= -9 && b.pos.z > -9.6, `explodiu na face do muro (z ${b.pos.z.toFixed(2)})`);
  const n = b.removed.length / 4;
  assert.equal(before - g.count(), n, 'removidos = o que sumiu do grid');
  // Esfera de raio R em voxels de 0,5 m: o volume removido fica perto de uma meia esfera (só metade é muro).
  const half = (2 / 3) * Math.PI * (W.blastRadiusM / VOXEL) ** 3;
  assert.ok(n > half * 0.5 && n < half * 1.6, `${n} voxels removidos (meia esfera ≈ ${half.toFixed(0)})`);
  for (let j = 0; j < b.removed.length; j += 4) {
    const x = g.origin.x + (b.removed[j] + 0.5) * VOXEL, y = g.origin.y + (b.removed[j + 1] + 0.5) * VOXEL, z = g.origin.z + (b.removed[j + 2] + 0.5) * VOXEL;
    assert.ok(Math.hypot(x - b.pos.x, y - b.pos.y, z - b.pos.z) <= W.blastRadiusM + 1e-9, 'nada fora do raio');
  }
});

test('tiro: em alta velocidade não atravessa parede de 0,5 m; é determinístico; some no fim do alcance', () => {
  const run = () => {
    const g = new VoxelGrid(128, 32, 128, v3(-32, -1, -32));
    g.fill(0, 0, 0, 128, 2, 128, 1);
    g.fill(0, 2, 44, 128, 10, 45, 5); // parede de 0,5 m
    const w = new Arena(flat, g), list = [fire(v3(0, 2, 10), v3(0, 2, -20), { ...W, speed: 400 })];
    let blast;
    for (let t = 0; t < 1 && list.length; t += DT) blast ??= stepProjectiles(list, w, g, { ...W, speed: 400 }, DT)[0];
    return { blast, sum: g.checksum() };
  };
  const a = run(), b = run();
  assert.ok(a.blast && a.blast.pos.z > -9.6, 'parou na parede');
  assert.equal(a.sum, b.sum, 'mesmo buraco nas duas vezes');
  const { g, w } = range();
  const list = [fire(v3(0, 30, 0), v3(0, 60, -100), W)]; // para cima, sem alvo
  for (let t = 0; t < W.lifeS + 0.1; t += DT) stepProjectiles(list, w, g, W, DT);
  assert.equal(list.length, 0, 'sumiu ao acabar a vida');
});

test('mira: o raio da câmera para no primeiro sólido', () => {
  const { w } = range();
  const r = raycast(w, v3(0, 2, 10), v3(0, 0, -1), 100);
  assert.ok(r.hit && r.point.z <= -9 && r.point.z > -9.5, `parou em z ${r.point.z.toFixed(2)}`);
  const sky = raycast(w, v3(0, 2, 10), v3(0, 1, 0), 50);
  assert.ok(!sky.hit && Math.abs(sky.point.y - 52) < 1e-9, 'sem alvo: ponto no fim do alcance');
});

test('re-malha por subcoluna: refazer só um pedaço dá a mesma área de faces que refazer tudo', () => {
  const colors = materialColors(DistrictSchema.parse(districtJson));
  const { g } = range();
  g.carveSphere(0, 2, -9.5, 1.6);
  const area = (pos: number[]) => {
    let a = 0;
    for (let i = 0; i < pos.length; i += 9) {
      const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
      const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
      a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    return a;
  };
  const whole = area(meshRegion(g, 0, 0, 128, 128, colors).positions);
  let parts = 0;
  for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) parts += area(meshRegion(g, i * 32, k * 32, 32, 32, colors).positions);
  assert.ok(Math.abs(whole - parts) < 1e-6 * whole, `área ${whole.toFixed(2)} × ${parts.toFixed(2)}`);
});
