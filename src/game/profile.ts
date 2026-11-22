import { z } from 'zod';
import perfisJson from '../../data/config/perfis.json';

/**
 * Perfis visuais (M0.7b, ADR 0011; GDD §4): "padrao" (desktop) e "celular". O celular desenha
 * com menos pixels, sem antialias, enxerga menos longe (a neblina esconde o corte) e solta menos
 * entulho. Escolha: `?perfil=celular|padrao` na URL; senão, tela de toque = celular.
 * Controles de toque: `?toque=1|0`; senão, ligados em tela de toque.
 */
const ProfileSchema = z.object({
  pixelRatioMax: z.number().min(0.5).max(3),
  antialias: z.boolean(),
  far: z.number().min(200).max(20000),
  fogNear: z.number().min(0),
  fogFar: z.number().min(1),
  debrisMax: z.number().int().min(0).max(1000),
  showPerf: z.boolean(),
});
export type Profile = z.infer<typeof ProfileSchema> & { name: 'padrao' | 'celular'; touch: boolean };
const PROFILES = z.object({ padrao: ProfileSchema, celular: ProfileSchema }).parse(perfisJson);

export function chooseProfile(): Profile {
  const q = new URLSearchParams(location.search);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const name = q.get('perfil') === 'celular' || q.get('perfil') === 'padrao' ? (q.get('perfil') as 'padrao' | 'celular') : coarse ? 'celular' : 'padrao';
  const touch = q.get('toque') === '1' ? true : q.get('toque') === '0' ? false : coarse;
  const p = PROFILES[name];
  return { ...p, name, touch, showPerf: q.get('fps') === '1' ? true : q.get('fps') === '0' ? false : p.showPerf };
}
