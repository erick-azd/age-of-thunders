import type { Vec3 } from './math';

/** Lado de um voxel em metros (GDD §4: voxels de 0,5 m). */
export const VOXEL = 0.5;
/** Lado do chunk de armazenamento, em voxels. Chunks vazios não ocupam memória. */
export const CHUNK = 32;
const CHUNK3 = CHUNK * CHUNK * CHUNK;

/**
 * Grid de voxels esparso, puro e determinístico (ADR 0002). Cada voxel é um byte: 0 é vazio e os
 * demais são índices de material. O grid cobre só as estruturas (mapa híbrido): o terreno da ilha
 * continua sendo heightfield. Coordenadas inteiras (x, y, z) a partir de `origin` (canto mínimo, em m).
 */
export class VoxelGrid {
  readonly ncx: number;
  readonly ncy: number;
  readonly ncz: number;
  readonly chunks: (Uint8Array | null)[];

  constructor(readonly sx: number, readonly sy: number, readonly sz: number, readonly origin: Vec3) {
    if (sx % CHUNK || sy % CHUNK || sz % CHUNK) throw new Error(`dimensões do grid devem ser múltiplas de ${CHUNK}`);
    this.ncx = sx / CHUNK;
    this.ncy = sy / CHUNK;
    this.ncz = sz / CHUNK;
    this.chunks = new Array<Uint8Array | null>(this.ncx * this.ncy * this.ncz).fill(null);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  private chunkIndex(x: number, y: number, z: number): number {
    return ((y >> 5) * this.ncz + (z >> 5)) * this.ncx + (x >> 5);
  }

  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return 0;
    const c = this.chunks[this.chunkIndex(x, y, z)];
    return c ? c[((y & 31) * CHUNK + (z & 31)) * CHUNK + (x & 31)] : 0;
  }

  set(x: number, y: number, z: number, v: number): void {
    if (!this.inside(x, y, z)) return;
    const ci = this.chunkIndex(x, y, z);
    let c = this.chunks[ci];
    if (!c) {
      if (v === 0) return;
      c = this.chunks[ci] = new Uint8Array(CHUNK3);
    }
    c[((y & 31) * CHUNK + (z & 31)) * CHUNK + (x & 31)] = v;
  }

  /** Preenche a caixa semiaberta [x0, x1) × [y0, y1) × [z0, z1), cortada nos limites do grid. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number): void {
    const ax = Math.max(0, x0), ay = Math.max(0, y0), az = Math.max(0, z0);
    const bx = Math.min(this.sx, x1), by = Math.min(this.sy, y1), bz = Math.min(this.sz, z1);
    for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) this.set(x, y, z, v);
  }

  /** Índice do voxel que contém a coordenada de mundo `w` no eixo dado. */
  toVoxelX(w: number): number { return Math.floor((w - this.origin.x) / VOXEL); }
  toVoxelY(w: number): number { return Math.floor((w - this.origin.y) / VOXEL); }
  toVoxelZ(w: number): number { return Math.floor((w - this.origin.z) / VOXEL); }

  solidAtWorld(x: number, y: number, z: number): boolean {
    return this.get(this.toVoxelX(x), this.toVoxelY(y), this.toVoxelZ(z)) !== 0;
  }

  /** Topo (em m) do voxel sólido mais alto na coluna que contém (x, z); −Infinity se não houver. */
  topAt(x: number, z: number): number {
    const i = this.toVoxelX(x), k = this.toVoxelZ(z);
    if (i < 0 || k < 0 || i >= this.sx || k >= this.sz) return -Infinity;
    for (let y = this.sy - 1; y >= 0; y--) if (this.get(i, y, k) !== 0) return this.origin.y + (y + 1) * VOXEL;
    return -Infinity;
  }

  /**
   * Piso sob (x, z) que não passa de `yMax` (m): topo do voxel sólido mais alto cujo topo ≤ yMax.
   * −Infinity se não houver. É o que deixa o carro subir meio-fio e andar sob a via elevada.
   */
  floorBelow(x: number, z: number, yMax: number): number {
    const i = this.toVoxelX(x), k = this.toVoxelZ(z);
    if (i < 0 || k < 0 || i >= this.sx || k >= this.sz) return -Infinity;
    for (let y = Math.min(this.sy - 1, Math.floor((yMax - this.origin.y) / VOXEL + 1e-6) - 1); y >= 0; y--) {
      // Só é piso se o voxel de cima estiver vazio: o meio de uma parede não serve de degrau.
      if (this.get(i, y, k) !== 0 && this.get(i, y + 1, k) === 0) return this.origin.y + (y + 1) * VOXEL;
    }
    return -Infinity;
  }

  /** Altura (em voxels) logo acima do chunk ocupado mais alto na coluna de chunks dada. */
  chunkColumnTop(cx: number, cz: number): number {
    for (let cy = this.ncy - 1; cy >= 0; cy--) if (this.chunks[(cy * this.ncz + cz) * this.ncx + cx]) return (cy + 1) * CHUNK;
    return 0;
  }

  /** Quantidade de voxels sólidos. */
  count(): number {
    let n = 0;
    for (const c of this.chunks) if (c) for (let i = 0; i < c.length; i++) if (c[i] !== 0) n++;
    return n;
  }

  /** Assinatura do conteúdo inteiro para o teste de determinismo (hash travado). */
  checksum(): number {
    let s = 0;
    for (let ci = 0; ci < this.chunks.length; ci++) {
      const c = this.chunks[ci];
      if (!c) continue;
      s = (Math.imul(s, 31) + ci) | 0;
      for (let i = 0; i < c.length; i++) if (c[i] !== 0) s = (Math.imul(s, 31) + i * 7 + c[i]) | 0;
    }
    return s;
  }
}
