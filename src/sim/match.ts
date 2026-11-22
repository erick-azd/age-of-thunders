import { z } from 'zod';
import { type RngState, nextRandom, rngState } from '../core/rng';
import { type CarInput, type CarParams, type CarWorld } from './car';
import { type BotBrain, type StreetNav, botThink, headingAlong, newBrain } from './bot';
import { type Vec3, v3 } from './math';
import { type Form, type MorphParams, type VehicleState, createVehicle, startMorph, stepVehicle } from './vehicle';
import type { VoxelGrid } from './voxels';
import { type Blast, type Projectile, type ShotWorld, type WeaponParams, fire, stepProjectiles } from './weapons';

/**
 * Partida do M0 (M0.7, ADR 0010), pura e determinística: combatentes (o jogador e bots) com vida,
 * alvos fixos, projéteis com dono, dano direto e de área, abates, derrotas e reaparecimento.
 * A mira do jogador e a boca do canhão dele chegam como entrada (vêm da câmera e da torre).
 */
export const CombatSchema = z.object({
  playerHp: z.number().min(1).max(1000).default(100),
  botHp: z.number().min(1).max(1000).default(100),
  directDamage: z.number().min(0).max(200).default(14),
  blastDamage: z.number().min(0).max(200).default(10),
  respawnS: z.number().min(0.5).max(20).default(3),
  targets: z.number().int().min(0).max(40).default(8),
  targetHp: z.number().min(1).max(500).default(30),
  targetRespawnS: z.number().min(1).max(120).default(15),
  bots: z.number().int().min(0).max(8).default(1),
  botViewM: z.number().min(10).max(400).default(130),
  botFireM: z.number().min(5).max(300).default(90),
  botAimErrorDeg: z.number().min(0).max(30).default(3.5),
  botCooldownS: z.number().min(0.1).max(5).default(0.6),
  botCruise: z.number().min(0.1).max(1).default(0.75),
});
export type CombatParams = z.infer<typeof CombatSchema>;
export const COMBAT_SPECS = [
  { key: 'playerHp', label: 'Vida do jogador', min: 10, max: 400, step: 10 },
  { key: 'botHp', label: 'Vida do bot', min: 10, max: 400, step: 10 },
  { key: 'directDamage', label: 'Dano do acerto direto', min: 0, max: 60, step: 1 },
  { key: 'blastDamage', label: 'Dano da explosão (centro)', min: 0, max: 60, step: 1 },
  { key: 'botAimErrorDeg', label: 'Erro de mira do bot', min: 0, max: 15, step: 0.5, unit: '°' },
  { key: 'botCooldownS', label: 'Cadência do bot', min: 0.2, max: 3, step: 0.05, unit: 's' },
  { key: 'botCruise', label: 'Acelerador do bot', min: 0.2, max: 1, step: 0.05 },
  { key: 'botViewM', label: 'Visão do bot', min: 20, max: 300, step: 10, unit: 'm' },
] as const;

export type Team = 'player' | 'bot';
export interface Fighter {
  id: number; team: Team; veh: VehicleState; hp: number; maxHp: number;
  /** > 0: destruído, reaparece quando zerar. */
  respawnT: number;
  cooldown: number; kills: number; deaths: number;
  /** Tempo desde o último dano recebido (para o HUD piscar). */
  hurtT: number;
  brain: BotBrain | null;
}
export interface Target { id: number; x: number; y: number; z: number; hp: number; respawnT: number }
export interface MatchState { time: number; rng: RngState; fighters: Fighter[]; targets: Target[]; shots: Projectile[]; targetsDown: number }

export type MatchEvent =
  | { type: 'shot'; owner: number }
  | { type: 'blast'; blast: Blast }
  | { type: 'hit'; victim: number; owner: number; damage: number }
  | { type: 'kill'; victim: number; killer: number; pos: Vec3 }
  | { type: 'targetDown'; target: number; owner: number; pos: Vec3 }
  | { type: 'respawn'; id: number };

export interface MatchParams { cars: Record<Form, CarParams>; morph: MorphParams; weapon: WeaponParams; combat: CombatParams }
export type MatchWorld = CarWorld & ShotWorld;

export interface PlayerCommand {
  input: CarInput;
  fire: boolean;
  /** Ponto mirado (raio da câmera) e boca do canhão (torre); nulos = sem mira. */
  aim: Vec3 | null;
  muzzle: Vec3 | null;
  morph: Form | null;
}

/** Ids: 0 é o jogador, 1… os bots; alvos usam 100 + índice (para o acerto direto). */
export const TARGET_ID0 = 100;
const TARGET_R = 0.9, TARGET_H = 2.6;

export function createMatch(seed: number, nav: StreetNav, spawn: { pos: Vec3; heading: number }, c: CombatParams): MatchState {
  const rng = rngState(seed);
  const fighters: Fighter[] = [mkFighter(0, 'player', createVehicle(spawn.pos, spawn.heading, 'car'), c.playerHp)];
  for (let i = 0; i < c.bots; i++) {
    const n = nav.nodes[botSpawnNode(nav, rng, spawn.pos)];
    const brain = newBrain(nav, n.index, rng);
    const f = mkFighter(i + 1, 'bot', createVehicle(v3(n.x, n.y, n.z), headingAlong(nav, n.index, brain.node), 'car'), c.botHp);
    f.brain = brain;
    fighters.push(f);
  }
  return { time: 0, rng, fighters, targets: placeTargets(nav, rng, c.targets, c.targetHp), shots: [], targetsDown: 0 };
}

function mkFighter(id: number, team: Team, veh: VehicleState, hp: number): Fighter {
  return { id, team, veh, hp, maxHp: hp, respawnT: 0, cooldown: 0, kills: 0, deaths: 0, hurtT: 99, brain: null };
}

/** Nó de rua para reaparecer, longe do ponto dado (> 60 m quando houver). */
function botSpawnNode(nav: StreetNav, rng: RngState, far: Vec3): number {
  const ok = nav.nodes.filter((n) => n.interior && Math.hypot(n.x - far.x, n.z - far.z) > 60);
  const pool = ok.length ? ok : nav.nodes.filter((n) => n.links.length);
  return pool[Math.floor(nextRandom(rng) * pool.length)].index;
}

/** Alvos na quina da calçada de cruzamentos internos, sem repetir cruzamento. */
function placeTargets(nav: StreetNav, rng: RngState, n: number, hp: number): Target[] {
  const pool = nav.nodes.filter((x) => x.interior).map((x) => x.index), out: Target[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const k = Math.floor(nextRandom(rng) * pool.length), node = nav.nodes[pool.splice(k, 1)[0]];
    const sx = nextRandom(rng) < 0.5 ? -1 : 1, sz = nextRandom(rng) < 0.5 ? -1 : 1;
    out.push({ id: TARGET_ID0 + i, x: node.x + sx * nav.cornerOffset, y: node.y + 0.5, z: node.z + sz * nav.cornerOffset, hp, respawnT: 0 });
  }
  return out;
}

/** O ponto está dentro da carroceria do veículo (caixa orientada, com folga para o Dummy)? */
export function insideVehicle(f: Fighter, p: CarParams, x: number, y: number, z: number): boolean {
  const v = f.veh, dx = x - v.pos.x, dz = z - v.pos.z, sh = Math.sin(v.heading), ch = Math.cos(v.heading);
  const side = dx * ch + dz * sh, fwd = dx * sh - dz * ch, up = y - v.pos.y;
  return Math.abs(side) <= p.width / 2 + 0.25 && Math.abs(fwd) <= p.length / 2 + 0.25 && up >= -0.2 && up <= p.height + 0.7;
}

const alive = (f: Fighter) => f.respawnT <= 0;

/** Um passo fixo da partida inteira. */
export function stepMatch(m: MatchState, cmd: PlayerCommand, P: MatchParams, w: MatchWorld, grid: VoxelGrid, nav: StreetNav, spawn: { pos: Vec3; heading: number }, dt: number): MatchEvent[] {
  const ev: MatchEvent[] = [];
  const C = P.combat;
  m.time += dt;
  const player = m.fighters[0];

  for (const f of m.fighters) {
    f.hurtT += dt;
    if (!alive(f)) {
      f.respawnT -= dt;
      if (f.respawnT <= 0) respawn(m, f, nav, spawn, C, ev);
      continue;
    }
    f.cooldown = Math.max(0, f.cooldown - dt);
    let input: CarInput, fireNow = false, aim: Vec3 | null = null, muzzle: Vec3 | null = null;
    if (f.team === 'player') {
      input = cmd.input;
      if (cmd.morph) startMorph(f.veh, cmd.morph, P.cars, w);
      fireNow = cmd.fire; aim = cmd.aim; muzzle = cmd.muzzle;
    } else {
      const enemy = alive(player) ? player : null;
      const t = botThink(f.veh, f.brain!, enemy?.veh ?? null, nav, w, m.rng, C, dt);
      input = t.input; fireNow = t.fire; aim = t.aim;
      muzzle = v3(f.veh.pos.x, f.veh.pos.y + (f.veh.physForm === 'car' ? 2.1 : 1.3), f.veh.pos.z);
    }
    const evs = stepVehicle(f.veh, input, P.cars, P.morph, w, dt);
    if (evs.some((e) => e.type === 'water') || f.veh.pos.y < -60) { destroy(m, f, -1, ev, C); continue; }
    if (fireNow && aim && muzzle && f.cooldown === 0) {
      m.shots.push(fire(muzzle, aim, P.weapon, f.id));
      ev.push({ type: 'shot', owner: f.id });
      f.cooldown = f.team === 'player' ? P.weapon.cooldownS : C.botCooldownS;
    }
  }

  // Projéteis: acertam veículos (menos o de quem atirou), alvos, voxels e terreno.
  const strike = (s: Projectile): number => {
    for (const f of m.fighters) if (f.id !== s.owner && alive(f) && insideVehicle(f, P.cars[f.veh.physForm], s.pos.x, s.pos.y, s.pos.z)) return f.id;
    for (const t of m.targets) if (t.respawnT <= 0 && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) <= TARGET_R && s.pos.y >= t.y && s.pos.y <= t.y + TARGET_H) return t.id;
    return -1;
  };
  const R = P.weapon.blastRadiusM;
  for (const b of stepProjectiles(m.shots, w, grid, P.weapon, dt, strike)) {
    ev.push({ type: 'blast', blast: b });
    const killer = m.fighters.find((f) => f.id === b.owner) ?? null;
    // Dano: direto em quem foi atingido + área (cai até zero em 2R) em todos, menos em quem atirou.
    for (const f of m.fighters) {
      if (!alive(f) || f.id === b.owner) continue;
      const d = Math.hypot(b.pos.x - f.veh.pos.x, b.pos.y - (f.veh.pos.y + 0.8), b.pos.z - f.veh.pos.z);
      const dmg = (b.struck === f.id ? C.directDamage : 0) + (d < 2 * R ? C.blastDamage * (1 - d / (2 * R)) : 0);
      if (dmg <= 0) continue;
      f.hp -= dmg;
      f.hurtT = 0;
      ev.push({ type: 'hit', victim: f.id, owner: b.owner, damage: dmg });
      if (f.hp <= 0) destroy(m, f, killer ? killer.id : -1, ev, C);
    }
    for (const t of m.targets) {
      if (t.respawnT > 0) continue;
      const d = Math.hypot(b.pos.x - t.x, b.pos.y - (t.y + 1.2), b.pos.z - t.z);
      const dmg = (b.struck === t.id ? C.directDamage : 0) + (d < 2 * R ? C.blastDamage * (1 - d / (2 * R)) : 0);
      if (dmg <= 0) continue;
      t.hp -= dmg;
      if (t.hp <= 0) {
        t.respawnT = C.targetRespawnS;
        if (b.owner === 0) m.targetsDown++;
        ev.push({ type: 'targetDown', target: t.id, owner: b.owner, pos: v3(t.x, t.y, t.z) });
      }
    }
  }
  for (const t of m.targets) if (t.respawnT > 0 && (t.respawnT -= dt) <= 0) t.hp = C.targetHp;
  return ev;
}

function destroy(m: MatchState, f: Fighter, killer: number, ev: MatchEvent[], C: CombatParams): void {
  f.hp = 0;
  f.respawnT = C.respawnS;
  f.deaths++;
  const k = m.fighters.find((x) => x.id === killer);
  if (k && k !== f) k.kills++;
  ev.push({ type: 'kill', victim: f.id, killer, pos: v3(f.veh.pos.x, f.veh.pos.y, f.veh.pos.z) });
}

function respawn(m: MatchState, f: Fighter, nav: StreetNav, spawn: { pos: Vec3; heading: number }, C: CombatParams, ev: MatchEvent[]): void {
  const keep = f.veh.form;
  if (f.team === 'player') f.veh = createVehicle(spawn.pos, spawn.heading, keep);
  else {
    const n = nav.nodes[botSpawnNode(nav, m.rng, m.fighters[0].veh.pos)];
    f.brain = newBrain(nav, n.index, m.rng);
    f.veh = createVehicle(v3(n.x, n.y, n.z), headingAlong(nav, n.index, f.brain.node), 'car');
  }
  f.hp = f.maxHp = f.team === 'player' ? C.playerHp : C.botHp;
  f.respawnT = 0;
  f.cooldown = 0;
  ev.push({ type: 'respawn', id: f.id });
}
