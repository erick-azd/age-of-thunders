import assert from 'node:assert/strict';
import { test } from 'node:test';
import dummyJson from '../data/config/dummy.json';
import { JOINTS, DummySchema, buildDummyRig, jointPosition, poseBounds, writePose } from '../src/procgen/dummy';

const def = DummySchema.parse(dummyJson);
const rig = buildDummyRig(def);
const P = def.poses;

test('dummy: uma peça por junta, pai antes do filho', () => {
  assert.equal(rig.parts.length, JOINTS.length);
  const seen = new Set<string>();
  for (const p of rig.parts) {
    if (p.parent) assert.ok(seen.has(p.parent), `${p.joint} vem antes do pai ${p.parent}`);
    seen.add(p.joint);
  }
  assert.equal(seen.size, JOINTS.length);
  for (const name of ['tpose', 'standing', 'car', 'bike']) assert.ok(P[name], `falta a pose ${name}`);
});

test('dummy: em T tem a altura do dado, pés no chão, simétrico e envergadura de gente', () => {
  const [x0, y0, , x1, y1] = poseBounds(rig, P.tpose);
  assert.ok(Math.abs(y1 - y0 - def.heightM) < 0.05, `altura ${(y1 - y0).toFixed(3)} m`);
  assert.ok(Math.abs(y0) < 0.03, `pés em ${y0.toFixed(3)} m`);
  assert.ok(Math.abs(x0 + x1) < 0.01, 'simétrico em X');
  const span = x1 - x0;
  assert.ok(span > def.heightM * 0.85 && span < def.heightM * 1.1, `envergadura ${span.toFixed(2)} m`);
});

test('dummy: lado esquerdo em −X, mãos abaixo da cintura em pé', () => {
  const sl = jointPosition(rig, P.standing, 'shoulderL'), sr = jointPosition(rig, P.standing, 'shoulderR');
  assert.ok(sl[0] < 0 && sr[0] > 0);
  const hip = jointPosition(rig, P.standing, 'root')[1];
  for (const w of ['wristL', 'wristR'] as const) assert.ok(jointPosition(rig, P.standing, w)[1] < hip + 0.1);
  const [, y0] = poseBounds(rig, P.standing);
  assert.ok(Math.abs(y0) < 0.03, 'em pé, pés no chão');
});

test('dummy: sentado no carro e na moto', () => {
  for (const name of ['car', 'bike']) {
    const root = jointPosition(rig, P[name], 'root'), head = jointPosition(rig, P[name], 'head');
    const knee = jointPosition(rig, P[name], 'kneeL'), wrist = jointPosition(rig, P[name], 'wristL');
    assert.ok(Math.abs(root[1] - P[name].rootY * rig.scale) < 1e-9, 'pelve na altura do assento');
    assert.ok(head[1] - root[1] > 0.4, `${name}: base da cabeça bem acima da pelve`);
    assert.ok(wrist[1] > root[1] + 0.1, `${name}: mãos acima do assento`);
    assert.ok(knee[2] < root[2] - 0.2, `${name}: joelhos à frente`);
    assert.ok(wrist[2] < root[2] - 0.3, `${name}: mãos à frente (volante ou guidão)`);
  }
  // Na moto o tronco inclina para a frente; no carro, para trás.
  const lean = (n: string) => jointPosition(rig, P[n], 'neck')[2] - jointPosition(rig, P[n], 'root')[2];
  assert.ok(lean('bike') < -0.1, 'moto: inclinado para a frente');
  assert.ok(lean('car') > 0, 'carro: encostado');
});

test('dummy: pose determinística e cabe no buffer', () => {
  const a = new Float32Array(rig.vertexCount * 3), b = new Float32Array(rig.vertexCount * 3);
  writePose(rig, P.bike, a);
  writePose(rig, P.bike, b);
  assert.deepEqual(a, b);
  assert.ok(rig.vertexCount < 6000, `Dummy pesado demais: ${rig.vertexCount} vértices`);
});
