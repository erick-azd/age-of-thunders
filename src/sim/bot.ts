import { type RngState, nextRandom } from '../core/rng';
import { type CarInput, forwardSpeed } from './car';
import type { CombatParams, MatchWorld } from './match';
import { DEG, clamp, type Vec3, v3 } from './math';
import type { VehicleState } from './vehicle';

/**
 * Bot do M0 (M0.7, ADR 0010), puro. Anda só pelas ruas (grafo de cruzamentos), na faixa da
 * direita; patrulha ao acaso e, quando vê o jogador, vai para o cruzamento mais perto dele e atira
 * com um pouco de erro. Se empacar, dá ré. Por andar no grafo, nunca sai da cidade.
 */
export interface NavNode { index: number; x: number; y: number; z: number; interior: boolean; links: number[] }
export interface StreetNav { nodes: NavNode[]; laneOffset: number; cornerOffset: number; bounds: { x0: number; z0: number; x1: number; z1: number }; pillarLines: { axis: 'x' | 'z'; lineM: number }[] }

/**
 * Grafo das ruas a partir da grade da cidade (centro em x = z = 0, ruas na altura `streetY`).
 * Só as ruas internas entram: as da borda têm meia largura e recebem as pontas das rampas das vias
 * elevadas, onde o bot empacava. O bot anda no meio da rua (curvas mais abertas), menos sob as
 * vias elevadas (`ramps`), onde os pilares ficam no meio: ali ele usa a faixa da direita.
 */
export function buildStreetNav(d: { sizeM: number; blockPitchM: number; streetM: number; sidewalkM: number }, streetY: number, ramps: { axis: 'x' | 'z'; lineM: number }[] = []): StreetNav {
  const lines: number[] = [];
  for (let m = 0; m < d.sizeM; m += d.blockPitchM) lines.push(m - d.sizeM / 2);
  lines.push(d.sizeM / 2);
  const n = lines.length, nodes: NavNode[] = [];
  const inner = (i: number, k: number) => i > 0 && k > 0 && i < n - 1 && k < n - 1;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const links: number[] = [];
    if (inner(i, k)) {
      if (inner(i - 1, k)) links.push(k * n + i - 1);
      if (inner(i + 1, k)) links.push(k * n + i + 1);
      if (inner(i, k - 1)) links.push((k - 1) * n + i);
      if (inner(i, k + 1)) links.push((k + 1) * n + i);
    }
    nodes.push({ index: k * n + i, x: lines[i], y: streetY, z: lines[k], interior: inner(i, k), links });
  }
  const h = d.sizeM / 2;
  return { nodes, laneOffset: d.streetM / 4, cornerOffset: d.streetM / 2 + d.sidewalkM / 2, bounds: { x0: -h, z0: -h, x1: h, z1: h }, pillarLines: ramps };
}

export interface BotBrain { node: number; prev: number; next: number; stuckT: number; reverseT: number; losT: number; sees: boolean }

/** Próximo cruzamento depois de `node` vindo de `prev` (sem voltar): ao acaso, ou o mais perto do alvo. */
function pick(nav: StreetNav, node: number, prev: number, rng: RngState, chase: Vec3 | null): number {
  const links = nav.nodes[node].links;
  let options = links.filter((l) => l !== prev);
  if (!options.length) options = links;
  if (chase) {
    let best = options[0], bd = Infinity;
    // Sem meia-volta no cruzamento (não há espaço): contorna o quarteirão.
    for (const l of options) { const n = nav.nodes[l], d = Math.hypot(n.x - chase.x, n.z - chase.z); if (d < bd) { bd = d; best = l; } }
    return best;
  }
  return options[Math.floor(nextRandom(rng) * options.length)];
}

export function newBrain(nav: StreetNav, at: number, rng: RngState): BotBrain {
  const node = nav.nodes[at].links[Math.floor(nextRandom(rng) * nav.nodes[at].links.length)];
  return { node, prev: at, next: pick(nav, node, at, rng, null), stuckT: 0, reverseT: 0, losT: 0, sees: false };
}

/** Rumo de quem sai do cruzamento `from` para o `to`. */
export function headingAlong(nav: StreetNav, from: number, to: number): number {
  const a = nav.nodes[from], b = nav.nodes[to];
  return Math.atan2(b.x - a.x, -(b.z - a.z));
}

/** Linha de visão livre (sem voxel sólido) entre dois pontos. */
export function clearLine(w: MatchWorld, a: Vec3, b: Vec3): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.ceil(d / 0.75);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (w.solidAt(x, y, z) || y < w.groundHeight(x, z)) return false;
  }
  return true;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Faixa do trecho: meio da rua, ou a da direita sob uma via elevada (pilares no meio). */
function laneFor(nav: StreetNav, a: NavNode, b: NavNode): number {
  const onPillars = nav.pillarLines.some((r) => (r.axis === 'x' ? Math.abs(a.z - r.lineM) < 0.5 && Math.abs(b.z - r.lineM) < 0.5 : Math.abs(a.x - r.lineM) < 0.5 && Math.abs(b.x - r.lineM) < 0.5));
  return onPillars ? nav.laneOffset : 0;
}

export function botThink(v: VehicleState, b: BotBrain, enemy: VehicleState | null, nav: StreetNav, w: MatchWorld, rng: RngState, C: CombatParams, dt: number): { input: CarInput; fire: boolean; aim: Vec3 | null } {
  const p = v.pos;
  const dist = enemy ? Math.hypot(enemy.pos.x - p.x, enemy.pos.y - p.y, enemy.pos.z - p.z) : Infinity;
  // Linha de visão a cada 0,25 s.
  b.losT -= dt;
  if (!enemy) b.sees = false;
  else if (b.losT <= 0) {
    b.losT = 0.25;
    b.sees = dist < C.botViewM && clearLine(w, v3(p.x, p.y + 1.6, p.z), v3(enemy.pos.x, enemy.pos.y + 1, enemy.pos.z));
  }

  // Segue a faixa da direita entre dois cruzamentos: mira 10 m à frente da projeção na linha da
  // faixa (não corta caminho pelo meio da rua, onde ficam os pilares das vias elevadas).
  let nf = nav.nodes[b.prev], nt = nav.nodes[b.node];
  let L = Math.hypot(nt.x - nf.x, nt.z - nf.z) || 1, ex = (nt.x - nf.x) / L, ez = (nt.z - nf.z) / L;
  let lane = laneFor(nav, nf, nt);
  let lx = -ez * lane, lz = ex * lane; // direita de quem anda de nf para nt
  let proj = (p.x - nf.x - lx) * ex + (p.z - nf.z - lz) * ez;
  if (b.sees && enemy && b.losT === 0.25) b.next = pick(nav, b.node, b.prev, rng, enemy.pos);
  if (proj >= L - 4) {
    // Chegou ao cruzamento: segue para o próximo planejado e já planeja o seguinte.
    b.prev = b.node;
    b.node = b.next;
    b.next = pick(nav, b.node, b.prev, rng, b.sees && enemy ? enemy.pos : null);
    nf = nav.nodes[b.prev]; nt = nav.nodes[b.node];
    L = Math.hypot(nt.x - nf.x, nt.z - nf.z) || 1; ex = (nt.x - nf.x) / L; ez = (nt.z - nf.z) / L;
    lane = laneFor(nav, nf, nt);
    lx = -ez * lane; lz = ex * lane;
    proj = (p.x - nf.x - lx) * ex + (p.z - nf.z - lz) * ez;
  }
  const along = clamp(proj + 10, 0, L);
  const ax = nf.x + lx + ex * along, az = nf.z + lz + ez * along;
  const want = Math.atan2(ax - p.x, -(az - p.z));
  const diff = wrap(want - v.heading);
  const speed = forwardSpeed(v);
  // Velocidade: cruzeiro na reta, devagar chegando a um cruzamento onde vai virar.
  const nn = nav.nodes[b.next];
  const turn = Math.abs(wrap(Math.atan2(nn.x - nt.x, -(nn.z - nt.z)) - Math.atan2(ex, -ez)));
  const target = (L - proj < 26 && turn > 0.3) || Math.abs(diff) > 0.6 ? 8 : 34 * C.botCruise;
  let input: CarInput = {
    steer: clamp(diff * 2.2, -1, 1),
    throttle: speed < target ? 1 : 0,
    brake: speed > target + 3 ? 0.7 : 0,
    handbrake: false,
  };
  // Empacou: dá ré virando para o outro lado.
  if (b.reverseT > 0) {
    b.reverseT -= dt;
    input = { steer: -input.steer, throttle: 0, brake: 1, handbrake: false };
  } else {
    b.stuckT = Math.abs(speed) < 1.5 ? b.stuckT + dt : Math.max(0, b.stuckT - dt);
    if (b.stuckT > 1.2) { b.stuckT = 0; b.reverseT = 0.9; }
  }

  // Tiro: só vendo o jogador e no alcance, com erro de mira.
  let fire = false, aim: Vec3 | null = null;
  if (b.sees && enemy && dist < C.botFireM) {
    const e = Math.tan(C.botAimErrorDeg * DEG) * dist;
    aim = v3(enemy.pos.x + (nextRandom(rng) * 2 - 1) * e, enemy.pos.y + 0.8 + (nextRandom(rng) * 2 - 1) * e * 0.5, enemy.pos.z + (nextRandom(rng) * 2 - 1) * e);
    fire = true;
  }
  return { input, fire, aim };
}
