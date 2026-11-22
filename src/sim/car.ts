import { z } from 'zod';
import { DEG, clamp, lerp, v3, type Vec3 } from './math';

/**
 * Carro arcade (M0.3, ADR 0006), puro e determinístico. Física de "caixa que desliza":
 * velocidade decomposta em frente/lado, aderência lateral que mata o lado (menos com freio de mão,
 * o que dá a derrapagem), degrau automático até `stepUp` (meio-fio de 0,5 m), paredes que fazem
 * quicar e perder velocidade, gravidade quando sai do chão. O mundo é só `CarWorld`.
 * Rumo h: frente = (sin h, 0, −cos h); direita = (cos h, 0, sin h).
 */
export const CarParamsSchema = z.object({
  maxSpeed: z.number().min(5).max(120).default(38),
  reverseSpeed: z.number().min(1).max(40).default(12),
  accel: z.number().min(1).max(80).default(16),
  brake: z.number().min(1).max(120).default(34),
  drag: z.number().min(0).max(2).default(0.12),
  rolling: z.number().min(0).max(10).default(1.6),
  turnRateDeg: z.number().min(10).max(360).default(105),
  turnFullSpeed: z.number().min(0.5).max(30).default(7),
  highSpeedTurn: z.number().min(0.1).max(1).default(0.55),
  grip: z.number().min(0.5).max(40).default(9),
  handbrakeGrip: z.number().min(0).max(20).default(1),
  handbrakeTurn: z.number().min(1).max(3).default(1.5),
  stepUp: z.number().min(0).max(1.2).default(0.55),
  bounce: z.number().min(0).max(1).default(0.35),
  gravity: z.number().min(1).max(60).default(24),
  width: z.number().min(0.5).max(5).default(2),
  length: z.number().min(1).max(8).default(4.2),
  height: z.number().min(0.5).max(4).default(1.4),
});
export type CarParams = z.infer<typeof CarParamsSchema>;

export const CAR_SPECS = [
  { key: 'maxSpeed', label: 'Velocidade máxima', min: 10, max: 80, step: 1, unit: 'm/s' },
  { key: 'accel', label: 'Aceleração', min: 4, max: 60, step: 1, unit: 'm/s²' },
  { key: 'brake', label: 'Freio', min: 5, max: 100, step: 1, unit: 'm/s²' },
  { key: 'reverseSpeed', label: 'Ré máxima', min: 2, max: 30, step: 1, unit: 'm/s' },
  { key: 'turnRateDeg', label: 'Giro', min: 30, max: 240, step: 5, unit: '°/s' },
  { key: 'highSpeedTurn', label: 'Giro em alta (fração)', min: 0.2, max: 1, step: 0.05 },
  { key: 'grip', label: 'Aderência', min: 1, max: 30, step: 0.5 },
  { key: 'handbrakeGrip', label: 'Aderência no freio de mão', min: 0, max: 10, step: 0.1 },
  { key: 'stepUp', label: 'Degrau que sobe', min: 0, max: 1, step: 0.05, unit: 'm' },
  { key: 'bounce', label: 'Quique na parede', min: 0, max: 1, step: 0.05 },
  { key: 'gravity', label: 'Gravidade', min: 5, max: 50, step: 1, unit: 'm/s²' },
] as const;

/** O que o carro sabe do mundo. */
export interface CarWorld {
  /** Piso sob (x, z) que não passa de yMax. */
  floorAt(x: number, z: number, yMax: number): number;
  solidAt(x: number, y: number, z: number): boolean;
  waterHeight(x: number, z: number): number;
}

/** Estado só com dados. `pos` é o centro do carro no nível do chão. */
export interface CarState {
  pos: Vec3; heading: number; vel: Vec3; onGround: boolean;
  pitch: number; roll: number; wheelSpin: number; steerVis: number; time: number; wallHits: number;
}
export interface CarInput { throttle: number; brake: number; steer: number; handbrake: boolean }
export type CarEvent = { type: 'wall'; speed: number } | { type: 'land'; speed: number } | { type: 'water' };

export const neutralCarInput = (): CarInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false });

export function createCar(pos: Vec3, heading: number): CarState {
  return { pos: v3(pos.x, pos.y, pos.z), heading, vel: v3(), onGround: true, pitch: 0, roll: 0, wheelSpin: 0, steerVis: 0, time: 0, wallHits: 0 };
}

/** Velocidade para a frente (m/s, negativa em ré). */
export const forwardSpeed = (s: CarState): number => s.vel.x * Math.sin(s.heading) - s.vel.z * Math.cos(s.heading);

/** Pontos do contorno da carroceria no espaço local (lado, frente). */
function outline(p: CarParams): [number, number][] {
  const hw = p.width / 2, hl = p.length / 2, pts: [number, number][] = [];
  const nl = Math.max(2, Math.ceil(p.length / 0.6)), nw = Math.max(2, Math.ceil(p.width / 0.5));
  for (let i = 0; i <= nl; i++) { const f = -hl + (p.length * i) / nl; pts.push([-hw, f], [hw, f]); }
  for (let i = 1; i < nw; i++) { const l = -hw + (p.width * i) / nw; pts.push([l, -hl], [l, hl]); }
  return pts;
}
const outlineCache = new WeakMap<CarParams, [number, number][]>();
function outlineOf(p: CarParams): [number, number][] {
  let o = outlineCache.get(p);
  if (!o) { o = outline(p); outlineCache.set(p, o); }
  return o;
}

/** A carroceria em (x, y, z) com rumo h encosta em algo sólido acima do degrau? */
function bodyHits(w: CarWorld, p: CarParams, x: number, y: number, zz: number, h: number): boolean {
  const sh = Math.sin(h), ch = Math.cos(h);
  const levels = [y + p.stepUp + 0.05, y + (p.stepUp + p.height) / 2, y + p.height - 0.05];
  for (const [l, f] of outlineOf(p)) {
    const wx = x + ch * l + sh * f, wz = zz + sh * l - ch * f;
    for (const ly of levels) if (w.solidAt(wx, ly, wz)) return true;
  }
  return false;
}

/** Piso mais alto sob o centro e os quatro cantos (o carro se apoia no que estiver mais alto). */
function floorUnder(w: CarWorld, p: CarParams, x: number, y: number, zz: number, h: number): { floor: number; front: number; back: number; left: number; right: number } {
  const sh = Math.sin(h), ch = Math.cos(h), hw = p.width / 2 - 0.1, hl = p.length / 2 - 0.1, yMax = y + p.stepUp;
  const at = (l: number, f: number) => w.floorAt(x + ch * l + sh * f, zz + sh * l - ch * f, yMax);
  const c = at(0, 0), fl = at(-hw, hl), fr = at(hw, hl), bl = at(-hw, -hl), br = at(hw, -hl);
  return { floor: Math.max(c, fl, fr, bl, br), front: Math.max(fl, fr), back: Math.max(bl, br), left: Math.max(fl, bl), right: Math.max(fr, br) };
}

/** Um passo fixo (dt = 1/60). */
export function stepCar(s: CarState, inp: CarInput, p: CarParams, w: CarWorld, dt: number): CarEvent[] {
  const ev: CarEvent[] = [];
  s.time += dt;
  let fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
  let vF = s.vel.x * fx + s.vel.z * fz;
  let vR = s.vel.x * -fz + s.vel.z * fx; // direita = (cos h, 0, sin h) = (−fz, 0, fx)

  if (s.onGround) {
    const thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);
    if (thr > 0 && vF < p.maxSpeed) vF = Math.min(p.maxSpeed, vF + p.accel * thr * dt);
    if (brk > 0) vF = vF > 0.5 ? Math.max(0, vF - p.brake * brk * dt) : Math.max(-p.reverseSpeed, vF - p.accel * 0.6 * brk * dt);
    vF -= vF * p.drag * dt;
    if (thr === 0 && brk === 0) vF = Math.abs(vF) <= p.rolling * dt ? 0 : vF - Math.sign(vF) * p.rolling * dt;
    // Direção: nada parado, cheia a partir de turnFullSpeed, um pouco menor em alta.
    const sp = Math.abs(vF);
    const k = clamp(sp / p.turnFullSpeed, 0, 1) * lerp(1, p.highSpeedTurn, clamp(sp / p.maxSpeed, 0, 1));
    const yaw = clamp(inp.steer, -1, 1) * p.turnRateDeg * DEG * k * Math.sign(vF) * (inp.handbrake ? p.handbrakeTurn : 1);
    const nh = s.heading + yaw * dt;
    if (!bodyHits(w, p, s.pos.x, s.pos.y, s.pos.z, nh)) s.heading = nh;
    vR *= Math.exp(-(inp.handbrake ? p.handbrakeGrip : p.grip) * dt);
    if (inp.handbrake) vF *= Math.exp(-0.5 * dt);
    fx = Math.sin(s.heading); fz = -Math.cos(s.heading);
    s.vel.x = fx * vF - fz * vR;
    s.vel.z = fz * vF + fx * vR;
  }
  s.vel.y -= p.gravity * dt;

  // Movimento horizontal em subpassos de até 25 cm, deslizando nas paredes.
  const dist = Math.hypot(s.vel.x, s.vel.z) * dt, n = Math.max(1, Math.ceil(dist / 0.25));
  for (let i = 0; i < n; i++) {
    const dx = (s.vel.x * dt) / n, dz = (s.vel.z * dt) / n;
    const { floor } = floorUnder(w, p, s.pos.x + dx, s.pos.y, s.pos.z + dz, s.heading);
    const y = Math.max(s.pos.y, floor); // sobe o degrau antes de testar a carroceria
    if (!bodyHits(w, p, s.pos.x + dx, y, s.pos.z + dz, s.heading)) { s.pos.x += dx; s.pos.z += dz; s.pos.y = y; continue; }
    const impact = Math.hypot(s.vel.x, s.vel.z);
    const okX = !bodyHits(w, p, s.pos.x + dx, s.pos.y, s.pos.z, s.heading);
    const okZ = !bodyHits(w, p, s.pos.x, s.pos.y, s.pos.z + dz, s.heading);
    if (okX && Math.abs(dx) >= Math.abs(dz) * 0.2) { s.pos.x += dx; s.vel.z = -s.vel.z * p.bounce; s.vel.x *= 0.9; }
    else if (okZ) { s.pos.z += dz; s.vel.x = -s.vel.x * p.bounce; s.vel.z *= 0.9; }
    else { s.vel.x = -s.vel.x * p.bounce; s.vel.z = -s.vel.z * p.bounce; }
    s.wallHits++;
    ev.push({ type: 'wall', speed: impact });
    break;
  }

  // Vertical: cai com a gravidade, pousa no piso, desce rampas e degraus pequenos sem pular.
  const fu = floorUnder(w, p, s.pos.x, s.pos.y, s.pos.z, s.heading);
  const wasGround = s.onGround;
  s.pos.y += s.vel.y * dt;
  if (s.pos.y <= fu.floor || (wasGround && s.vel.y <= 0 && s.pos.y - fu.floor < p.stepUp + 0.1)) {
    if (!wasGround && s.vel.y < -6) ev.push({ type: 'land', speed: -s.vel.y });
    s.pos.y = fu.floor;
    s.vel.y = 0;
    s.onGround = true;
  } else s.onGround = false;

  // Inclinação visual (não afeta a física).
  if (s.onGround) {
    const tp = Math.atan2(fu.front - fu.back, p.length), tr = Math.atan2(fu.left - fu.right, p.width);
    s.pitch += (clamp(tp, -0.5, 0.5) - s.pitch) * Math.min(1, dt * 12);
    s.roll += (clamp(tr, -0.5, 0.5) - s.roll) * Math.min(1, dt * 12);
  }
  s.wheelSpin += (forwardSpeed(s) * dt) / 0.38;
  s.steerVis += (clamp(inp.steer, -1, 1) * 0.45 - s.steerVis) * Math.min(1, dt * 10);
  if (s.pos.y < w.waterHeight(s.pos.x, s.pos.z) - 0.8) ev.push({ type: 'water' });
  return ev;
}
