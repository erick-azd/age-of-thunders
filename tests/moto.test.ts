import assert from 'node:assert/strict';
import { test } from 'node:test';
import carJson from '../data/config/carro.json';
import bikeJson from '../data/config/moto.json';
import { Arena } from '../src/sim/arena';
import { CarParamsSchema, type CarInput, type CarParams, type CarState, createCar, fitsAt, forwardSpeed, stepCar } from '../src/sim/car';
import { DEG, v3 } from '../src/sim/math';
import { VOXEL, VoxelGrid } from '../src/sim/voxels';

const CAR = CarParamsSchema.parse(carJson), BIKE = CarParamsSchema.parse(bikeJson);
const DT = 1 / 60;
const flat = { groundHeight: () => 0, waterHeight: () => -10 };

function track(build?: (g: VoxelGrid, vx: (m: number) => number) => void): Arena {
  const g = new VoxelGrid(128, 32, 128, v3(-32, -1, -32));
  g.fill(0, 0, 0, 128, 2, 128, 1);
  build?.(g, (m) => Math.round(m / VOXEL));
  return new Arena(flat, g);
}
const go = (s: CarState, p: CarParams, w: Arena, seconds: number, inp: Partial<CarInput>) => {
  const i: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...inp };
  for (let t = 0; t < seconds; t += DT) stepCar(s, i, p, w, DT);
};

test('moto: inclina para o lado da curva, até o limite, e nunca cai', () => {
  const w = track();
  for (const dir of [1, -1]) {
    const s = createCar(v3(0, 0, 20), 0);
    go(s, BIKE, w, 1.5, { throttle: 1 });
    let ground = true;
    for (let t = 0; t < 1.5; t += DT) { stepCar(s, { throttle: 1, brake: 0, steer: dir, handbrake: false }, BIKE, w, DT); ground &&= s.onGround; }
    assert.ok(Math.sign(s.lean) === dir && Math.abs(s.lean) > 15 * DEG, `inclinação ${(s.lean / DEG).toFixed(1)}°`);
    assert.ok(Math.abs(s.lean) <= BIKE.leanMaxDeg * DEG + 1e-9, 'dentro do limite');
    assert.ok(ground, 'sempre com as rodas no chão');
  }
  // Reta: volta a ficar em pé.
  const s = createCar(v3(0, 0, 20), 0);
  go(s, BIKE, w, 1, { throttle: 1, steer: 1 });
  go(s, BIKE, w, 1, { throttle: 1 });
  assert.ok(Math.abs(s.lean) < 2 * DEG, 'endireita na reta');
  assert.equal(CAR.leanMaxDeg, 0, 'o carro não inclina');
});

test('moto: mais ágil que o carro (curva mais fechada e acelera mais)', () => {
  const w = track();
  const turn = (p: CarParams) => {
    const s = createCar(v3(0, 0, 0), 0);
    go(s, p, w, 0.9, { throttle: 1 });
    const h0 = s.heading;
    go(s, p, w, 1, { throttle: 1, steer: 1 });
    return s.heading - h0;
  };
  assert.ok(turn(BIKE) > turn(CAR) * 1.15, `giro moto ${turn(BIKE).toFixed(2)} × carro ${turn(CAR).toFixed(2)}`);
  const speed = (p: CarParams) => { const s = createCar(v3(0, 0, 20), 0); go(s, p, w, 1.5, { throttle: 1 }); return forwardSpeed(s); };
  assert.ok(speed(BIKE) > speed(CAR), 'acelera mais');
});

test('moto: passa num vão de 1,5 m onde o carro não passa; sobe meio-fio; quica na parede', () => {
  // Duas paredes deixando um vão de 1,5 m centrado em x = 0, em z = −5 m.
  const gap = track((g, vx) => { g.fill(0, 2, vx(26), vx(31.25), 8, vx(28), 1); g.fill(vx(32.75), 2, vx(26), 128, 8, vx(28), 1); });
  const b = createCar(v3(0, 0, 10), 0), c = createCar(v3(0, 0, 10), 0);
  go(b, BIKE, gap, 1.6, { throttle: 1 });
  go(c, CAR, gap, 1.6, { throttle: 1 });
  assert.ok(b.pos.z < -8 && b.wallHits === 0, `moto passou (z ${b.pos.z.toFixed(1)})`);
  assert.ok(c.pos.z > -5 && c.wallHits > 0, 'carro bateu');
  const curb = track((g, vx) => g.fill(0, 2, 0, 128, 3, vx(22), 1));
  const m = createCar(v3(0, 0, 10), 0);
  go(m, BIKE, curb, 1.8, { throttle: 1 });
  assert.ok(Math.abs(m.pos.y - 0.5) < 1e-6, 'subiu o meio-fio');
});

test('troca de forma: só se a nova carroceria couber', () => {
  // Corredor de 1,5 m: a moto está dentro; o carro (2 m) não cabe ali.
  const w = track((g, vx) => { g.fill(vx(30.0), 2, 0, vx(31.25), 8, 128, 1); g.fill(vx(32.75), 2, 0, vx(34), 8, 128, 1); });
  const s = createCar(v3(0, 0, 0), 0);
  assert.ok(fitsAt(s, BIKE, w));
  assert.ok(!fitsAt(s, CAR, w));
  assert.ok(fitsAt(createCar(v3(10, 0, 0), 0), CAR, w), 'fora do corredor cabe');
});
