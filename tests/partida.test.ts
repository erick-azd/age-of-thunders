import assert from 'node:assert/strict';
import { test } from 'node:test';
import weaponJson from '../data/config/canhao.json';
import carJson from '../data/config/carro.json';
import combatJson from '../data/config/combate.json';
import bikeJson from '../data/config/moto.json';
import morphJson from '../data/config/transformacao.json';
import districtJson from '../data/world/bairro.json';
import worldJson from '../data/world/mundo.json';
import { DistrictSchema, generateDistrict } from '../src/procgen/district';
import { Terrain, WorldSchema } from '../src/procgen/terrain';
import { Arena } from '../src/sim/arena';
import { buildStreetNav } from '../src/sim/bot';
import { CarParamsSchema, neutralCarInput } from '../src/sim/car';
import { CombatSchema, type MatchState, type PlayerCommand, createMatch, stepMatch } from '../src/sim/match';
import { v3 } from '../src/sim/math';
import { MorphSchema } from '../src/sim/vehicle';
import { VOXEL } from '../src/sim/voxels';
import { WeaponSchema, fire } from '../src/sim/weapons';

const td = WorldSchema.parse(worldJson), dd = DistrictSchema.parse(districtJson);
const terrain = new Terrain(td).generate();
const C = CombatSchema.parse(combatJson);
const P = { cars: { car: CarParamsSchema.parse(carJson), bike: CarParamsSchema.parse(bikeJson) }, morph: MorphSchema.parse(morphJson), weapon: WeaponSchema.parse(weaponJson), combat: C };
const spawn = { pos: v3(2.5, td.plateauHeight + 0.5, 150), heading: 0 };
const DT = 1 / 60;
const idle: PlayerCommand = { input: neutralCarInput(), fire: false, aim: null, muzzle: null, morph: null };

/** Mundo novo a cada teste (os tiros arrancam voxels). */
function setup(seed = 1993) {
  const d = generateDistrict(dd, v3(-dd.sizeM / 2, td.plateauHeight - 0.5, -dd.sizeM / 2));
  const w = new Arena(terrain, d.grid);
  const nav = buildStreetNav(dd, td.plateauHeight + 0.5, d.viaducts.map((v) => ({ axis: v.axis, lineM: -dd.sizeM / 2 + v.line * VOXEL })));
  return { w, grid: d.grid, nav, m: createMatch(seed, nav, spawn, C) };
}
const run = (s: ReturnType<typeof setup>, seconds: number, cmd: PlayerCommand = idle) => {
  const ev = [];
  for (let t = 0; t < seconds; t += DT) ev.push(...stepMatch(s.m, cmd, P, s.w, s.grid, s.nav, spawn, DT));
  return ev;
};

test('bot: patrulha 90 s pelas ruas sem sair da cidade e sem empacar', () => {
  const s = setup();
  const b = s.m.fighters[1];
  let path = 0, last = { ...b.veh.pos }, out = 0;
  for (let t = 0; t < 90; t += DT) {
    stepMatch(s.m, idle, P, s.w, s.grid, s.nav, spawn, DT);
    path += Math.hypot(b.veh.pos.x - last.x, b.veh.pos.z - last.z);
    last = { ...b.veh.pos };
    out = Math.max(out, Math.abs(b.veh.pos.x) - dd.sizeM / 2, Math.abs(b.veh.pos.z) - dd.sizeM / 2);
  }
  assert.ok(out < 6, `saiu da cidade ${out.toFixed(1)} m`);
  assert.ok(path > 900, `andou pouco: ${path.toFixed(0)} m em 90 s`);
});

test('bot: vendo o jogador por perto, atira e acerta', () => {
  const s = setup();
  const b = s.m.fighters[1], p = s.m.fighters[0];
  // Jogador parado 35 m à frente do bot, na mesma rua.
  p.veh.pos = v3(b.veh.pos.x + Math.sin(b.veh.heading) * 35, b.veh.pos.y, b.veh.pos.z - Math.cos(b.veh.heading) * 35);
  const ev = run(s, 6);
  assert.ok(ev.some((e) => e.type === 'shot' && e.owner === 1), 'o bot atirou');
  assert.ok(ev.some((e) => e.type === 'hit' && e.victim === 0), 'acertou o jogador');
  assert.ok(p.hp < C.playerHp);
});

test('dano: acerto direto + explosão; zerou, é abatido, conta ponto e volta depois', () => {
  const s = setup();
  const b = s.m.fighters[1];
  let kills = 0;
  for (let i = 0; i < 30 && kills === 0; i++) {
    const t = b.veh.pos;
    s.m.shots.push(fire(v3(t.x, t.y + 6, t.z), v3(t.x, t.y + 0.8, t.z), P.weapon, 0));
    const ev = run(s, 0.2);
    kills += ev.filter((e) => e.type === 'kill' && e.victim === 1 && e.killer === 0).length;
  }
  assert.equal(kills, 1, 'bot abatido');
  assert.equal(s.m.fighters[0].kills, 1);
  assert.equal(b.deaths, 1);
  const back = run(s, C.respawnS + 0.1);
  assert.ok(back.some((e) => e.type === 'respawn' && e.id === 1), 'voltou');
  assert.equal(b.hp, C.botHp);
});

test('alvos: o jogador derruba um alvo, conta ponto e ele volta depois', () => {
  const s = setup();
  const t = s.m.targets[0];
  let down = false;
  for (let i = 0; i < 10 && !down; i++) {
    s.m.shots.push(fire(v3(t.x, t.y + 8, t.z + 0.1), v3(t.x, t.y + 1.2, t.z), P.weapon, 0));
    down = run(s, 0.2).some((e) => e.type === 'targetDown' && e.owner === 0);
  }
  assert.ok(down && s.m.targetsDown === 1, 'alvo derrubado');
  run(s, C.targetRespawnS + 0.1);
  assert.ok(t.respawnT <= 0 && t.hp === C.targetHp, 'alvo voltou');
});

test('partida: determinística (mesma seed e mesmos comandos, mesmo estado)', () => {
  const a = setup(), b = setup();
  const cmd: PlayerCommand = { ...idle, input: { throttle: 1, brake: 0, steer: 0.2, handbrake: false } };
  run(a, 20, cmd);
  run(b, 20, cmd);
  assert.deepEqual(structuredClone(a.m) as MatchState, structuredClone(b.m) as MatchState);
  assert.equal(a.grid.checksum(), b.grid.checksum());
});
