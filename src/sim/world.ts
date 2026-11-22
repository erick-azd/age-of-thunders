import type { Vec3 } from './math';

/**
 * O que a simulação sabe do mundo. A física nunca conhece a malha: só estas consultas.
 * `solidAt` cobre os marcos sólidos (arcos, prédios, torres): bater é acidente.
 */
export interface WorldQuery {
  groundHeight(x: number, z: number): number;
  waterHeight(x: number, z: number): number;
  solidAt?(x: number, y: number, z: number): boolean;
  windAt?(x: number, y: number, z: number, t: number): Vec3;
}
