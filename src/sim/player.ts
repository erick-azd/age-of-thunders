import { z } from 'zod';
import { DEG, clamp, v3, type Vec3 } from './math';
import type { WorldQuery } from './world';

/**
 * Veículo de exemplo (um planador arcade), puro e determinístico: troque pela física do seu jogo.
 * Os parâmetros vêm de data/config/player.json pelo esquema e aparecem sozinhos no editor F1.
 */
export const PlayerParamsSchema = z.object({
  maxSpeed: z.number().min(10).max(400).default(90),
  accel: z.number().min(1).max(200).default(25),
  drag: z.number().min(0).max(5).default(0.35),
  turnRateDeg: z.number().min(10).max(180).default(70),
  climbRate: z.number().min(1).max(100).default(28),
  minAgl: z.number().min(0).max(50).default(3),
});
export type PlayerParams = z.infer<typeof PlayerParamsSchema>;

/** Specs do editor F1 (rótulo, faixa, passo e unidade). Parâmetro novo = esquema + JSON + spec. */
export const PLAYER_SPECS = [
  { key: 'maxSpeed', label: 'Velocidade máxima', min: 10, max: 400, step: 5, unit: 'm/s' },
  { key: 'accel', label: 'Aceleração', min: 1, max: 200, step: 1, unit: 'm/s²' },
  { key: 'drag', label: 'Arrasto', min: 0, max: 5, step: 0.05 },
  { key: 'turnRateDeg', label: 'Giro', min: 10, max: 180, step: 1, unit: '°/s' },
  { key: 'climbRate', label: 'Subida', min: 1, max: 100, step: 1, unit: 'm/s' },
  { key: 'minAgl', label: 'Altura mínima', min: 0, max: 50, step: 0.5, unit: 'm' },
] as const;

/** Estado só com dados (sem funções): pode ser copiado com structuredClone e enviado pela rede. */
export interface PlayerState { pos: Vec3; heading: number; speed: number; time: number; crashed: boolean }
export interface PlayerInput { steer: number; throttle: number; climb: number }
export type PlayerEvent = { type: 'crash' };

export const neutralInput = (): PlayerInput => ({ steer: 0, throttle: 0, climb: 0 });

export function createPlayer(pos: Vec3, heading: number, speed = 0): PlayerState {
  return { pos: v3(pos.x, pos.y, pos.z), heading, speed, time: 0, crashed: false };
}

/** Um passo fixo (dt = 1/60). Rumo h: frente = (sin h, 0, −cos h); −Z é a frente. */
export function stepPlayer(s: PlayerState, inp: PlayerInput, p: PlayerParams, world: WorldQuery, dt: number): PlayerEvent[] {
  if (s.crashed) return [];
  s.time += dt;
  s.speed = clamp(s.speed + (inp.throttle * p.accel - s.speed * p.drag * (1 - inp.throttle)) * dt, 0, p.maxSpeed);
  s.heading += clamp(inp.steer, -1, 1) * p.turnRateDeg * DEG * dt;
  s.pos.x += Math.sin(s.heading) * s.speed * dt;
  s.pos.z -= Math.cos(s.heading) * s.speed * dt;
  s.pos.y += clamp(inp.climb, -1, 1) * p.climbRate * dt;
  const surface = Math.max(world.groundHeight(s.pos.x, s.pos.z), world.waterHeight(s.pos.x, s.pos.z));
  if (s.pos.y < surface + p.minAgl) s.pos.y = surface + p.minAgl;
  if (world.solidAt?.(s.pos.x, s.pos.y, s.pos.z)) { s.crashed = true; return [{ type: 'crash' }]; }
  return [];
}
