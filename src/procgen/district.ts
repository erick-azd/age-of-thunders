import { z } from 'zod';
import { mulberry32 } from '../core/rng';
import { clamp, type Vec3 } from '../sim/math';
import { VOXEL, VoxelGrid } from '../sim/voxels';
import { type RGB, hexToRgb } from './mesh-builder';

/**
 * Cidade industrial-militar em voxels (M0.1, ADR 0002 e 0003), pura e determinística.
 * - Centro: torres de concreto escalonadas, gêmeas com passarela, coroas, antenas e helipontos.
 * - Periferia: galpões com telhado em serra, pátios de contêineres com pórtico, tanques e chaminés,
 *   data centers blindados; lotes cercados com piso de concreto.
 * - Vias elevadas com rampas e pilares; postes e faixas de luz (materiais com brilho).
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const DistrictSchema = z.object({
  id: z.string(),
  name: z.string(),
  seed: z.number().int(),
  sizeM: z.number().int().min(32).max(1024).refine((n) => n % 16 === 0, 'sizeM deve ser múltiplo de 16'),
  heightM: z.number().int().min(16).max(160).refine((n) => n % 16 === 0, 'heightM deve ser múltiplo de 16'),
  blockPitchM: z.number().min(24).max(256),
  streetM: z.number().min(4).max(30),
  sidewalkM: z.number().min(0.5).max(8),
  floorM: z.number().min(2).max(6),
  floorsMin: z.number().int().min(1).max(40),
  floorsMax: z.number().int().min(1).max(40),
  towerFloors: z.number().int().min(0).max(60),
  /** Centro de torres: meia-largura (m, distância no eixo). Fora dele, a periferia industrial. */
  coreHalfM: z.number().min(0).max(512).default(128),
  /** A cada quantos andares a fachada ganha uma faixa de luz (0 desliga). */
  glowEvery: z.number().int().min(0).max(20).default(5),
  helipadChance: z.number().min(0).max(1).default(0.35),
  /** Altura do tabuleiro das duas vias elevadas (a segunda passa 4 m acima da primeira). */
  viaductM: z.number().min(0).max(30).default(8),
  palette: z.object({
    asphalt: Hex, lane: Hex, sidewalk: Hex, roof: Hex, trim: Hex, glass: Hex, antenna: Hex,
    ground: Hex, metal: Hex, hazard: Hex, hazardDark: Hex, helipad: Hex, pillar: Hex, door: Hex,
    walls: z.array(Hex).min(1).max(16),
    containers: z.array(Hex).min(1).max(8),
    glows: z.array(Hex).length(4),
  }),
});
export type DistrictDef = z.infer<typeof DistrictSchema>;

/** Specs do editor F1. Mudar qualquer uma regenera a cidade. */
export const DISTRICT_SPECS = [
  { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1 },
  { key: 'floorsMin', label: 'Andares mínimos', min: 1, max: 20, step: 1 },
  { key: 'floorsMax', label: 'Andares máximos', min: 1, max: 30, step: 1 },
  { key: 'towerFloors', label: 'Andares da torre central', min: 0, max: 30, step: 1 },
  { key: 'coreHalfM', label: 'Raio do centro (torres)', min: 0, max: 192, step: 32, unit: 'm' },
  { key: 'glowEvery', label: 'Faixa de luz a cada', min: 0, max: 10, step: 1, unit: 'andares' },
  { key: 'helipadChance', label: 'Helipontos', min: 0, max: 1, step: 0.05 },
  { key: 'viaductM', label: 'Altura da via elevada', min: 0, max: 16, step: 1, unit: 'm' },
  { key: 'blockPitchM', label: 'Quarteirão + rua', min: 32, max: 128, step: 8, unit: 'm' },
  { key: 'streetM', label: 'Largura da rua', min: 6, max: 16, step: 1, unit: 'm' },
  { key: 'sidewalkM', label: 'Calçada', min: 1, max: 6, step: 0.5, unit: 'm' },
] as const;

/** Materiais (o valor do voxel). GLOW0..3: ciano, âmbar, vermelho, branco (brilham). */
export const MAT = {
  ASPHALT: 1, LANE: 2, SIDEWALK: 3, ROOF: 4, TRIM: 5, GLASS: 6, ANTENNA: 7, GROUND: 8, METAL: 9,
  HAZARD: 10, HAZARD_DARK: 11, HELIPAD: 12, PILLAR: 13, DOOR: 14,
  GLOW0: 16, GLOW_CYAN: 16, GLOW_AMBER: 17, GLOW_RED: 18, GLOW_WHITE: 19,
  CONTAINER0: 20, WALL0: 32,
} as const;

/** Cor de cada material, indexada pelo valor do voxel. */
export function materialColors(def: DistrictDef): RGB[] {
  const P = def.palette, out: RGB[] = [];
  for (let i = 0; i < MAT.WALL0 + P.walls.length; i++) out[i] = [1, 0, 1];
  const set = (i: number, hex: string) => { out[i] = hexToRgb(hex); };
  set(MAT.ASPHALT, P.asphalt); set(MAT.LANE, P.lane); set(MAT.SIDEWALK, P.sidewalk); set(MAT.ROOF, P.roof);
  set(MAT.TRIM, P.trim); set(MAT.GLASS, P.glass); set(MAT.ANTENNA, P.antenna); set(MAT.GROUND, P.ground);
  set(MAT.METAL, P.metal); set(MAT.HAZARD, P.hazard); set(MAT.HAZARD_DARK, P.hazardDark); set(MAT.HELIPAD, P.helipad);
  set(MAT.PILLAR, P.pillar); set(MAT.DOOR, P.door);
  P.glows.forEach((c, i) => set(MAT.GLOW0 + i, c));
  P.containers.slice(0, MAT.WALL0 - MAT.CONTAINER0).forEach((c, i) => set(MAT.CONTAINER0 + i, c));
  P.walls.forEach((c, i) => set(MAT.WALL0 + i, c));
  return out;
}

/** Brilho de cada material (0 ou 1): as faixas de luz acendem mesmo na sombra. */
export function materialGlow(def: DistrictDef): number[] {
  const out = materialColors(def).map(() => 0);
  for (let i = 0; i < 4; i++) out[MAT.GLOW0 + i] = 1;
  return out;
}

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Building extends Rect { floors: number; tower: boolean; kind: 'slab' | 'tiered' | 'twin' | 'landmark' }
export type SiteKind = 'warehouse' | 'containers' | 'tanks' | 'datacenter';
export interface Site extends Rect { kind: SiteKind }
/** Via elevada: corre ao longo de `axis` sobre a linha de rua `line`; tabuleiro com topo em `deckTop` (voxels). */
export interface Viaduct { axis: 'x' | 'z'; line: number; deckTop: number; rampLen: number; halfWidth: number }
export interface District { grid: VoxelGrid; buildings: Building[]; sites: Site[]; viaducts: Viaduct[]; def: DistrictDef }

/** Camadas (em voxels): asfalto em y 0–1, calçada e base dos lotes em y 2, estruturas a partir de y 3. */
export const GROUND_TOP = 2;
const BUILD_Y = 3;

/** Gera a cidade com o canto mínimo em `origin` (metros). */
export function generateDistrict(def: DistrictDef, origin: Vec3): District {
  const V = 1 / VOXEL;
  const N = def.sizeM * V, H = def.heightM * V;
  const g = new VoxelGrid(N, H, N, origin);
  const rnd = mulberry32(def.seed);
  const irnd = mulberry32(def.seed ^ 0x51ed27);
  const ri = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const P = Math.round(def.blockPitchM * V);
  const hs = Math.round((def.streetM * V) / 2);
  const walk = Math.round(def.sidewalkM * V);
  const F = Math.max(4, Math.round(def.floorM * V));
  const floorsMax = Math.max(def.floorsMin, def.floorsMax);
  const coreHalf = def.coreHalfM * V;
  const buildings: Building[] = [];
  const sites: Site[] = [];
  const viaducts: Viaduct[] = [];
  const set = (x: number, y: number, z: number, m: number) => g.set(x, y, z, m);
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number) => g.fill(x0, y0, z0, x1, y1, z1, m);

  fill(0, 0, 0, N, GROUND_TOP, N, MAT.ASPHALT);

  const lines: number[] = [];
  for (let l = 0; l < N; l += P) lines.push(l);
  lines.push(N);
  const nb = lines.length - 1;
  const nearLine = (t: number) => lines.some((l) => Math.abs(t - l) < hs);

  // Faixa tracejada no centro das ruas internas.
  for (const l of lines.slice(1, -1)) {
    for (let t = 0; t < N; t++) {
      if (t % 8 >= 4 || nearLine(t)) continue;
      set(l, GROUND_TOP - 1, t, MAT.LANE);
      set(t, GROUND_TOP - 1, l, MAT.LANE);
    }
  }

  const towerBlock = Math.floor((nb - 1) / 2);
  for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
    const x0 = lines[bi] + hs, x1 = lines[bi + 1] - hs, z0 = lines[bj] + hs, z1 = lines[bj + 1] - hs;
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    fill(x0, GROUND_TOP, z0, x1, GROUND_TOP + 1, z1, MAT.SIDEWALK);
    // Meio-fio com marcação de perigo e postes de luz a cada 12 m.
    for (let x = x0; x < x1; x++) for (const z of [z0, z1 - 1]) if ((x >> 1) % 2 === 0) set(x, GROUND_TOP, z, MAT.HAZARD);
    for (let z = z0; z < z1; z++) for (const x of [x0, x1 - 1]) if ((z >> 1) % 2 === 0) set(x, GROUND_TOP, z, MAT.HAZARD);
    for (let x = x0 + 4; x < x1 - 4; x += 24) { lamp(x, z0 + 2); lamp(x, z1 - 3); }
    for (let z = z0 + 16; z < z1 - 16; z += 24) { lamp(x0 + 2, z); lamp(x1 - 3, z); }
    const lot: Rect = { x0: x0 + walk, z0: z0 + walk, x1: x1 - walk, z1: z1 - walk };
    if (lot.x1 - lot.x0 < 12 || lot.z1 - lot.z0 < 12) continue;
    if (def.towerFloors > 0 && bi === towerBlock && bj === towerBlock) { landmark(lot); continue; }
    const cheb = Math.max(Math.abs((x0 + x1) / 2 - N / 2), Math.abs((z0 + z1) / 2 - N / 2));
    if (cheb < coreHalf) split(lot.x0, lot.z0, lot.x1, lot.z1, 0);
    else industrial(lot);
  }

  // Vias elevadas: uma ao longo de x e outra ao longo de z, cruzando em alturas diferentes.
  if (def.viaductM > 0 && nb >= 3) {
    viaduct('x', lines[1], Math.round(def.viaductM * V));
    viaduct('z', lines[nb - 1], Math.round((def.viaductM + 4) * V));
  }
  return { grid: g, buildings, sites, viaducts, def };

  // ---------------------------------------------------------------- centro

  function split(x0: number, z0: number, x1: number, z1: number, depth: number): void {
    const w = x1 - x0, d = z1 - z0, gap = 4;
    if (depth < 2 && Math.max(w, d) >= 40 && rnd() < (depth === 0 ? 0.85 : 0.45)) {
      const alongX = w >= d;
      const cut = Math.round((alongX ? w : d) * (0.4 + rnd() * 0.2));
      if (alongX) { split(x0, z0, x0 + cut - gap / 2, z1, depth + 1); split(x0 + cut + gap / 2, z0, x1, z1, depth + 1); }
      else { split(x0, z0, x1, z0 + cut - gap / 2, depth + 1); split(x0, z0 + cut + gap / 2, x1, z1, depth + 1); }
      return;
    }
    const inset = ri(rnd, 0, 2);
    const r: Rect = { x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset };
    const w2 = r.x1 - r.x0, d2 = r.z1 - r.z0;
    if (w2 < 14 || d2 < 14) return;
    const c = 1 - Math.min(1, Math.hypot((r.x0 + r.x1) / 2 - N / 2, (r.z0 + r.z1) / 2 - N / 2) / Math.max(1, coreHalf * 1.2));
    const t = clamp(rnd() * 0.6 + c * 0.6, 0, 1);
    const maxFit = Math.floor((H - BUILD_Y - 30) / F);
    const floors = Math.min(def.floorsMin + Math.round((floorsMax - def.floorsMin) * t), maxFit);
    const wall = MAT.WALL0 + Math.floor(rnd() * def.palette.walls.length);
    const roll = rnd();
    if (roll < 0.25 && Math.max(w2, d2) >= 40) {
      // Torres gêmeas com passarela envidraçada.
      const alongX = w2 >= d2, len = alongX ? w2 : d2, tw = Math.floor(len * 0.38);
      const a: Rect = alongX ? { ...r, x1: r.x0 + tw } : { ...r, z1: r.z0 + tw };
      const b: Rect = alongX ? { ...r, x0: r.x1 - tw } : { ...r, z0: r.z1 - tw };
      const fb = Math.max(def.floorsMin, floors - ri(rnd, 0, 3));
      const ta = tiered(a, floors, 2, wall, false), tb = tiered(b, fb, 2, wall, false);
      rooftop(ta.top, ta.y, rnd() < def.helipadChance);
      rooftop(tb.top, tb.y, false);
      const by = BUILD_Y + Math.floor(Math.min(floors, fb) * 0.6) * F;
      const mid = alongX ? (r.z0 + r.z1) >> 1 : (r.x0 + r.x1) >> 1;
      const br: Rect = alongX ? { x0: a.x1, x1: b.x0, z0: mid - 3, z1: mid + 3 } : { z0: a.z1, z1: b.z0, x0: mid - 3, x1: mid + 3 };
      fill(br.x0, by, br.z0, br.x1, by + 1, br.z1, MAT.TRIM);
      fill(br.x0, by + 1, br.z0, br.x1, by + 5, br.z1, MAT.GLASS);
      fill(br.x0, by + 5, br.z0, br.x1, by + 6, br.z1, MAT.GLOW_CYAN);
      buildings.push({ ...a, floors, tower: false, kind: 'twin' }, { ...b, floors: fb, tower: false, kind: 'twin' });
      return;
    }
    const tiers = roll < 0.65 ? ri(rnd, 2, 3) : 1;
    const res = tiered(r, floors, tiers, wall, false);
    rooftop(res.top, res.y, rnd() < def.helipadChance);
    buildings.push({ ...r, floors, tower: false, kind: tiers > 1 ? 'tiered' : 'slab' });
  }

  /** Marco central: torre de 3 andares de recuo, quinas de luz, coroa e mastro com luzes vermelhas. */
  function landmark(lot: Rect): void {
    // Praça com faixas de perigo.
    fill(lot.x0, GROUND_TOP, lot.z0, lot.x1, GROUND_TOP + 1, lot.z1, MAT.GROUND);
    const side = Math.min(56, lot.x1 - lot.x0 - 8, lot.z1 - lot.z0 - 8);
    const cx = (lot.x0 + lot.x1) >> 1, cz = (lot.z0 + lot.z1) >> 1, h0 = side >> 1;
    const r: Rect = { x0: cx - h0, z0: cz - h0, x1: cx - h0 + side, z1: cz - h0 + side };
    const floors = Math.min(def.towerFloors, Math.floor((H - BUILD_Y - 40) / F));
    const res = tiered(r, floors, 3, MAT.WALL0, true);
    // Coroa: anel de luz e mastro.
    const t = res.top, y = res.y;
    for (let x = t.x0; x < t.x1; x++) { set(x, y + 1, t.z0, MAT.GLOW_CYAN); set(x, y + 1, t.z1 - 1, MAT.GLOW_CYAN); }
    for (let z = t.z0; z < t.z1; z++) { set(t.x0, y + 1, z, MAT.GLOW_CYAN); set(t.x1 - 1, y + 1, z, MAT.GLOW_CYAN); }
    const mx = (t.x0 + t.x1) >> 1, mz = (t.z0 + t.z1) >> 1;
    fill(mx - 2, y + 1, mz - 2, mx + 2, y + 6, mz + 2, MAT.METAL);
    fill(mx - 1, y + 6, mz - 1, mx + 1, y + 30, mz + 1, MAT.ANTENNA);
    for (let k = y + 10; k < y + 30; k += 6) fill(mx - 1, k, mz - 1, mx + 1, k + 1, mz + 1, MAT.GLOW_RED);
    fill(mx - 1, y + 30, mz - 1, mx + 1, y + 32, mz + 1, MAT.GLOW_RED);
    buildings.push({ ...r, floors, tower: true, kind: 'landmark' });
  }

  /** Prédio em recuos: cada camada é uma caixa oca menor que a de baixo; devolve o topo. */
  function tiered(r: Rect, floors: number, tiers: number, wall: number, landmarkStyle: boolean): { top: Rect; y: number } {
    const shares = tiers === 1 ? [1] : tiers === 2 ? [0.62, 0.38] : [0.5, 0.3, 0.2];
    let yb = BUILD_Y, cur = { ...r }, left = floors;
    const step = clamp(Math.round(Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.14), 3, 7);
    for (let t = 0; t < shares.length; t++) {
      const tf = t === shares.length - 1 ? left : Math.max(1, Math.round(floors * shares[t]));
      left -= tf;
      if (tf <= 0) break;
      const roof = shell(cur, yb, tf, wall, landmarkStyle, t === 0);
      const next = { x0: cur.x0 + step, z0: cur.z0 + step, x1: cur.x1 - step, z1: cur.z1 - step };
      if (t === shares.length - 1 || left <= 0 || next.x1 - next.x0 < 10 || next.z1 - next.z0 < 10) {
        parapet(cur, roof + 1, MAT.TRIM);
        return { top: cur, y: roof };
      }
      parapet(cur, roof + 1, MAT.HAZARD);
      yb = roof + 1;
      cur = next;
    }
    return { top: cur, y: yb - 1 };
  }

  /** Caixa oca de `floors` andares a partir de yb, com fachada e lajes; devolve o y do telhado. */
  function shell(r: Rect, yb: number, floors: number, wall: number, landmarkStyle: boolean, ground: boolean): number {
    const top = yb + floors * F;
    const facade = (p: number, len: number, y: number): number => {
      const fy = (y - yb) % F, floor = Math.floor((y - yb) / F);
      if (p <= 1 || p >= len - 2) return landmarkStyle ? MAT.GLOW_CYAN : MAT.TRIM; // quinas
      if (fy === 0) return def.glowEvery > 0 && floor > 0 && floor % def.glowEvery === 0 ? MAT.GLOW_CYAN : MAT.TRIM;
      if (ground && floor === 0) {
        if (fy === 1) return (p >> 1) % 2 === 0 ? MAT.HAZARD : MAT.HAZARD_DARK;
        if (fy <= F - 2 && p % 12 >= 4 && p % 12 <= 7) return MAT.DOOR;
        return wall;
      }
      if (landmarkStyle) return fy >= 1 && p % 4 !== 0 ? MAT.GLASS : wall;
      return fy >= 2 && fy <= 3 && p % 6 !== 0 ? MAT.GLASS : wall; // janelas em fita
    };
    const wx = r.x1 - r.x0, wz = r.z1 - r.z0;
    for (let y = yb; y < top; y++) {
      for (let x = r.x0; x < r.x1; x++) { const m = facade(x - r.x0, wx, y); set(x, y, r.z0, m); set(x, y, r.z1 - 1, m); }
      for (let z = r.z0 + 1; z < r.z1 - 1; z++) { const m = facade(z - r.z0, wz, y); set(r.x0, y, z, m); set(r.x1 - 1, y, z, m); }
    }
    for (let k = 1; k < floors; k++) fill(r.x0 + 1, yb + k * F, r.z0 + 1, r.x1 - 1, yb + k * F + 1, r.z1 - 1, MAT.TRIM);
    fill(r.x0, top, r.z0, r.x1, top + 1, r.z1, MAT.ROOF);
    return top;
  }

  function parapet(r: Rect, y: number, m: number): void {
    for (let x = r.x0; x < r.x1; x++) { set(x, y, r.z0, m); set(x, y, r.z1 - 1, m); }
    for (let z = r.z0; z < r.z1; z++) { set(r.x0, y, z, m); set(r.x1 - 1, y, z, m); }
  }

  /** Telhado: heliponto (se couber e sortear) ou antenas, prato e máquinas. */
  function rooftop(r: Rect, y: number, helipad: boolean): void {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
    if (helipad && w >= 24 && d >= 24) {
      const s = 10;
      fill(cx - s, y + 1, cz - s, cx + s, y + 2, cz + s, MAT.ROOF);
      for (let x = cx - s; x < cx + s; x++) for (const z of [cz - s, cz + s - 1]) set(x, y + 1, z, (x >> 1) % 2 ? MAT.HAZARD : MAT.HAZARD_DARK);
      for (let z = cz - s; z < cz + s; z++) for (const x of [cx - s, cx + s - 1]) set(x, y + 1, z, (z >> 1) % 2 ? MAT.HAZARD : MAT.HAZARD_DARK);
      // "H"
      fill(cx - 4, y + 1, cz - 5, cx - 2, y + 2, cz + 5, MAT.HELIPAD);
      fill(cx + 2, y + 1, cz - 5, cx + 4, y + 2, cz + 5, MAT.HELIPAD);
      fill(cx - 2, y + 1, cz - 1, cx + 2, y + 2, cz + 1, MAT.HELIPAD);
      for (const [x, z] of [[cx - s, cz - s], [cx + s - 1, cz - s], [cx - s, cz + s - 1], [cx + s - 1, cz + s - 1]]) set(x, y + 2, z, MAT.GLOW_AMBER);
      return;
    }
    const masts = ri(rnd, 1, 3);
    for (let k = 0; k < masts; k++) {
      const mx = r.x0 + 2 + Math.floor(rnd() * Math.max(1, w - 4)), mz = r.z0 + 2 + Math.floor(rnd() * Math.max(1, d - 4));
      const h = ri(rnd, 6, 20);
      fill(mx, y + 1, mz, mx + 1, y + 1 + h, mz + 1, MAT.TRIM);
      set(mx, y + 1 + h, mz, MAT.GLOW_RED);
      if (k === 0 && w >= 16 && d >= 16) fill(mx - 2, y + h - 2, mz - 2, mx + 3, y + h - 1, mz + 3, MAT.METAL); // prato
    }
    if (w >= 14 && d >= 14) {
      const bw = ri(rnd, 4, 8), bd = ri(rnd, 4, 8);
      const bx = r.x0 + 3 + Math.floor(rnd() * Math.max(1, w - 6 - bw)), bz = r.z0 + 3 + Math.floor(rnd() * Math.max(1, d - 6 - bd));
      fill(bx, y + 1, bz, bx + bw, y + 4, bz + bd, MAT.METAL);
    }
  }

  // ---------------------------------------------------------------- periferia

  function industrial(lot: Rect): void {
    fill(lot.x0, GROUND_TOP, lot.z0, lot.x1, GROUND_TOP + 1, lot.z1, MAT.GROUND);
    // Cerca de 1 m com portões no meio de cada lado.
    const cx = (lot.x0 + lot.x1) >> 1, cz = (lot.z0 + lot.z1) >> 1, gate = 8;
    for (let x = lot.x0; x < lot.x1; x++) if (Math.abs(x - cx) >= gate) for (const z of [lot.z0, lot.z1 - 1]) fill(x, BUILD_Y, z, x + 1, BUILD_Y + 2, z + 1, MAT.METAL);
    for (let z = lot.z0; z < lot.z1; z++) if (Math.abs(z - cz) >= gate) for (const x of [lot.x0, lot.x1 - 1]) fill(x, BUILD_Y, z, x + 1, BUILD_Y + 2, z + 1, MAT.METAL);
    const inner: Rect = { x0: lot.x0 + 4, z0: lot.z0 + 4, x1: lot.x1 - 4, z1: lot.z1 - 4 };
    const roll = irnd();
    const kind: SiteKind = roll < 0.35 ? 'warehouse' : roll < 0.6 ? 'containers' : roll < 0.8 ? 'tanks' : 'datacenter';
    if (kind === 'warehouse') warehouse(inner);
    else if (kind === 'containers') containerYard(inner);
    else if (kind === 'tanks') tankFarm(inner);
    else datacenter(inner);
    sites.push({ ...lot, kind });
  }

  /** Galpão de chapa com portas de enrolar e telhado em serra (claraboias de vidro). */
  function warehouse(r: Rect): void {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, alongX = w >= d;
    const two = (alongX ? w : d) >= 70 && irnd() < 0.6;
    const sheds: Rect[] = [];
    if (two) {
      const len = alongX ? w : d, cut = Math.floor(len / 2);
      sheds.push(alongX ? { ...r, x1: r.x0 + cut - 4 } : { ...r, z1: r.z0 + cut - 4 });
      sheds.push(alongX ? { ...r, x0: r.x0 + cut + 4 } : { ...r, z0: r.z0 + cut + 4 });
    } else sheds.push({ x0: r.x0 + 4, z0: r.z0 + 6, x1: r.x1 - 4, z1: r.z1 - 10 });
    for (const s of sheds) {
      const h = ri(irnd, 14, 22), sx = s.x1 - s.x0, sz = s.z1 - s.z0;
      const wallAt = (p: number, len: number, y: number, doors: boolean): number => {
        const fy = y - BUILD_Y;
        if (p <= 1 || p >= len - 2 || fy === h - 1) return MAT.TRIM;
        if (doors && fy < 10 && p % 18 >= 5 && p % 18 <= 12) return fy === 9 || p % 18 === 5 || p % 18 === 12 ? MAT.HAZARD : MAT.DOOR;
        return p % 4 === 0 ? MAT.TRIM : MAT.METAL;
      };
      for (let y = BUILD_Y; y < BUILD_Y + h; y++) {
        for (let x = s.x0; x < s.x1; x++) { set(x, y, s.z0, wallAt(x - s.x0, sx, y, sx >= sz)); set(x, y, s.z1 - 1, wallAt(x - s.x0, sx, y, false)); }
        for (let z = s.z0 + 1; z < s.z1 - 1; z++) { set(s.x0, y, z, wallAt(z - s.z0, sz, y, sz > sx)); set(s.x1 - 1, y, z, wallAt(z - s.z0, sz, y, false)); }
      }
      const top = BUILD_Y + h;
      fill(s.x0, top, s.z0, s.x1, top + 1, s.z1, MAT.METAL);
      // Serra: dentes de 4 m ao longo do eixo comprido, face vertical de vidro.
      const longX = sx >= sz;
      const len = longX ? sx : sz;
      for (let q = 0; q < len; q++) {
        const ph = q % 8, th = ph >> 1, m = ph === 7 ? MAT.GLASS : MAT.METAL;
        if (th === 0) continue;
        if (longX) fill(s.x0 + q, top + 1, s.z0 + 1, s.x0 + q + 1, top + 1 + th, s.z1 - 1, m);
        else fill(s.x0 + 1, top + 1, s.z0 + q, s.x1 - 1, top + 1 + th, s.z0 + q + 1, m);
      }
    }
    // Alguns contêineres soltos no pátio.
    for (let k = 0; k < 3; k++) container(r.x0 + ri(irnd, 0, Math.max(0, w - 12)), r.z1 - 8, true, ri(irnd, 1, 2), BUILD_Y);
  }

  function container(x: number, z: number, alongX: boolean, stack: number, y0: number): void {
    const cw = alongX ? 12 : 5, cd = alongX ? 5 : 12;
    for (let s = 0; s < stack; s++) {
      const m = MAT.CONTAINER0 + Math.floor(irnd() * Math.min(def.palette.containers.length, MAT.WALL0 - MAT.CONTAINER0));
      const y = y0 + s * 5;
      fill(x, y, z, x + cw, y + 5, z + cd, m);
      // Nervuras nas laterais compridas.
      for (let k = 1; k < 12; k += 2) {
        if (alongX) { fill(x + k, y + 1, z, x + k + 1, y + 4, z + 1, MAT.TRIM); fill(x + k, y + 1, z + cd - 1, x + k + 1, y + 4, z + cd, MAT.TRIM); }
        else { fill(x, y + 1, z + k, x + 1, y + 4, z + k + 1, MAT.TRIM); fill(x + cw - 1, y + 1, z + k, x + cw, y + 4, z + k + 1, MAT.TRIM); }
      }
    }
  }

  /** Pátio de contêineres em pilhas de 1 a 3, com corredores e um pórtico amarelo. */
  function containerYard(r: Rect): void {
    const w = r.x1 - r.x0, alongX = irnd() < 0.5;
    const rowPitch = 5 + 6, colPitch = 12 + 2;
    if (alongX) {
      for (let z = r.z0 + 2; z + 5 <= r.z1 - 2; z += rowPitch) for (let x = r.x0 + 2; x + 12 <= r.x1 - 2; x += colPitch) if (irnd() < 0.85) container(x, z, true, ri(irnd, 1, 3), BUILD_Y);
    } else {
      for (let x = r.x0 + 2; x + 5 <= r.x1 - 2; x += rowPitch) for (let z = r.z0 + 2; z + 12 <= r.z1 - 2; z += colPitch) if (irnd() < 0.85) container(x, z, false, ri(irnd, 1, 3), BUILD_Y);
    }
    // Pórtico: duas pernas e uma viga de 15 m de altura atravessando o pátio.
    const gx = r.x0 + Math.floor(w * (0.3 + irnd() * 0.4)), hgt = 30;
    for (const z of [r.z0, r.z1 - 3]) fill(gx, BUILD_Y, z, gx + 3, BUILD_Y + hgt, z + 3, MAT.HAZARD);
    fill(gx - 1, BUILD_Y + hgt, r.z0, gx + 4, BUILD_Y + hgt + 3, r.z1, MAT.HAZARD);
    fill(gx, BUILD_Y + hgt + 3, ((r.z0 + r.z1) >> 1) - 1, gx + 3, BUILD_Y + hgt + 4, ((r.z0 + r.z1) >> 1) + 1, MAT.GLOW_AMBER);
  }

  /** Tanques cilíndricos com faixas, tubulação e chaminés listradas com luz vermelha no topo. */
  function tankFarm(r: Rect): void {
    const d = r.z1 - r.z0;
    const centers: [number, number, number][] = [];
    const rad = ri(irnd, 8, 11);
    for (let z = r.z0 + rad + 1; z + rad + 1 <= r.z1; z += rad * 2 + 4) for (let x = r.x0 + rad + 1; x + rad + 1 <= r.x1 - 10; x += rad * 2 + 4) centers.push([x, z, rad]);
    for (const [x, z, rr] of centers) {
      const h = ri(irnd, 14, 26);
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        const q = dx * dx + dz * dz;
        if (q > rr * rr) continue;
        const edge = q > (rr - 1) * (rr - 1);
        if (edge) for (let y = BUILD_Y; y < BUILD_Y + h; y++) set(x + dx, y, z + dz, (y - BUILD_Y) % 8 === 7 ? MAT.TRIM : y > BUILD_Y + h - 3 ? MAT.HAZARD : MAT.METAL);
        set(x + dx, BUILD_Y + h, z + dz, MAT.METAL);
      }
    }
    for (let i = 1; i < centers.length; i++) {
      const [ax, az] = centers[i - 1], [bx, bz] = centers[i];
      fill(Math.min(ax, bx), BUILD_Y + 8, Math.min(az, bz), Math.max(ax, bx) + 1, BUILD_Y + 9, Math.min(az, bz) + 1, MAT.TRIM);
      fill(bx, BUILD_Y + 8, Math.min(az, bz), bx + 1, BUILD_Y + 9, Math.max(az, bz) + 1, MAT.TRIM);
    }
    // Chaminés na faixa livre do lado +x.
    const n = ri(irnd, 1, 2);
    for (let k = 0; k < n; k++) {
      const cx = r.x1 - 5, cz = r.z0 + Math.floor((d * (k + 1)) / (n + 1)), rr = 2, h = Math.min(H - BUILD_Y - 4, ri(irnd, 60, 90));
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dz * dz > rr * rr + 1) continue;
        for (let y = BUILD_Y; y < BUILD_Y + h; y++) set(cx + dx, y, cz + dz, Math.floor((y - BUILD_Y) / 8) % 2 ? MAT.ANTENNA : MAT.HELIPAD);
        set(cx + dx, BUILD_Y + h, cz + dz, MAT.GLOW_RED);
      }
    }
  }

  /** Data center blindado: venezianas, porta com faixa de perigo e máquinas de resfriamento com luz ciano. */
  function datacenter(r: Rect): void {
    const s: Rect = { x0: r.x0 + 4, z0: r.z0 + 6, x1: r.x1 - 4, z1: r.z1 - 6 };
    const h = ri(irnd, 12, 18), sx = s.x1 - s.x0, sz = s.z1 - s.z0, wall = MAT.WALL0 + (def.palette.walls.length - 1);
    const at = (p: number, len: number, y: number, front: boolean): number => {
      const fy = y - BUILD_Y;
      if (p <= 1 || p >= len - 2) return MAT.TRIM;
      if (front && fy < 8 && Math.abs(p - (len >> 1)) <= 4) return Math.abs(p - (len >> 1)) === 4 || fy === 7 ? MAT.HAZARD : MAT.DOOR;
      if (fy === h - 2) return MAT.GLOW_CYAN;
      return fy % 2 === 0 ? MAT.TRIM : wall;
    };
    for (let y = BUILD_Y; y < BUILD_Y + h; y++) {
      for (let x = s.x0; x < s.x1; x++) { set(x, y, s.z0, at(x - s.x0, sx, y, true)); set(x, y, s.z1 - 1, at(x - s.x0, sx, y, false)); }
      for (let z = s.z0 + 1; z < s.z1 - 1; z++) { set(s.x0, y, z, at(z - s.z0, sz, y, false)); set(s.x1 - 1, y, z, at(z - s.z0, sz, y, false)); }
    }
    const top = BUILD_Y + h;
    fill(s.x0, top, s.z0, s.x1, top + 1, s.z1, MAT.ROOF);
    for (let z = s.z0 + 4; z + 4 <= s.z1 - 4; z += 8) for (let x = s.x0 + 4; x + 4 <= s.x1 - 4; x += 8) {
      fill(x, top + 1, z, x + 4, top + 3, z + 4, MAT.METAL);
      fill(x + 1, top + 3, z + 1, x + 3, top + 4, z + 3, MAT.GLOW_CYAN);
    }
    // Prato de comunicação num canto.
    fill(s.x0 + 3, top + 1, s.z0 + 3, s.x0 + 4, top + 8, s.z0 + 4, MAT.TRIM);
    fill(s.x0 + 1, top + 8, s.z0 + 1, s.x0 + 7, top + 9, s.z0 + 7, MAT.METAL);
  }

  // ---------------------------------------------------------------- ruas

  /** Poste de 5 m com lâmpada branca. */
  function lamp(x: number, z: number): void {
    fill(x, BUILD_Y, z, x + 1, BUILD_Y + 10, z + 1, MAT.TRIM);
    set(x, BUILD_Y + 10, z, MAT.GLOW_WHITE);
  }

  /**
   * Via elevada sobre a linha de rua: rampas maciças nas duas pontas (degraus de 0,5 m a cada 2 m,
   * o meio-fio que o carro sobe), tabuleiro de 1 m com mureta e luz, pilares no meio dos trechos.
   */
  function viaduct(axis: 'x' | 'z', line: number, deck: number): void {
    const hw = Math.max(4, hs - 2), stepLen = 4, rampLen = deck * stepLen;
    const v: Viaduct = { axis, line, deckTop: GROUND_TOP + deck, rampLen, halfWidth: hw };
    viaducts.push(v);
    const put = (t: number, y0: number, y1: number, u0: number, u1: number, m: number) => {
      if (axis === 'x') fill(t, y0, line + u0, t + 1, y1, line + u1, m);
      else fill(line + u0, y0, t, line + u1, y1, t + 1, m);
    };
    const one = (t: number, y: number, u: number, m: number) => { if (axis === 'x') set(t, y, line + u, m); else set(line + u, y, t, m); };
    for (let t = 0; t < N; t++) {
      const fromEnd = Math.min(t, N - 1 - t);
      const top = fromEnd < rampLen ? GROUND_TOP + Math.floor(fromEnd / stepLen) + 1 : v.deckTop; // topo do pavimento
      if (fromEnd < rampLen) {
        put(t, GROUND_TOP, top - 1, -hw, hw, MAT.PILLAR);
        put(t, top - 1, top, -hw, hw, MAT.ASPHALT);
      } else {
        put(t, top - 2, top - 1, -hw, hw, MAT.PILLAR);
        put(t, top - 1, top, -hw, hw, MAT.ASPHALT);
        // Pilares no meio dos trechos entre cruzamentos (nunca dentro de um cruzamento).
        const m = t % P;
        if (!nearLine(t) && (m === P >> 2 || m === P >> 1 || m === (3 * P) >> 2)) put(t - 1, GROUND_TOP, top - 2, -2, 2, MAT.PILLAR), put(t, GROUND_TOP, top - 2, -2, 2, MAT.PILLAR);
      }
      // Mureta de 1 m com faixa de luz e marcação de perigo; faixa tracejada no centro.
      const lit = t % 6 < 3;
      one(t, top, -hw, lit ? MAT.GLOW_CYAN : MAT.TRIM);
      one(t, top, hw - 1, lit ? MAT.GLOW_CYAN : MAT.TRIM);
      one(t, top + 1, -hw, MAT.HAZARD);
      one(t, top + 1, hw - 1, MAT.HAZARD);
      if (t % 8 < 4 && fromEnd >= 4) one(t, top - 1, 0, MAT.LANE);
    }
  }
}
