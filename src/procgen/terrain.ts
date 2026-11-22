import { z } from 'zod';
import { hash2, mulberry32 } from '../core/rng';
import { clamp, lerp, smoothstep } from '../sim/math';
import type { WorldQuery } from '../sim/world';
import { MeshBuilder, type MeshData, type RGB, hexToRgb, mix, shade } from './mesh-builder';
import { Noise2D } from './noise';

/**
 * Terreno de exemplo: uma ilha em heightfield (2^n + 1 vértices por lado), puro e determinístico.
 * Mesma seed → mesma ilha, byte a byte (o teste trava o checksum). Troque pelo mundo do seu jogo.
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const WorldSchema = z.object({
  id: z.string(),
  name: z.string(),
  seed: z.number().int(),
  size: z.number().min(500).max(20000),
  resolution: z.number().int().refine((n) => Number.isInteger(Math.log2(n - 1)), 'resolution deve ser 2^n + 1'),
  islandRadius: z.number(),
  hillHeight: z.number().min(0).max(1500),
  coastNoise: z.number().min(0).max(0.5).default(0.2),
  seaFloor: z.number().default(-40),
  trees: z.number().int().min(0).max(20000).default(1500),
  /** Platô quadrado no centro para o bairro de voxels: meia-largura plana, faixa de mistura e altura. */
  plateauHalf: z.number().min(0).max(5000).default(0),
  plateauBlend: z.number().min(1).max(2000).default(150),
  plateauHeight: z.number().min(1).max(500).default(12),
  palette: z.object({
    sand: Hex, grass: z.array(Hex).min(1), rock: Hex, snow: Hex, forest: Hex, ocean: Hex,
    skyZenith: Hex, skyHorizon: Hex, skyGround: Hex,
  }),
});
export type WorldDef = z.infer<typeof WorldSchema>;

export interface TreeInstance { x: number; y: number; z: number; s: number; rot: number }

export class Terrain implements WorldQuery {
  readonly res: number;
  readonly half: number;
  readonly spacing: number;
  readonly heights: Float32Array;
  readonly noise: Noise2D;
  trees: TreeInstance[] = [];

  constructor(readonly def: WorldDef) {
    this.res = def.resolution;
    this.half = def.size / 2;
    this.spacing = def.size / (def.resolution - 1);
    this.heights = new Float32Array(this.res * this.res);
    this.noise = new Noise2D(def.seed);
  }

  /** Altura natural: máscara de ilha com costa recortada, colinas em fBm e cristas em ridged. */
  baseHeight(x: number, zz: number): number {
    const d = this.def, n = this.noise;
    const r = Math.hypot(x, zz) / d.islandRadius + n.fbm(x * 0.0006 + 3.1, zz * 0.0006 - 7.7, 4) * d.coastNoise;
    const mask = smoothstep(1.0, 0.75, r);
    const hills = Math.pow(n.fbm(x * 0.0012 + 11, zz * 0.0012 + 5, 5) * 0.5 + 0.5, 1.6) * d.hillHeight;
    const ridge = n.ridged(x * 0.001 + 40, zz * 0.001 - 9, 4) * d.hillHeight * 0.35;
    const h = lerp(d.seaFloor, 6 + hills + ridge * smoothstep(0.55, 0.2, r), mask);
    return d.plateauHalf > 0 ? lerp(h, d.plateauHeight, this.plateauWeight(x, zz)) : h;
  }

  /** 1 dentro do platô do bairro, caindo suavemente até 0 na faixa de mistura. */
  plateauWeight(x: number, zz: number): number {
    const d = this.def;
    if (d.plateauHalf <= 0) return 0;
    return smoothstep(d.plateauBlend, 0, Math.max(Math.abs(x), Math.abs(zz)) - d.plateauHalf);
  }

  generate(): this {
    const { res, half, spacing } = this;
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) this.heights[j * res + i] = this.baseHeight(-half + i * spacing, -half + j * spacing);
    this.placeTrees();
    return this;
  }

  private sample(i: number, j: number): number {
    return this.heights[clamp(j, 0, this.res - 1) * this.res + clamp(i, 0, this.res - 1)];
  }

  /** Interpolação por triângulo, com a MESMA diagonal da malha (senão o veículo "pousa no ar"). */
  groundHeight(x: number, zz: number): number {
    const gx = (x + this.half) / this.spacing, gz = (zz + this.half) / this.spacing;
    if (gx < 0 || gz < 0 || gx >= this.res - 1 || gz >= this.res - 1) return this.def.seaFloor;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const h00 = this.sample(i, j), h10 = this.sample(i + 1, j), h01 = this.sample(i, j + 1), h11 = this.sample(i + 1, j + 1);
    if (fx > fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }

  waterHeight(): number { return 0; }

  groundNormalY(x: number, zz: number): number {
    const e = this.spacing;
    const hx = this.groundHeight(x + e, zz) - this.groundHeight(x - e, zz), hz = this.groundHeight(x, zz + e) - this.groundHeight(x, zz - e);
    return 1 / Math.sqrt((hx / (2 * e)) ** 2 + 1 + (hz / (2 * e)) ** 2);
  }

  /** Cor chapada por face: areia, grama (variando por ruído), floresta, rocha nas encostas, neve no alto. */
  faceColor(x: number, zz: number, h: number, ny: number): RGB {
    const P = this.def.palette, n = this.noise;
    const jitter = 0.96 + 0.08 * hash2(Math.floor(x / 3), Math.floor(zz / 3), 7);
    let c: RGB;
    if (h < 3) c = hexToRgb(P.sand);
    else if (ny < 0.75) c = hexToRgb(P.rock);
    else if (h > this.def.hillHeight * 0.9) c = hexToRgb(P.snow);
    else if (n.fbm(x * 0.002 + 70, zz * 0.002, 3) > 0.2) c = hexToRgb(P.forest);
    else c = hexToRgb(P.grass[Math.floor((n.noise(x * 0.003, zz * 0.003) * 0.5 + 0.5) * P.grass.length) % P.grass.length]);
    if (h > this.def.hillHeight * 0.7 && ny < 0.9) c = mix(c, hexToRgb(P.rock), 0.4);
    return shade(c, jitter);
  }

  /** Malha inteira (1 draw call). Num mundo grande, divida em chunks com LOD. */
  mesh(): MeshData {
    const b = new MeshBuilder();
    const { res, half, spacing } = this;
    const P = (i: number, j: number): [number, number, number] => [-half + i * spacing, this.sample(i, j), -half + j * spacing];
    for (let j = 0; j < res - 1; j++) for (let i = 0; i < res - 1; i++) {
      const a = P(i, j), bb = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const [p, q, r] of [[a, bb, c], [a, c, d]] as const) {
        const cx = (p[0] + q[0] + r[0]) / 3, cy = (p[1] + q[1] + r[1]) / 3, cz = (p[2] + q[2] + r[2]) / 3;
        if (cy < this.def.seaFloor + 1) continue; // fundo do mar não aparece
        b.tri(p, q, r, this.faceColor(cx, cz, cy, this.groundNormalY(cx, cz)), [cx, cy - 50, cz]);
      }
    }
    return b.build();
  }

  private placeTrees(): void {
    const rnd = mulberry32(this.def.seed ^ 0x9e3779b9);
    const out: TreeInstance[] = [];
    for (let k = 0; k < this.def.trees * 6 && out.length < this.def.trees; k++) {
      const x = (rnd() - 0.5) * this.def.size, zz = (rnd() - 0.5) * this.def.size, s = 0.7 + rnd() * 0.6, rot = rnd() * Math.PI * 2;
      const h = this.groundHeight(x, zz);
      if (h < 5 || h > this.def.hillHeight * 0.8 || this.groundNormalY(x, zz) < 0.85) continue;
      if (this.noise.fbm(x * 0.002 + 70, zz * 0.002, 3) < 0.05) continue;
      if (this.plateauWeight(x, zz) > 0.5) continue; // nada de árvore no bairro
      out.push({ x, y: h, z: zz, s, rot });
    }
    this.trees = out;
  }

  /** Assinatura das alturas para o teste de determinismo (hash travado). */
  checksum(): number {
    let s = 0;
    for (let i = 0; i < this.heights.length; i += 37) s = (s * 31 + Math.round(this.heights[i] * 100)) | 0;
    return s;
  }
}
