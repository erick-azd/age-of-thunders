// Matemática mínima e determinística para a simulação.
// Sem dependência de Three.js: este pacote roda igual no navegador e no servidor.

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const vClone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vAddScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const vDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vLen = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vNorm = (a: Vec3): Vec3 => {
  const l = vLen(a);
  return l > 1e-9 ? vScale(a, 1 / l) : v3(0, 0, -1);
};
export const vLerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const qClone = (q: Quat): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });

export function qMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qNormalize(q: Quat): Quat {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle * 0.5;
  const s = Math.sin(h);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) };
}

/** Rotaciona o vetor v pelo quaternion q. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + w*t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Integra uma velocidade angular expressa no espaço LOCAL (rad/s). */
export function qIntegrateLocal(q: Quat, w: Vec3, dt: number): Quat {
  const angle = vLen(w) * dt;
  if (angle < 1e-12) return q;
  const axis = vScale(w, 1 / vLen(w));
  return qNormalize(qMul(q, qFromAxisAngle(axis, angle)));
}

/** Quaternion de orientação a partir de heading (rad, 0 = -Z/norte, positivo = direita) e pitch (rad). */
export function qFromHeadingPitch(heading: number, pitch = 0): Quat {
  const yaw = qFromAxisAngle(v3(0, 1, 0), -heading);
  const p = qFromAxisAngle(v3(1, 0, 0), pitch);
  return qNormalize(qMul(yaw, p));
}

/** Ângulo (rad, 0..π) da rotação que leva a até b. */
export function qAngle(a: Quat, b: Quat): number {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, d));
}

/** Interpolação esférica pelo caminho mais curto. */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
  if (cos > 0.9995) {
    return qNormalize({ x: a.x + (bx - a.x) * t, y: a.y + (by - a.y) * t, z: a.z + (bz - a.z) * t, w: a.w + (bw - a.w) * t });
  }
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return { x: a.x * ka + bx * kb, y: a.y * ka + by * kb, z: a.z * ka + bz * kb, w: a.w * ka + bw * kb };
}

/**
 * Orientação que aponta −Z local para `fwd` com +Y local o mais perto possível de `up`
 * (convenção de câmera do Three.js). `fwd` e `up` não podem ser paralelos.
 */
export function qLookRotation(fwd: Vec3, up: Vec3): Quat {
  const z = vNorm(vScale(fwd, -1));
  const x = vNorm(vCross(up, z));
  const y = vCross(z, x);
  // Matriz de rotação com colunas x, y, z → quaternion.
  const m00 = x.x, m01 = y.x, m02 = z.x;
  const m10 = x.y, m11 = y.y, m12 = z.y;
  const m20 = x.z, m21 = y.z, m22 = z.z;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return qNormalize(q);
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

/** Eixos locais da aeronave (Three.js: Y para cima, −Z para frente). */
export const FWD = v3(0, 0, -1);
export const UP = v3(0, 1, 0);
export const RIGHT = v3(1, 0, 0);
