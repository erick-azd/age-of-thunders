import assert from 'node:assert/strict';
import { test } from 'node:test';
import carJson from '../data/config/carro.json';
import districtJson from '../data/world/bairro.json';
import worldJson from '../data/world/mundo.json';
import { DistrictSchema, generateDistrict } from '../src/procgen/district';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import { Arena } from '../src/sim/arena';
import { CarParamsSchema, type CarInput, type CarState, createCar, forwardSpeed, stepCar } from '../src/sim/car';
import { v3 } from '../src/sim/math';
import { VOXEL, VoxelGrid } from '../src/sim/voxels';

const P = CarParamsSchema.parse(carJson);
const DT = 1 / 60;
const flat = { groundHeight: () => 0, waterHeight: () => -10 };

/** Pista de testes: 64 × 64 m de chão plano em y = 0 (grid começa 1 m abaixo, asfalto até 0). */
function track(build?: (g: VoxelGrid, vx: (m: number) => number) => void): Arena {
  const g = new VoxelGrid(128, 32, 128, v3(-32, -1, -32));
  g.fill(0, 0, 0, 128, 2, 128, 1);
  const vx = (m: number) => Math.round(m / VOXEL); // metros a partir do canto do grid → voxels
  build?.(g, vx);
  return new Arena(flat, g);
}
const go = (s: CarState, w: Arena, seconds: number, inp: Partial<CarInput>) => {
  const i: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...inp };
  for (let t = 0; t < seconds; t += DT) stepCar(s, i, P, w, DT);
};

test('carro: acelera até perto da máxima no plano e é determinístico', () => {
  const w = track();
  const a = createCar(v3(0, 0, 25), 0), b = createCar(v3(0, 0, 25), 0);
  go(a, w, 5, { throttle: 1 });
  go(b, w, 5, { throttle: 1 });
  assert.deepEqual(a, b);
  assert.ok(forwardSpeed(a) > P.maxSpeed * 0.85, `velocidade ${forwardSpeed(a).toFixed(1)}`);
  assert.ok(a.pos.z < -20, 'andou para a frente (−Z)');
  assert.ok(Math.abs(a.pos.y) < 1e-6 && a.onGround, 'no chão');
});

test('carro: parede de 3 m faz parar e quicar, nunca atravessar', () => {
  // Muro em z = −10 m (mundo), de ponta a ponta.
  const w = track((g, vx) => g.fill(0, 2, vx(22), 128, 8, vx(23), 1));
  const s = createCar(v3(0, 0, 20), 0);
  go(s, w, 4, { throttle: 1 });
  assert.ok(s.wallHits > 0, 'bateu');
  assert.ok(s.pos.z > -10 + P.length / 2 - 0.05, `atravessou: z = ${s.pos.z.toFixed(2)}`);
  assert.ok(forwardSpeed(s) < 10, 'perdeu velocidade');
});

test('carro: sobe o meio-fio de 0,5 m, mas não um degrau de 1 m', () => {
  const half = track((g, vx) => g.fill(0, 2, 0, 128, 3, vx(22), 1)); // plataforma de 0,5 m depois de z = −10
  const s = createCar(v3(0, 0, 10), 0);
  go(s, half, 2, { throttle: 1 });
  assert.ok(s.pos.z < -15 && Math.abs(s.pos.y - 0.5) < 1e-6, `subiu: z ${s.pos.z.toFixed(1)}, y ${s.pos.y.toFixed(2)}`);
  const full = track((g, vx) => g.fill(0, 2, 0, 128, 4, vx(22), 1)); // 1 m
  const t = createCar(v3(0, 0, 10), 0);
  go(t, full, 2, { throttle: 1 });
  assert.ok(t.pos.z > -10 && t.pos.y < 0.01, `não deveria subir 1 m: z ${t.pos.z.toFixed(1)}, y ${t.pos.y.toFixed(2)}`);
});

test('carro: rampa em degraus de 0,5 m a cada 2 m leva até 4 m de altura', () => {
  const w = track((g, vx) => {
    for (let k = 0; k < 8; k++) g.fill(0, 2 + k, vx(40 - 2 * k - 2), 128, 3 + k, vx(40 - 2 * k), 1); // sobe para −Z
    g.fill(0, 2, 0, 128, 10, vx(24), 1); // tabuleiro a 4 m
  });
  const s = createCar(v3(0, 0, 14), 0);
  go(s, w, 2, { throttle: 1 });
  assert.ok(Math.abs(s.pos.y - 4) < 1e-6, `altura final ${s.pos.y.toFixed(2)}`);
  assert.equal(s.wallHits, 0, 'subiu sem bater');
});

test('carro: freio de mão derrapa (mais velocidade de lado) e cair do platô usa a gravidade', () => {
  const w = track();
  const side = (hand: boolean) => {
    const s = createCar(v3(0, 0, 25), 0);
    go(s, w, 2.5, { throttle: 1 });
    go(s, w, 0.6, { steer: 1, handbrake: hand });
    const f = v3(Math.sin(s.heading), 0, -Math.cos(s.heading));
    return Math.abs(s.vel.x * -f.z + s.vel.z * f.x);
  };
  assert.ok(side(true) > side(false) * 2, `derrapagem ${side(true).toFixed(1)} × ${side(false).toFixed(1)}`);
  // Sai da borda de um platô de 4 m: fica no ar e pousa.
  const drop = track((g, vx) => g.fill(0, 2, vx(32), 128, 10, 128, 1));
  const s = createCar(v3(0, 4, 20), 0);
  let air = false;
  for (let t = 0; t < 3; t += DT) { stepCar(s, { throttle: 1, brake: 0, steer: 0, handbrake: false }, P, drop, DT); air ||= !s.onGround; }
  assert.ok(air, 'ficou no ar');
  assert.ok(s.onGround && Math.abs(s.pos.y) < 1e-6, 'pousou no chão');
});

test('carro na cidade: anda pela rua central sem bater e sob a via elevada', () => {
  const terrainDef = WorldSchema.parse(worldJson), def = DistrictSchema.parse(districtJson);
  const g = generateDistrict(def, v3(-def.sizeM / 2, terrainDef.plateauHeight - 0.5, -def.sizeM / 2)).grid;
  const w = new Arena(new Terrain(terrainDef).generate(), g);
  const street = terrainDef.plateauHeight + 0.5;
  const s = createCar(v3(2.5, street, 150), 0);
  go(s, w, 9, { throttle: 1 });
  assert.equal(s.wallHits, 0, 'não bateu');
  assert.ok(s.pos.z < -135, `passou sob a via elevada (z ${s.pos.z.toFixed(0)})`);
  assert.ok(Math.abs(s.pos.y - street) < 0.01, `ficou no asfalto (y ${s.pos.y.toFixed(2)})`);
});
