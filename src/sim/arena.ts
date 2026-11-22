import type { VoxelGrid } from './voxels';
import type { WorldQuery } from './world';

/**
 * Mundo híbrido (ADR 0002): o terreno da ilha (heightfield) mais as estruturas em voxels.
 * A física só conversa com esta interface; nunca com a malha.
 */
export class Arena implements WorldQuery {
  constructor(readonly terrain: WorldQuery, public voxels: VoxelGrid) {}

  /** Chão: o maior entre o terreno e o topo da coluna de voxels (telhados contam como chão). */
  groundHeight(x: number, z: number): number {
    return Math.max(this.terrain.groundHeight(x, z), this.voxels.topAt(x, z));
  }

  waterHeight(x: number, z: number): number { return this.terrain.waterHeight(x, z); }

  solidAt(x: number, y: number, z: number): boolean {
    return this.voxels.solidAtWorld(x, y, z) || (this.terrain.solidAt?.(x, y, z) ?? false);
  }
}
