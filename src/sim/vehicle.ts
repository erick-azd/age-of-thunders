import { z } from 'zod';
import { type CarEvent, type CarInput, type CarParams, type CarState, type CarWorld, createCar, fitsAt, stepCar } from './car';
import type { Vec3 } from './math';

/**
 * Veículo com transformação (M0.5, ADR 0008), puro. O Dummy é sempre o mesmo; a carcaça troca de
 * forma em `durationS`. A física troca no meio (`switchAt`), e só quando a nova carroceria cabe;
 * a velocidade e o rumo não mudam (decisão do M0: transformar sem perder velocidade).
 */
export type Form = 'car' | 'bike';
export const FORMS: readonly Form[] = ['car', 'bike'];

export const MorphSchema = z.object({
  durationS: z.number().min(0.1).max(3).default(0.6),
  switchAt: z.number().min(0).max(1).default(0.5),
});
export type MorphParams = z.infer<typeof MorphSchema>;
export const MORPH_SPECS = [
  { key: 'durationS', label: 'Duração da transformação', min: 0.2, max: 2, step: 0.05, unit: 's' },
  { key: 'switchAt', label: 'Troca da física em', min: 0, max: 1, step: 0.05 },
] as const;

export interface VehicleState extends CarState {
  /** Forma de destino (ou atual, se `morphT` = 1). */
  form: Form;
  /** Forma de onde a transformação saiu. */
  morphFrom: Form;
  /** Progresso da transformação, 0 a 1 (1 = parado na forma `form`). */
  morphT: number;
  /** Forma cuja física está valendo agora. */
  physForm: Form;
}

export function createVehicle(pos: Vec3, heading: number, form: Form): VehicleState {
  return { ...createCar(pos, heading), form, morphFrom: form, morphT: 1, physForm: form };
}

/** Começa a transformar para `to`. Recusa durante outra transformação ou se a nova forma não couber. */
export function startMorph(s: VehicleState, to: Form, params: Record<Form, CarParams>, w: CarWorld): boolean {
  if (s.morphT < 1 || to === s.form) return false;
  if (!fitsAt(s, params[to], w)) return false;
  s.morphFrom = s.form;
  s.form = to;
  s.morphT = 0;
  return true;
}

/** Um passo fixo: avança a transformação e roda a física da forma que está valendo. */
export function stepVehicle(s: VehicleState, inp: CarInput, params: Record<Form, CarParams>, m: MorphParams, w: CarWorld, dt: number): CarEvent[] {
  if (s.morphT < 1) s.morphT = Math.min(1, s.morphT + dt / m.durationS);
  if (s.physForm !== s.form && s.morphT >= m.switchAt && fitsAt(s, params[s.form], w)) s.physForm = s.form;
  return stepCar(s, inp, params[s.physForm], w, dt);
}
