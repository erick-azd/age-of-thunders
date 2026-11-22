import { z } from 'zod';
import { type Vec3, v3 } from './math';
import type { VoxelGrid } from './voxels';

/**
 * Canhão da carcaça (M0.6, ADR 0009), puro e determinístico. O projétil voa em subpassos de 25 cm
 * (não atravessa parede de 0,5 m) com um pouco de gravidade; ao tocar voxel ou terreno, explode e
 * arranca uma esfera de voxels. A mira (para onde atirar) vem de fora: a câmera.
 */
export const WeaponSchema = z.object({
  cooldownS: z.number().min(0.05).max(3).default(0.22),
  speed: z.number().min(20).max(600).default(140),
  gravity: z.number().min(0).max(30).default(4),
  lifeS: z.number().min(0.2).max(10).default(3),
  blastRadiusM: z.number().min(0.25).max(6).default(1.6),
  rangeM: z.number().min(20).max(1000).default(320),
});
export type WeaponParams = z.infer<typeof WeaponSchema>;
export const WEAPON_SPECS = [
  { key: 'cooldownS', label: 'Intervalo entre tiros', min: 0.05, max: 1, step: 0.01, unit: 's' },
  { key: 'speed', label: 'Velocidade do projétil', min: 40, max: 400, step: 5, unit: 'm/s' },
  { key: 'gravity', label: 'Queda do projétil', min: 0, max: 20, step: 0.5, unit: 'm/s²' },
  { key: 'blastRadiusM', label: 'Raio da explosão', min: 0.5, max: 4, step: 0.1, unit: 'm' },
] as const;

/** `owner`: quem atirou (id do combatente; −1 = ninguém). */
export interface Projectile { pos: Vec3; vel: Vec3; life: number; owner: number }
/** Explosão: onde foi, o que arrancou ([x, y, z, material, ...] em voxels), quem atirou e em quem acertou direto (−1 = ninguém). */
export interface Blast { pos: Vec3; removed: number[]; owner: number; struck: number }

export interface ShotWorld {
  solidAt(x: number, y: number, z: number): boolean;
  groundHeight(x: number, z: number): number;
}

/** Projétil saindo de `from` em direção a `target`. */
export function fire(from: Vec3, target: Vec3, p: WeaponParams, owner = -1): Projectile {
  const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { pos: v3(from.x, from.y, from.z), vel: v3((dx / len) * p.speed, (dy / len) * p.speed, (dz / len) * p.speed), life: p.lifeS, owner };
}

/** Primeiro ponto sólido (voxel ou terreno) no raio, até `range` m; senão o ponto no fim do alcance. */
export function raycast(w: ShotWorld, o: Vec3, dir: Vec3, range: number, step = 0.25): { point: Vec3; hit: boolean } {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1, ux = dir.x / len, uy = dir.y / len, uz = dir.z / len;
  for (let t = step; t <= range; t += step) {
    const x = o.x + ux * t, y = o.y + uy * t, z = o.z + uz * t;
    if (w.solidAt(x, y, z) || y < w.groundHeight(x, z)) return { point: v3(x, y, z), hit: true };
  }
  return { point: v3(o.x + ux * range, o.y + uy * range, o.z + uz * range), hit: false };
}

/**
 * Move os projéteis um passo; os que acertam explodem (arrancando voxels) e saem da lista.
 * `strike` (opcional) diz se o projétil, naquele ponto, acertou uma entidade (veículo, alvo): devolve o id ou −1.
 */
export function stepProjectiles(list: Projectile[], w: ShotWorld, grid: VoxelGrid, p: WeaponParams, dt: number, strike?: (s: Projectile) => number): Blast[] {
  const blasts: Blast[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.vel.y -= p.gravity * dt;
    s.life -= dt;
    const dist = Math.hypot(s.vel.x, s.vel.y, s.vel.z) * dt, n = Math.max(1, Math.ceil(dist / 0.25));
    let hit = false, struck = -1;
    for (let k = 0; k < n && !hit; k++) {
      s.pos.x += (s.vel.x * dt) / n; s.pos.y += (s.vel.y * dt) / n; s.pos.z += (s.vel.z * dt) / n;
      struck = strike ? strike(s) : -1;
      hit = struck >= 0 || w.solidAt(s.pos.x, s.pos.y, s.pos.z) || s.pos.y < w.groundHeight(s.pos.x, s.pos.z);
    }
    if (hit) {
      blasts.push({ pos: v3(s.pos.x, s.pos.y, s.pos.z), removed: grid.carveSphere(s.pos.x, s.pos.y, s.pos.z, p.blastRadiusM), owner: s.owner, struck });
      list.splice(i, 1);
    } else if (s.life <= 0) list.splice(i, 1);
  }
  return blasts;
}
