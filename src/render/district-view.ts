import * as THREE from 'three';
import type { MeshData, RGB } from '../procgen/mesh-builder';
import { meshRegion } from '../procgen/voxel-mesher';
import { CHUNK, type VoxelGrid } from '../sim/voxels';
import { toGeometry } from './mesh-utils';

/**
 * Malhas da cidade de voxels (ADR 0002 e 0009). A malha é feita por **subcoluna** de 32 × 32
 * voxels (16 m), mas desenhada em **grupos** de 3 × 3 subcolunas (48 m, 1 draw call cada).
 * Depois de uma explosão, só as subcolunas atingidas são refeitas e o grupo é remontado por
 * concatenação: o custo cai de uma coluna de 48 m para uma de 16 m.
 */
const SUB = CHUNK; // 32 voxels
const GROUP = 3; // subcolunas por lado em cada grupo

export class DistrictView {
  readonly meshes: THREE.Mesh[] = [];
  private subs = new Map<number, MeshData>();
  private groupMesh = new Map<number, THREE.Mesh>();
  private dirty = new Set<number>();
  private nsx: number;
  private nsz: number;
  /** Subcolunas refeitas desde o começo (para o smoke e a telemetria). */
  remeshed = 0;

  constructor(private scene: THREE.Scene, readonly grid: VoxelGrid, private colors: RGB[], private glow: number[], private material: THREE.Material) {
    this.nsx = grid.sx / SUB;
    this.nsz = grid.sz / SUB;
    for (let k = 0; k < this.nsz; k++) for (let i = 0; i < this.nsx; i++) this.subs.set(k * this.nsx + i, this.meshSub(i, k));
    for (let gk = 0; gk < Math.ceil(this.nsz / GROUP); gk++) for (let gi = 0; gi < Math.ceil(this.nsx / GROUP); gi++) this.rebuildGroup(gi, gk);
  }

  private meshSub(i: number, k: number): MeshData {
    return meshRegion(this.grid, i * SUB, k * SUB, SUB, SUB, this.colors, this.grid.chunkColumnTop(i, k), this.glow);
  }

  private rebuildGroup(gi: number, gk: number): void {
    const key = gk * 1000 + gi;
    const parts: MeshData[] = [];
    for (let k = gk * GROUP; k < Math.min(this.nsz, (gk + 1) * GROUP); k++) for (let i = gi * GROUP; i < Math.min(this.nsx, (gi + 1) * GROUP); i++) parts.push(this.subs.get(k * this.nsx + i)!);
    const merged: MeshData = { positions: [], colors: [], glow: [] };
    for (const p of parts) {
      for (let j = 0; j < p.positions.length; j++) merged.positions.push(p.positions[j]);
      for (let j = 0; j < p.colors.length; j++) merged.colors.push(p.colors[j]);
      for (let j = 0; j < (p.glow?.length ?? 0); j++) merged.glow!.push(p.glow![j]);
    }
    const old = this.groupMesh.get(key);
    if (!merged.positions.length) {
      if (old) { old.visible = false; }
      return;
    }
    const geo = toGeometry(merged);
    if (old) {
      old.geometry.dispose();
      old.geometry = geo;
      old.visible = true;
      return;
    }
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = `cidade-${gi}-${gk}`;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    this.groupMesh.set(key, mesh);
  }

  /** Marca as subcolunas tocadas pelos voxels removidos ([x, y, z, m, ...]), com as vizinhas de borda. */
  markRemoved(removed: number[]): void {
    for (let j = 0; j < removed.length; j += 4) {
      const x = removed[j], z = removed[j + 2];
      for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const i = Math.floor((x + dx) / SUB), k = Math.floor((z + dz) / SUB);
        if (i >= 0 && k >= 0 && i < this.nsx && k < this.nsz) this.dirty.add(k * this.nsx + i);
      }
    }
  }

  /** Refaz o que foi marcado. Devolve quantas subcolunas foram refeitas. */
  flush(): number {
    if (!this.dirty.size) return 0;
    const groups = new Set<number>();
    for (const id of this.dirty) {
      const i = id % this.nsx, k = Math.floor(id / this.nsx);
      this.subs.set(id, this.meshSub(i, k));
      groups.add(Math.floor(k / GROUP) * 1000 + Math.floor(i / GROUP));
    }
    const n = this.dirty.size;
    this.remeshed += n;
    this.dirty.clear();
    for (const g of groups) this.rebuildGroup(g % 1000, Math.floor(g / 1000));
    return n;
  }

  triangles(): number {
    let t = 0;
    for (const m of this.meshes) if (m.visible) t += m.geometry.getAttribute('position').count / 3;
    return t;
  }

  dispose(): void {
    for (const m of this.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    this.meshes.length = 0;
  }
}
