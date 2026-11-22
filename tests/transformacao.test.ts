import assert from 'node:assert/strict';
import { test } from 'node:test';
import carJson from '../data/config/carro.json';
import dummyJson from '../data/config/dummy.json';
import bikeJson from '../data/config/moto.json';
import morphJson from '../data/config/transformacao.json';
import { DummySchema, lerpPose } from '../src/procgen/dummy';
import { buildBikeShape, buildCarShape, morphPiece, morphWheel, pairPieces } from '../src/procgen/vehicle-shape';
import { sectorOf } from '../src/render/form-wheel';
import { Arena } from '../src/sim/arena';
import { CarParamsSchema, type CarInput, forwardSpeed } from '../src/sim/car';
import { v3 } from '../src/sim/math';
import { MorphSchema, createVehicle, startMorph, stepVehicle } from '../src/sim/vehicle';
import { VOXEL, VoxelGrid } from '../src/sim/voxels';

const PARAMS = { car: CarParamsSchema.parse(carJson), bike: CarParamsSchema.parse(bikeJson) };
const M = MorphSchema.parse(morphJson);
const DT = 1 / 60;
const flat = { groundHeight: () => 0, waterHeight: () => -10 };
function track(build?: (g: VoxelGrid, vx: (m: number) => number) => void): Arena {
  const g = new VoxelGrid(128, 32, 128, v3(-32, -1, -32));
  g.fill(0, 0, 0, 128, 2, 128, 1);
  build?.(g, (m) => Math.round(m / VOXEL));
  return new Arena(flat, g);
}
const coast: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

test('transformação: dura o tempo do dado, troca a física no meio e mantém a velocidade', () => {
  const w = track();
  const s = createVehicle(v3(0, 0, 25), 0, 'car');
  for (let t = 0; t < 1.5; t += DT) stepVehicle(s, { ...coast, throttle: 1 }, PARAMS, M, w, DT);
  const v0 = forwardSpeed(s);
  assert.ok(startMorph(s, 'bike', PARAMS, w));
  assert.ok(!startMorph(s, 'car', PARAMS, w), 'não começa outra no meio');
  let switchedAt = -1, steps = 0;
  while (s.morphT < 1) { stepVehicle(s, coast, PARAMS, M, w, DT); steps++; if (switchedAt < 0 && s.physForm === 'bike') switchedAt = s.morphT; }
  assert.ok(Math.abs(steps * DT - M.durationS) <= DT * 1.01, `duração ${(steps * DT).toFixed(3)} s`);
  assert.ok(Math.abs(switchedAt - M.switchAt) <= DT / M.durationS + 1e-9, `física trocou em ${switchedAt.toFixed(2)}`);
  // Só o rolamento natural tira velocidade: nada de freada pela transformação.
  const loss = v0 - forwardSpeed(s);
  assert.ok(loss >= 0 && loss < PARAMS.car.rolling * M.durationS + v0 * PARAMS.car.drag * M.durationS + 0.2, `perdeu ${loss.toFixed(2)} m/s`);
  assert.equal(s.form, 'bike');
});

test('transformação: recusa se não couber; a física espera caber para trocar', () => {
  // Corredor de 1,5 m: de moto dentro dele, não vira carro.
  const w = track((g, vx) => { g.fill(vx(30), 2, 0, vx(31.25), 8, 128, 1); g.fill(vx(32.75), 2, 0, vx(34), 8, 128, 1); });
  const s = createVehicle(v3(0, 0, 0), 0, 'bike');
  assert.ok(!startMorph(s, 'car', PARAMS, w));
  // Começa a virar carro fora do corredor e entra nele durante a transformação: a física segue de moto.
  const t = createVehicle(v3(0, 0, 40), 0, 'bike');
  const open = track();
  assert.ok(startMorph(t, 'car', PARAMS, open));
  for (let i = 0; i < 60; i++) stepVehicle(t, coast, PARAMS, M, w, DT);
  t.pos.z = 0;
  t.physForm = 'bike';
  stepVehicle(t, coast, PARAMS, M, w, DT);
  assert.equal(t.physForm, 'bike', 'não troca a física onde o carro não cabe');
});

test('peças: toda peça tem par, e as pontas são exatamente o carro e a moto', () => {
  const pal = DummySchema.parse(dummyJson).colors;
  const car = buildCarShape(pal), bike = buildBikeShape(pal);
  const pairs = pairPieces(car.pieces, bike.pieces);
  assert.ok(pairs.length >= Math.max(car.pieces.length, bike.pieces.length));
  assert.ok(pairs.every((p) => p.a.kind === p.b.kind), 'caixa vira caixa, cilindro vira cilindro');
  const visible = (t: number) => pairs.map((p) => morphPiece(p, t)).filter((p) => p.size[0] * p.size[1] * p.size[2] > 0);
  assert.equal(visible(0).length, car.pieces.length, 'em t = 0 aparecem só as peças do carro');
  assert.equal(visible(1).length, bike.pieces.length, 'em t = 1 aparecem só as peças da moto');
  const key = (p: { pos: number[]; size: number[] }) => [...p.pos, ...p.size].map((v) => v.toFixed(4)).join(',');
  assert.deepEqual(visible(0).map(key).sort(), car.pieces.map(key).sort());
  assert.deepEqual(visible(1).map(key).sort(), bike.pieces.map(key).sort());
  // No meio, as peças saem do lugar (arco para cima).
  const mid = pairs.map((p) => morphPiece(p, 0.5));
  assert.ok(mid.some((p, i) => p.pos[1] > Math.max(pairs[i].a.pos[1], pairs[i].b.pos[1]) + 0.2), 'peças sobem no meio');
  // Rodas: 4 do carro viram 2 pares da moto.
  const w1 = car.wheels.map((w, i) => morphWheel(w, bike.wheels[i], 1));
  assert.deepEqual(w1.map((w) => w.pos), bike.wheels.map((w) => w.pos));
});

test('dummy: a pose da transformação vai do carro à moto', () => {
  const d = DummySchema.parse(dummyJson);
  assert.deepEqual(lerpPose(d.poses.car, d.poses.bike, 0).joints.hipL, d.poses.car.joints.hipL);
  assert.deepEqual(lerpPose(d.poses.car, d.poses.bike, 1).joints.hipL, d.poses.bike.joints.hipL);
  const mid = lerpPose(d.poses.car, d.poses.bike, 0.5).joints.kneeL!;
  assert.ok(mid[0] < d.poses.car.joints.kneeL![0] && mid[0] > d.poses.bike.joints.kneeL![0]);
});

test('peças com nome: a mesma peça de papel vira a outra (frente vira frente)', () => {
  const pal = DummySchema.parse(dummyJson).colors;
  const car = buildCarShape(pal), bike = buildBikeShape(pal);
  const pairs = pairPieces(car.pieces, bike.pieces);
  const named = pairs.filter((p) => p.a.name && p.a.name === p.b.name);
  for (const n of ['chassi', 'frente', 'capo', 'lateral-e', 'lateral-d', 'banco', 'comando', 'motor', 'traseira', 'luz-e', 'luz-d'])
    assert.ok(named.some((p) => p.a.name === n), `a peça "${n}" deveria casar pelo nome`);
  // Nomes não se repetem dentro de uma forma.
  for (const s of [car, bike]) {
    const names = s.pieces.map((p) => p.name).filter(Boolean);
    assert.equal(new Set(names).size, names.length, 'nomes únicos');
  }
  // Ida e volta: bike → car também começa e termina certo.
  const back = pairPieces(bike.pieces, car.pieces);
  const vis = (t: number) => back.map((p) => morphPiece(p, t)).filter((p) => p.size[0] * p.size[1] * p.size[2] > 0).length;
  assert.equal(vis(0), bike.pieces.length);
  assert.equal(vis(1), car.pieces.length);
});

test('roda de formas: direção vira setor (cima carro, direita moto, baixo hover, esquerda tanque)', () => {
  assert.equal(sectorOf(0, -1), 0);
  assert.equal(sectorOf(1, 0), 1);
  assert.equal(sectorOf(0, 1), 2);
  assert.equal(sectorOf(-1, 0), 3);
  assert.equal(sectorOf(0.1, 0.1), -1, 'centro não escolhe');
  assert.equal(sectorOf(0.7, -0.6), 1, 'diagonal decide pelo lado mais forte');
});
