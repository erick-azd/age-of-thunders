import { MeshBuilder, type RGB, type V, hexToRgb } from './mesh-builder';

/**
 * Carcaças como listas de peças (M0.5, ADR 0008; nomes na M1.2, ADR 0012). Cada peça é um
 * primitivo unitário (caixa ou cilindro) com posição, rotação, tamanho, três cores [topo, base,
 * lado], brilho e um **nome** de papel ("frente", "lateral-e", "comando"…). Na transformação, peças
 * de mesmo nome viram uma na outra (a frente do carro vira a frente da moto); as sem nome casam
 * por tipo, da frente para trás; as que sobram nascem ou se recolhem. Design próprio.
 * Espaço do veículo: chão em y = 0, frente em −Z.
 */
export interface VehiclePalette { white: string; armor: string; accent: string; frame: string; dark: string; glow: string }
export type PieceKind = 'box' | 'cyl';
export interface Piece { kind: PieceKind; pos: V; rot: V; size: V; colors: [RGB, RGB, RGB]; glow: number; name?: string }
export interface Wheel { pos: V; radius: number; width: number }
/** `wheels` tem sempre 4 entradas (raio 0 = sem roda); `turret` é onde a torre do canhão encaixa. */
export interface VehicleShape { pieces: Piece[]; wheels: Wheel[]; steerWheels: number; seat: V; turret: V }

type C = RGB | [RGB, RGB, RGB];
const tri = (c: C): [RGB, RGB, RGB] => (Array.isArray(c[0]) ? (c as [RGB, RGB, RGB]) : [c as RGB, c as RGB, c as RGB]);

function maker(list: Piece[]) {
  return {
    box: (name: string | undefined, x: number, y: number, z: number, w: number, h: number, d: number, c: C, rx = 0, rz = 0, glow = 0) =>
      list.push({ kind: 'box', pos: [x, y, z], rot: [rx, 0, rz], size: [w, h, d], colors: tri(c), glow, name }),
    cyl: (name: string | undefined, x: number, y: number, z: number, diam: number, h: number, c: C, rx = 0, rz = 0) =>
      list.push({ kind: 'cyl', pos: [x, y, z], rot: [rx, 0, rz], size: [diam, h, diam], colors: tri(c), glow: 0, name }),
  };
}
const side = (s: number) => (s < 0 ? 'e' : 'd');

export function buildCarShape(pal: VehiclePalette): VehicleShape {
  const W = hexToRgb(pal.white), A = hexToRgb(pal.armor), O = hexToRgb(pal.accent), F = hexToRgb(pal.frame), K = hexToRgb(pal.dark), G = hexToRgb(pal.glow);
  const WH = hexToRgb('#f4f7ff'), RD = hexToRgb('#ff3b30');
  const P: Piece[] = [], { box, cyl } = maker(P);
  box('chassi', 0, 0.42, 0.1, 1.5, 0.22, 3.6, [F, K, F]);
  box('frente', 0, 0.62, -1.45, 1.55, 0.3, 1.1, [W, K, W], 0.18); // bico em cunha
  box('para-choque', 0, 0.5, -2.0, 1.7, 0.2, 0.25, [A, K, A]);
  box('capo', 0, 0.78, -0.95, 1.2, 0.18, 0.5, [A, K, A], -0.25);
  for (const s of [-1, 1]) {
    const k = side(s);
    box(`lateral-${k}`, 0.72 * s, 0.68, 0.15, 0.36, 0.44, 2.3, [A, K, A]); // pontões
    box(`faixa-${k}`, 0.91 * s, 0.7, 0.15, 0.03, 0.1, 1.9, O);
    box(`paralama-f${k}`, 0.98 * s, 0.98, -1.3, 0.42, 0.08, 1.0, [W, K, W]);
    box(`paralama-t${k}`, 0.98 * s, 0.98, 1.3, 0.42, 0.08, 1.0, [W, K, W]);
    box(`coluna-${k}`, 0.5 * s, 1.35, 0.95, 0.1, 1.0, 0.1, K); // santantônio
    box(`suporte-${k}`, 0.55 * s, 1.25, 1.85, 0.08, 0.5, 0.25, K); // aerofólio
    cyl(`escape-${k}`, 0.3 * s, 0.85, 2.1, 0.16, 0.2, F, Math.PI / 2);
    box(`farol-${k}`, 0.55 * s, 0.62, -2.13, 0.3, 0.1, 0.02, WH, 0, 0, 1);
    box(`lanterna-${k}`, 0.45 * s, 0.85, 1.96, 0.25, 0.08, 0.02, RD, 0, 0, 1);
    box(`luz-${k}`, 0.91 * s, 0.86, 0.15, 0.02, 0.04, 1.6, G, 0, 0, 1);
  }
  box('encosto', 0, 0.95, 0.75, 0.9, 0.9, 0.16, [F, K, F], -0.15);
  box('banco', 0, 0.55, 0.25, 0.8, 0.12, 0.9, F);
  box('arco', 0, 1.85, 0.95, 1.1, 0.1, 0.12, [W, K, W]); // barra do santantônio
  box('painel', 0, 0.98, -0.45, 1.0, 0.22, 0.2, K);
  box('comando', 0, 1.13, -0.28, 0.38, 0.05, 0.05, K, 0.5); // volante
  box('motor', 0, 0.8, 1.55, 1.3, 0.5, 0.8, [F, K, F]);
  box('traseira', 0, 1.5, 1.9, 1.9, 0.08, 0.5, [O, K, O]); // aerofólio
  const r = 0.42;
  return {
    pieces: P,
    wheels: [[-0.98, -1.3], [0.98, -1.3], [-0.98, 1.3], [0.98, 1.3]].map(([x, z]) => ({ pos: [x, r, z] as V, radius: r, width: 0.34 })),
    steerWheels: 2,
    seat: [0, 0.61, 0.3],
    turret: [0, 1.92, 0.95],
  };
}

export function buildBikeShape(pal: VehiclePalette): VehicleShape {
  const W = hexToRgb(pal.white), A = hexToRgb(pal.armor), O = hexToRgb(pal.accent), F = hexToRgb(pal.frame), K = hexToRgb(pal.dark), G = hexToRgb(pal.glow);
  const WH = hexToRgb('#f4f7ff'), RD = hexToRgb('#ff3b30');
  const P: Piece[] = [], { box, cyl } = maker(P);
  box('chassi', 0, 0.55, 0.05, 0.22, 0.36, 1.0, [F, K, F], -0.15); // quadro
  box('motor', 0, 0.45, 0.05, 0.34, 0.3, 0.5, [K, K, F]);
  for (const s of [-1, 1]) {
    const k = side(s);
    box(`coluna-${k}`, 0.11 * s, 0.62, -0.62, 0.05, 0.62, 0.05, F, 0.4); // garfo
    box(`suporte-${k}`, 0.12 * s, 0.4, 0.5, 0.04, 0.06, 0.55, F, -0.15); // balança
    box(`lateral-${k}`, 0.2 * s, 0.66, -0.4, 0.05, 0.38, 0.62, [A, K, A], 0, 0.12 * s);
    box(`faixa-${k}`, 0.185 * s, 0.9, -0.2, 0.01, 0.06, 0.46, O);
    box(`manopla-${k}`, 0.34 * s, 1.2, -0.66, 0.06, 0.05, 0.12, F);
    box(`pedaleira-${k}`, 0.22 * s, 0.42, 0.2, 0.14, 0.03, 0.06, F);
    box(`luz-${k}`, 0.226 * s, 0.7, -0.4, 0.012, 0.03, 0.5, G, 0, 0.12 * s, 1);
  }
  box('frente', 0, 0.82, -0.62, 0.42, 0.34, 0.42, [W, K, W], 0.5); // carenagem
  box('capo', 0, 1.0, -0.72, 0.3, 0.2, 0.06, A, 0.75); // bolha
  box('painel', 0, 0.9, -0.2, 0.36, 0.2, 0.5, [A, K, A]); // tanque
  box('banco', 0, 0.82, 0.22, 0.28, 0.08, 0.5, K);
  box('traseira', 0, 0.88, 0.6, 0.24, 0.14, 0.4, [W, K, W], -0.2); // rabeta
  box('comando', 0, 1.2, -0.66, 0.72, 0.04, 0.04, K); // guidão
  box('arco', 0, 1.08, -0.66, 0.05, 0.22, 0.05, F); // coluna do guidão
  box('paralama-fe', 0, 0.72, -0.78, 0.18, 0.04, 0.42, [W, K, W], 0.3);
  cyl('escape-d', 0.2, 0.461, 0.822, 0.12, 0.55, F, Math.PI / 2 - 0.15);
  box('farol-e', 0, 0.86, -0.86, 0.2, 0.08, 0.02, WH, 0.5, 0, 1);
  box('lanterna-e', 0, 0.9, 0.81, 0.16, 0.05, 0.02, RD, -0.2, 0, 1);
  const r = 0.34;
  return {
    pieces: P,
    // Quatro "rodas" para casar com as do carro: as duas da frente (e as duas de trás) se juntam numa só.
    wheels: [-0.78, -0.78, 0.78, 0.78].map((z) => ({ pos: [0, r, z] as V, radius: r, width: 0.16 })),
    steerWheels: 2,
    seat: [0, 0.86, 0.2],
    turret: [0, 1.05, 0.66],
  };
}

// ---- transformação ----

export interface PiecePair { a: Piece; b: Piece; spin: number }

/** Recolhe uma peça sem par: tamanho zero, puxada para perto do centro. */
const collapsed = (p: Piece): Piece => ({ ...p, pos: [p.pos[0] * 0.3, Math.max(0.6, p.pos[1]), p.pos[2] * 0.3], size: [0, 0, 0] });

/**
 * Casa as peças de duas formas: primeiro pelo nome (a mesma peça de papel vira a outra), depois
 * as que sobram por tipo e brilho, na ordem da frente para trás. Sobra de um lado vira peça que se
 * recolhe ou que nasce do nada.
 */
export function pairPieces(from: Piece[], to: Piece[]): PiecePair[] {
  const out: PiecePair[] = [];
  const spin = () => (out.length % 3 === 0 ? 1 : out.length % 3 === 1 ? -1 : 0);
  const restA: Piece[] = [], usedB = new Set<Piece>();
  for (const a of from) {
    const b = a.name ? to.find((x) => x.name === a.name && x.kind === a.kind && !usedB.has(x)) : undefined;
    if (b) { usedB.add(b); out.push({ a, b, spin: spin() }); } else restA.push(a);
  }
  const restB = to.filter((x) => !usedB.has(x));
  const key = (p: Piece) => `${p.kind}:${p.glow}`;
  const groups = new Map<string, [Piece[], Piece[]]>();
  for (const p of restA) { if (!groups.has(key(p))) groups.set(key(p), [[], []]); groups.get(key(p))![0].push(p); }
  for (const p of restB) { if (!groups.has(key(p))) groups.set(key(p), [[], []]); groups.get(key(p))![1].push(p); }
  const order = (l: Piece[]) => [...l].sort((u, v) => u.pos[2] - v.pos[2] || u.pos[0] - v.pos[0] || u.pos[1] - v.pos[1]);
  for (const [, [fa, tb]] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const A = order(fa), B = order(tb), n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) out.push({ a: A[i] ?? collapsed(B[i]), b: B[i] ?? collapsed(A[i]), spin: spin() });
  }
  return out;
}

/** Suavização da transformação (começa e termina devagar). */
export const ease = (t: number): number => t * t * (3 - 2 * t);

/** Peça no meio da transformação: desliza num arco, gira meia volta em Y e muda de tamanho e cor. */
export function morphPiece(pr: PiecePair, t: number): Piece {
  const e = ease(Math.min(1, Math.max(0, t))), arc = Math.sin(Math.PI * e);
  const L = (u: number, v: number) => u + (v - u) * e;
  const { a, b } = pr;
  return {
    kind: a.kind,
    pos: [L(a.pos[0], b.pos[0]) * (1 + 0.25 * arc), L(a.pos[1], b.pos[1]) + 0.35 * arc, L(a.pos[2], b.pos[2])],
    rot: [L(a.rot[0], b.rot[0]), pr.spin * Math.PI * arc * 0.5, L(a.rot[2], b.rot[2])],
    size: [L(a.size[0], b.size[0]), L(a.size[1], b.size[1]), L(a.size[2], b.size[2])],
    colors: [0, 1, 2].map((k) => [0, 1, 2].map((c) => L(a.colors[k][c], b.colors[k][c]))) as [RGB, RGB, RGB],
    glow: L(a.glow, b.glow),
  };
}

export function morphWheel(a: Wheel, b: Wheel, t: number): Wheel {
  const e = ease(Math.min(1, Math.max(0, t))), L = (u: number, v: number) => u + (v - u) * e;
  return { pos: [L(a.pos[0], b.pos[0]), L(a.pos[1], b.pos[1]), L(a.pos[2], b.pos[2])], radius: L(a.radius, b.radius), width: L(a.width, b.width) };
}

// ---- geometria unitária ----

/** Geometria unitária com "fendas" de cor: cada vértice diz qual das 3 cores usa e com que sombra. */
export interface UnitGeometry { positions: number[]; slot: number[]; shade: number[] }

function unit(draw: (b: MeshBuilder) => void): UnitGeometry {
  const b = new MeshBuilder();
  draw(b);
  const m = b.build(), slot: number[] = [], shade: number[] = [];
  for (let i = 0; i < m.colors.length; i += 3) {
    const c = [m.colors[i], m.colors[i + 1], m.colors[i + 2]];
    const k = c[0] >= c[1] && c[0] >= c[2] ? 0 : c[1] >= c[2] ? 1 : 2;
    slot.push(k);
    shade.push(c[k]);
  }
  return { positions: m.positions, slot, shade };
}
const MARK: [RGB, RGB, RGB] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Caixa 1 × 1 × 1 centrada. */
export const UNIT_BOX = unit((b) => b.box(1, 1, 1, MARK));
/** Cilindro de diâmetro 1 e altura 1 (eixo Y), centrado. Tampa usa a cor 0, lado a cor 2. */
export const UNIT_CYL = unit((b) => b.push().translate(0, -0.5, 0).cylinder(0.5, 0.5, 1, 8, MARK[2], MARK[0]).pop());
/** Roda de raio 1 e largura 1 (eixo X): pneu (cor 0) e cubo (cor 1). */
export const UNIT_WHEEL = unit((b) => {
  b.push().rotateZ(Math.PI / 2).translate(0, -0.5, 0).cylinder(1, 1, 1, 12, MARK[0], MARK[0]).pop();
  b.push().rotateZ(Math.PI / 2).translate(0, -0.53, 0).cylinder(0.42, 0.42, 1.06, 6, MARK[1], MARK[1]).pop();
});
