import { z } from 'zod';
import { mulberry32 } from '../core/rng';
import { clamp, type Vec3 } from '../sim/math';
import { VOXEL, VoxelGrid } from '../sim/voxels';
import { type RGB, hexToRgb } from './mesh-builder';

/**
 * Bairro urbano em voxels (M0.1, ADR 0002), puro e determinístico: mesma seed → mesmos voxels.
 * Ruas em grade com faixa tracejada, calçadas elevadas 0,5 m (meio-fio), lotes divididos em
 * prédios ocos (paredes de 1 voxel, laje a cada andar, janelas) e uma torre como marco central.
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const DistrictSchema = z.object({
  id: z.string(),
  name: z.string(),
  seed: z.number().int(),
  sizeM: z.number().int().min(32).max(1024).refine((n) => n % 16 === 0, 'sizeM deve ser múltiplo de 16'),
  heightM: z.number().int().min(16).max(128).refine((n) => n % 16 === 0, 'heightM deve ser múltiplo de 16'),
  blockPitchM: z.number().min(24).max(256),
  streetM: z.number().min(4).max(30),
  sidewalkM: z.number().min(0.5).max(8),
  floorM: z.number().min(2).max(6),
  floorsMin: z.number().int().min(1).max(30),
  floorsMax: z.number().int().min(1).max(30),
  towerFloors: z.number().int().min(0).max(40),
  /** Centro de prédios: meia-largura (m, distância no eixo). Fora dele, a periferia de casas. */
  coreHalfM: z.number().min(0).max(512).default(128),
  houseLotM: z.number().min(8).max(32).default(12),
  houseTwoFloorChance: z.number().min(0).max(1).default(0.3),
  treeChance: z.number().min(0).max(1).default(0.6),
  palette: z.object({
    asphalt: Hex, lane: Hex, sidewalk: Hex, roof: Hex, trim: Hex, glass: Hex, antenna: Hex,
    walls: z.array(Hex).min(1).max(16),
    grass: Hex, trunk: Hex, leaf: Hex, door: Hex,
    roofTiles: z.array(Hex).min(1).max(8),
    houseWalls: z.array(Hex).min(1).max(8),
  }),
});
export type DistrictDef = z.infer<typeof DistrictSchema>;

/** Specs do editor F1. Mudar qualquer uma regenera o bairro. */
export const DISTRICT_SPECS = [
  { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1 },
  { key: 'floorsMin', label: 'Andares mínimos', min: 1, max: 10, step: 1 },
  { key: 'floorsMax', label: 'Andares máximos', min: 1, max: 16, step: 1 },
  { key: 'towerFloors', label: 'Andares da torre', min: 0, max: 20, step: 1 },
  { key: 'blockPitchM', label: 'Quarteirão + rua', min: 32, max: 128, step: 8, unit: 'm' },
  { key: 'streetM', label: 'Largura da rua', min: 6, max: 16, step: 1, unit: 'm' },
  { key: 'sidewalkM', label: 'Calçada', min: 1, max: 6, step: 0.5, unit: 'm' },
  { key: 'coreHalfM', label: 'Raio do centro (prédios)', min: 0, max: 192, step: 32, unit: 'm' },
  { key: 'houseLotM', label: 'Lote de casa', min: 8, max: 24, step: 1, unit: 'm' },
  { key: 'houseTwoFloorChance', label: 'Casas de 2 andares', min: 0, max: 1, step: 0.05 },
  { key: 'treeChance', label: 'Árvores nos quintais', min: 0, max: 1, step: 0.05 },
] as const;

/**
 * Materiais (o valor do voxel). Paredes de prédio: WALL0 + índice; telhas: TILE0 + índice;
 * paredes de casa: HOUSE0 + índice.
 */
export const MAT = {
  ASPHALT: 1, LANE: 2, SIDEWALK: 3, ROOF: 4, TRIM: 5, GLASS: 6, ANTENNA: 7, GRASS: 8, TRUNK: 9,
  LEAF: 30, DOOR: 31, WALL0: 10, TILE0: 32, HOUSE0: 40,
} as const;

/** Cor de cada material, indexada pelo valor do voxel. */
export function materialColors(def: DistrictDef): RGB[] {
  const P = def.palette, out: RGB[] = [];
  const set = (i: number, hex: string) => { out[i] = hexToRgb(hex); };
  for (let i = 0; i < MAT.HOUSE0 + P.houseWalls.length; i++) out[i] = [1, 0, 1];
  set(MAT.ASPHALT, P.asphalt); set(MAT.LANE, P.lane); set(MAT.SIDEWALK, P.sidewalk); set(MAT.ROOF, P.roof);
  set(MAT.TRIM, P.trim); set(MAT.GLASS, P.glass); set(MAT.ANTENNA, P.antenna);
  set(MAT.GRASS, P.grass); set(MAT.TRUNK, P.trunk); set(MAT.LEAF, P.leaf); set(MAT.DOOR, P.door);
  P.walls.slice(0, MAT.LEAF - MAT.WALL0).forEach((w, i) => set(MAT.WALL0 + i, w));
  P.roofTiles.forEach((w, i) => set(MAT.TILE0 + i, w));
  P.houseWalls.forEach((w, i) => set(MAT.HOUSE0 + i, w));
  return out;
}

export interface Building { x0: number; z0: number; x1: number; z1: number; floors: number; tower: boolean }
export interface House { x0: number; z0: number; x1: number; z1: number; floors: number }
export interface District { grid: VoxelGrid; buildings: Building[]; houses: House[]; def: DistrictDef }

/** Camadas (em voxels): asfalto em y 0–1, calçada e base dos lotes em y 2, prédios a partir de y 3. */
export const GROUND_TOP = 2;
const BUILD_Y = 3;

/** Gera o bairro com o canto mínimo em `origin` (metros). */
export function generateDistrict(def: DistrictDef, origin: Vec3): District {
  const V = 1 / VOXEL;
  const N = def.sizeM * V, H = def.heightM * V;
  const g = new VoxelGrid(N, H, N, origin);
  const rnd = mulberry32(def.seed);
  const P = Math.round(def.blockPitchM * V);
  const hs = Math.round((def.streetM * V) / 2);
  const walk = Math.round(def.sidewalkM * V);
  const F = Math.max(4, Math.round(def.floorM * V));
  const floorsMax = Math.max(def.floorsMin, def.floorsMax);
  const buildings: Building[] = [];
  const houses: House[] = [];
  const hrnd = mulberry32(def.seed ^ 0x51ed27);
  const coreHalf = def.coreHalfM * V;

  // Asfalto em todo o bairro.
  g.fill(0, 0, 0, N, GROUND_TOP, N, MAT.ASPHALT);

  // Linhas de centro das ruas, inclusive as bordas.
  const lines: number[] = [];
  for (let l = 0; l < N; l += P) lines.push(l);
  lines.push(N);

  // Faixa tracejada no centro das ruas internas (não pinta dentro dos cruzamentos).
  const nearLine = (t: number) => lines.some((l) => Math.abs(t - l) < hs);
  for (const l of lines.slice(1, -1)) {
    for (let t = 0; t < N; t++) {
      if (t % 8 >= 4 || nearLine(t)) continue;
      g.set(l, GROUND_TOP - 1, t, MAT.LANE);
      g.set(t, GROUND_TOP - 1, l, MAT.LANE);
    }
  }

  // Quarteirões: plataforma de calçada (meio-fio de 1 voxel) e lote no meio.
  const nb = lines.length - 1;
  const towerBlock = Math.floor((nb - 1) / 2);
  for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
    const x0 = lines[bi] + hs, x1 = lines[bi + 1] - hs, z0 = lines[bj] + hs, z1 = lines[bj + 1] - hs;
    if (x1 - x0 < 4 || z1 - z0 < 4) continue;
    g.fill(x0, GROUND_TOP, z0, x1, GROUND_TOP + 1, z1, MAT.SIDEWALK);
    const lot = { x0: x0 + walk, z0: z0 + walk, x1: x1 - walk, z1: z1 - walk };
    if (lot.x1 - lot.x0 < 12 || lot.z1 - lot.z0 < 12) continue;
    if (def.towerFloors > 0 && bi === towerBlock && bj === towerBlock) {
      // Marco central: praça com uma torre alta e antena.
      const side = Math.min(40, lot.x1 - lot.x0 - 8, lot.z1 - lot.z0 - 8);
      const cx = (lot.x0 + lot.x1) >> 1, cz = (lot.z0 + lot.z1) >> 1, h0 = side >> 1;
      const floors = Math.min(def.towerFloors, Math.floor((H - BUILD_Y - 12) / F));
      const b = { x0: cx - h0, z0: cz - h0, x1: cx - h0 + side, z1: cz - h0 + side, floors, tower: true };
      building(g, b, F, MAT.WALL0, true);
      const top = BUILD_Y + floors * F + 2;
      g.fill(cx - 1, top, cz - 1, cx + 1, top + 10, cz + 1, MAT.ANTENNA);
      buildings.push(b);
      continue;
    }
    const cheb = Math.max(Math.abs((x0 + x1) / 2 - N / 2), Math.abs((z0 + z1) / 2 - N / 2));
    if (cheb < coreHalf) split(lot.x0, lot.z0, lot.x1, lot.z1, 0);
    else houseBlock(lot.x0, lot.z0, lot.x1, lot.z1);
  }
  return { grid: g, buildings, houses, def };

  /** Quarteirão de periferia: gramado, casas viradas para a rua na borda e quintais com árvores no meio. */
  function houseBlock(x0: number, z0: number, x1: number, z1: number): void {
    g.fill(x0, GROUND_TOP, z0, x1, GROUND_TOP + 1, z1, MAT.GRASS);
    const L = Math.max(16, Math.round(def.houseLotM * V));
    const nx = Math.max(1, Math.floor((x1 - x0) / L)), nz = Math.max(1, Math.floor((z1 - z0) / L));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const cx0 = x0 + Math.floor(((x1 - x0) * i) / nx), cx1 = x0 + Math.floor(((x1 - x0) * (i + 1)) / nx);
      const cz0 = z0 + Math.floor(((z1 - z0) * j) / nz), cz1 = z0 + Math.floor(((z1 - z0) * (j + 1)) / nz);
      // Frente da casa: o lado do lote que encosta na rua (−x, +x, −z, +z); lote interno vira quintal.
      const face = j === 0 ? 2 : j === nz - 1 ? 3 : i === 0 ? 0 : i === nx - 1 ? 1 : -1;
      if (face < 0) { if (hrnd() < def.treeChance) tree((cx0 + cx1) >> 1, (cz0 + cz1) >> 1); continue; }
      house(cx0, cz0, cx1, cz1, face);
    }
  }

  function house(cx0: number, cz0: number, cx1: number, cz1: number, face: number): void {
    const cw = cx1 - cx0, cd = cz1 - cz0;
    const hw = Math.min(cw - 4, 14 + Math.floor(hrnd() * 7)), hd = Math.min(cd - 4, 14 + Math.floor(hrnd() * 7));
    if (hw < 10 || hd < 10) return;
    const front = 3 + Math.floor(hrnd() * 2); // jardim da frente
    // Encosta na frente do lote; centralizado no outro eixo.
    let hx0 = cx0 + ((cw - hw) >> 1), hz0 = cz0 + ((cd - hd) >> 1);
    if (face === 0) hx0 = cx0 + front; else if (face === 1) hx0 = cx1 - front - hw;
    else if (face === 2) hz0 = cz0 + front; else hz0 = cz1 - front - hd;
    const h: House = { x0: hx0, z0: hz0, x1: hx0 + hw, z1: hz0 + hd, floors: hrnd() < def.houseTwoFloorChance ? 2 : 1 };
    const wall = MAT.HOUSE0 + Math.floor(hrnd() * def.palette.houseWalls.length);
    const tile = MAT.TILE0 + Math.floor(hrnd() * def.palette.roofTiles.length);
    const top = BUILD_Y + h.floors * F;
    // Paredes ocas com janelas; porta no meio da frente.
    const side = (p: number, len: number, y: number, isFront: boolean): number => {
      const fy = (y - BUILD_Y) % F, floor = Math.floor((y - BUILD_Y) / F), mid = len >> 1;
      if (isFront && floor === 0 && fy <= 4 && (p === mid || p === mid - 1)) return MAT.DOOR;
      if (fy >= 2 && fy <= 3 && p >= 2 && p <= len - 3 && (p % 5 === 2 || p % 5 === 3) && !(isFront && Math.abs(p - mid + 0.5) < 2.5 && floor === 0)) return MAT.GLASS;
      return wall;
    };
    for (let y = BUILD_Y; y < top; y++) {
      for (let x = h.x0; x < h.x1; x++) {
        g.set(x, y, h.z0, side(x - h.x0, hw, y, face === 2));
        g.set(x, y, h.z1 - 1, side(x - h.x0, hw, y, face === 3));
      }
      for (let z = h.z0 + 1; z < h.z1 - 1; z++) {
        g.set(h.x0, y, z, side(z - h.z0, hd, y, face === 0));
        g.set(h.x1 - 1, y, z, side(z - h.z0, hd, y, face === 1));
      }
    }
    if (h.floors > 1) g.fill(h.x0 + 1, BUILD_Y + F, h.z0 + 1, h.x1 - 1, BUILD_Y + F + 1, h.z1 - 1, wall);
    // Telhado de duas águas em degraus de 45°, cumeeira no eixo mais comprido, beiral de 1 voxel.
    const ridgeX = hw >= hd;
    for (let k = 0; ; k++) {
      const y = top + k;
      if (ridgeX) {
        const a = h.z0 - 1 + k, b = h.z1 + 1 - k;
        if (b - a <= 0) break;
        if (b - a <= 2) { g.fill(h.x0, y, a, h.x1, y + 1, b, tile); break; }
        for (let x = h.x0; x < h.x1; x++) { g.set(x, y, a, tile); g.set(x, y, b - 1, tile); }
        for (let z = a + 1; z < b - 1; z++) { g.set(h.x0, y, z, wall); g.set(h.x1 - 1, y, z, wall); }
      } else {
        const a = h.x0 - 1 + k, b = h.x1 + 1 - k;
        if (b - a <= 0) break;
        if (b - a <= 2) { g.fill(a, y, h.z0, b, y + 1, h.z1, tile); break; }
        for (let z = h.z0; z < h.z1; z++) { g.set(a, y, z, tile); g.set(b - 1, y, z, tile); }
        for (let x = a + 1; x < b - 1; x++) { g.set(x, y, h.z0, wall); g.set(x, y, h.z1 - 1, wall); }
      }
    }
    houses.push(h);
    // Árvore no quintal dos fundos, se couber.
    if (hrnd() < def.treeChance) {
      const tx = face === 0 ? cx1 - 4 : face === 1 ? cx0 + 3 : (cx0 + cx1) >> 1;
      const tz = face === 2 ? cz1 - 4 : face === 3 ? cz0 + 3 : (cz0 + cz1) >> 1;
      if (tx < h.x0 - 3 || tx > h.x1 + 2 || tz < h.z0 - 3 || tz > h.z1 + 2) tree(tx, tz);
    }
  }

  /** Árvore de voxel: tronco de 2 m e copa de 2,5 × 2 × 2,5 m sem os cantos. */
  function tree(x: number, z: number): void {
    const y = BUILD_Y, s = 2 + Math.floor(hrnd() * 2);
    g.fill(x, y, z, x + 1, y + 4, z + 1, MAT.TRUNK);
    g.fill(x - s, y + 3, z - s, x + s + 1, y + 4 + s + 1, z + s + 1, MAT.LEAF);
    for (const dy of [y + 3, y + 4 + s]) for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) g.set(x + dx, dy, z + dz, 0);
  }

  /** Divide o lote em prédios (vielas de 2 m entre eles). */
  function split(x0: number, z0: number, x1: number, z1: number, depth: number): void {
    const w = x1 - x0, d = z1 - z0, gap = 4;
    if (depth < 3 && Math.max(w, d) >= 36 && rnd() < (depth === 0 ? 0.95 : 0.55)) {
      const alongX = w >= d;
      const cut = Math.round((alongX ? w : d) * (0.35 + rnd() * 0.3));
      if (alongX) { split(x0, z0, x0 + cut - gap / 2, z1, depth + 1); split(x0 + cut + gap / 2, z0, x1, z1, depth + 1); }
      else { split(x0, z0, x1, z0 + cut - gap / 2, depth + 1); split(x0, z0 + cut + gap / 2, x1, z1, depth + 1); }
      return;
    }
    const inset = Math.floor(rnd() * 3);
    const b = { x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset, floors: 0, tower: false };
    if (b.x1 - b.x0 < 12 || b.z1 - b.z0 < 12) return;
    // Mais alto perto do centro do bairro.
    const c = 1 - Math.min(1, Math.hypot((b.x0 + b.x1) / 2 - N / 2, (b.z0 + b.z1) / 2 - N / 2) / Math.max(1, coreHalf));
    const t = clamp(rnd() * 0.65 + c * 0.55, 0, 1);
    b.floors = Math.min(def.floorsMin + Math.round((floorsMax - def.floorsMin) * t), Math.floor((H - BUILD_Y - 3) / F));
    const wall = MAT.WALL0 + Math.floor(rnd() * def.palette.walls.length);
    building(g, b, F, wall, false);
    // Caixa d'água ou máquina no telhado.
    if (rnd() < 0.6) {
      const bw = 4 + Math.floor(rnd() * 5), bd = 4 + Math.floor(rnd() * 5), bh = 3 + Math.floor(rnd() * 3);
      const rx = b.x0 + 3 + Math.floor(rnd() * Math.max(1, b.x1 - b.x0 - 6 - bw));
      const rz = b.z0 + 3 + Math.floor(rnd() * Math.max(1, b.z1 - b.z0 - 6 - bd));
      const y = BUILD_Y + b.floors * F + 1;
      g.fill(rx, y, rz, rx + bw, y + bh, rz + bd, MAT.TRIM);
    }
    buildings.push(b);
  }
}

/** Prédio oco: paredes de 1 voxel com janelas, laje a cada andar, telhado e platibanda. */
function building(g: VoxelGrid, b: Building, F: number, wall: number, glassy: boolean): void {
  const top = BUILD_Y + b.floors * F;
  const facade = (p: number, len: number, y: number): number => {
    const fy = (y - BUILD_Y) % F, floor = Math.floor((y - BUILD_Y) / F);
    if (fy === 0) return MAT.TRIM; // linha do andar
    const inner = p >= 2 && p <= len - 3;
    if (!inner) return wall;
    if (floor === 0) return fy >= 1 && fy <= F - 2 && (p - 2) % 8 !== 7 ? MAT.GLASS : wall; // vitrine no térreo
    if (glassy) return fy >= 1 && (p - 2) % 4 !== 3 ? MAT.GLASS : wall; // torre envidraçada
    return fy >= 2 && fy <= 3 && (p - 2) % 4 < 2 ? MAT.GLASS : wall;
  };
  const wx = b.x1 - b.x0, wz = b.z1 - b.z0;
  for (let y = BUILD_Y; y < top; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      const m = facade(x - b.x0, wx, y);
      g.set(x, y, b.z0, m);
      g.set(x, y, b.z1 - 1, m);
    }
    for (let z = b.z0 + 1; z < b.z1 - 1; z++) {
      const m = facade(z - b.z0, wz, y);
      g.set(b.x0, y, z, m);
      g.set(b.x1 - 1, y, z, m);
    }
  }
  for (let k = 1; k < b.floors; k++) g.fill(b.x0 + 1, BUILD_Y + k * F, b.z0 + 1, b.x1 - 1, BUILD_Y + k * F + 1, b.z1 - 1, MAT.TRIM);
  g.fill(b.x0, top, b.z0, b.x1, top + 1, b.z1, MAT.ROOF);
  for (let x = b.x0; x < b.x1; x++) { g.set(x, top + 1, b.z0, MAT.TRIM); g.set(x, top + 1, b.z1 - 1, MAT.TRIM); }
  for (let z = b.z0; z < b.z1; z++) { g.set(b.x0, top + 1, z, MAT.TRIM); g.set(b.x1 - 1, top + 1, z, MAT.TRIM); }
}
