import { z } from 'zod';
import { DEG } from '../sim/math';
import { MeshBuilder, type RGB, type V, hexToRgb } from './mesh-builder';

/**
 * O Dummy (M0.2, ADR 0004): boneco articulado de peças rígidas facetadas com juntas pretas,
 * montado por código. Puro (sem Three.js). Cada peça pertence a uma junta; uma pose é um conjunto de
 * rotações por junta (graus nos dados). `writePose` transforma os vértices na CPU para uma malha
 * única (1 draw call), o mesmo esquema que servirá à carcaça que se transforma.
 * Eixos: Y para cima, −Z é a frente; o lado esquerdo do boneco é −X.
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Euler = z.tuple([z.number(), z.number(), z.number()]);

export const JOINTS = [
  'root', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
] as const;
export type Joint = (typeof JOINTS)[number];

export const PoseSchema = z.object({
  label: z.string(),
  /** Altura da pelve acima do chão (em pé) ou do assento (sentado), em unidades do modelo (antes da escala). */
  rootY: z.number(),
  /** Rotação por junta em graus [x, y, z], aplicada como Y · X · Z. Juntas ausentes ficam em zero. */
  joints: z.record(z.enum(JOINTS), Euler),
});
export type DummyPose = z.infer<typeof PoseSchema>;

export const DummySchema = z.object({
  heightM: z.number().min(1).max(3).default(1.8),
  colors: z.object({ body: Hex, bodyDark: Hex, joint: Hex }),
  poses: z.record(z.string(), PoseSchema),
});
export type DummyDef = z.infer<typeof DummySchema>;

export const DUMMY_SPECS = [{ key: 'heightM', label: 'Altura do Dummy', min: 1.2, max: 2.4, step: 0.05, unit: 'm' }] as const;

/** Altura natural do modelo (pé ao topo da cabeça) antes da escala. */
export const BASE_HEIGHT = 1.84;

interface Part { joint: Joint; parent: Joint | null; offset: V; positions: number[] }
export interface Rig { parts: Part[]; colors: number[]; vertexCount: number; scale: number }

/** Bloco facetado (octógono esticado) de y0 a y1, com largura w e profundidade d na base. */
function seg(b: MeshBuilder, y0: number, y1: number, w: number, d: number, taper: number, color: RGB): void {
  const k = 1 / Math.cos(Math.PI / 8);
  b.push().translate(0, y0, 0).scale((w / 2) * k, 1, (d / 2) * k).rotateY(Math.PI / 8).cylinder(1, taper, y1 - y0, 8, color).pop();
}
const ball = (b: MeshBuilder, x: number, y: number, zz: number, r: number, c: RGB) => b.push().translate(x, y, zz).ico(r, c).pop();

/** Monta as peças do Dummy. Cada peça é desenhada no espaço da sua junta. */
export function buildDummyRig(def: DummyDef): Rig {
  const B = hexToRgb(def.colors.body), D = hexToRgb(def.colors.bodyDark), K = hexToRgb(def.colors.joint);
  const parts: Part[] = [];
  const colors: number[] = [];
  const add = (joint: Joint, parent: Joint | null, offset: V, draw: (b: MeshBuilder) => void) => {
    const b = new MeshBuilder();
    draw(b);
    const m = b.build();
    parts.push({ joint, parent, offset, positions: m.positions });
    colors.push(...m.colors);
  };

  // Tronco
  add('root', null, [0, 0, 0], (b) => {
    seg(b, -0.11, 0.06, 0.3, 0.2, 1.12, B); // pelve
    b.push().translate(0, -0.02, -0.105).box(0.14, 0.1, 0.02, D).pop(); // placa frontal
    ball(b, -0.1, -0.08, 0, 0.06, K);
    ball(b, 0.1, -0.08, 0, 0.06, K);
  });
  add('spine', 'root', [0, 0.06, 0], (b) => {
    seg(b, 0, 0.07, 0.2, 0.15, 1, K); // abdômen segmentado
    seg(b, 0.07, 0.09, 0.23, 0.17, 1, D);
    seg(b, 0.09, 0.16, 0.21, 0.15, 1, K);
  });
  add('chest', 'spine', [0, 0.16, 0], (b) => {
    seg(b, 0, 0.12, 0.3, 0.2, 1.22, B); // costelas até o peito
    seg(b, 0.12, 0.27, 0.37, 0.24, 0.92, B); // peito largo
    seg(b, 0.27, 0.3, 0.32, 0.2, 0.8, D); // ombreira do pescoço
    // Placa do peito em V, levemente saltada.
    b.push().translate(-0.07, 0.18, -0.125).rotateZ(0.25).box(0.13, 0.11, 0.025, D).pop();
    b.push().translate(0.07, 0.18, -0.125).rotateZ(-0.25).box(0.13, 0.11, 0.025, D).pop();
    ball(b, -0.205, 0.245, 0, 0.055, K);
    ball(b, 0.205, 0.245, 0, 0.055, K);
  });
  add('neck', 'chest', [0, 0.3, 0], (b) => { b.cylinder(0.045, 0.04, 0.08, 6, K); });
  add('head', 'neck', [0, 0.07, 0], (b) => {
    seg(b, 0, 0.04, 0.12, 0.14, 1.35, K); // queixo
    seg(b, 0.04, 0.15, 0.17, 0.2, 1.08, B); // rosto liso, sem feições
    seg(b, 0.15, 0.26, 0.185, 0.215, 0.62, B); // topo facetado
    b.push().translate(0, 0.12, -0.105).box(0.12, 0.045, 0.012, D).pop(); // vinco da viseira
  });

  // Braços (o esquerdo fica em −X)
  for (const [s, side] of [[-1, 'L'], [1, 'R']] as const) {
    const sh = `shoulder${side}` as Joint, el = `elbow${side}` as Joint, wr = `wrist${side}` as Joint;
    add(sh, 'chest', [0.235 * s, 0.245, 0], (b) => {
      b.push().translate(0.02 * s, -0.04, 0).box(0.13, 0.13, 0.14, B).pop(); // ombreira
      seg(b, -0.28, -0.09, 0.085, 0.085, 1.12, B);
      b.push().translate(0.045 * s, -0.19, 0).box(0.012, 0.12, 0.05, K).pop(); // fresta lateral
      ball(b, 0, -0.3, 0, 0.045, K);
    });
    add(el, sh, [0, -0.3, 0], (b) => {
      seg(b, -0.25, -0.03, 0.075, 0.08, 1.25, B);
      ball(b, 0, -0.265, 0, 0.032, K);
    });
    add(wr, el, [0, -0.27, 0], (b) => {
      b.push().translate(0, -0.055, -0.005).box(0.045, 0.1, 0.085, K).pop(); // mão
      b.push().translate(-0.03 * s, -0.04, -0.02).box(0.02, 0.06, 0.03, K).pop(); // polegar
    });
  }

  // Pernas
  for (const [s, side] of [[-1, 'L'], [1, 'R']] as const) {
    const hp = `hip${side}` as Joint, kn = `knee${side}` as Joint, an = `ankle${side}` as Joint;
    add(hp, 'root', [0.1 * s, -0.08, 0], (b) => {
      seg(b, -0.41, -0.05, 0.12, 0.13, 1.22, B);
      b.push().translate(0, -0.25, -0.07).box(0.07, 0.14, 0.02, D).pop(); // placa da coxa
      ball(b, 0, -0.43, 0, 0.055, K);
    });
    add(kn, hp, [0, -0.43, 0], (b) => {
      seg(b, -0.39, -0.04, 0.095, 0.11, 1.25, B);
      b.push().translate(0, -0.06, -0.06).box(0.08, 0.08, 0.03, D).pop(); // joelheira
      ball(b, 0, -0.41, 0, 0.035, K);
    });
    add(an, kn, [0, -0.42, 0], (b) => {
      b.push().translate(0, -0.03, -0.04).box(0.1, 0.07, 0.23, B).pop();
      b.push().translate(0, -0.07, -0.04).box(0.105, 0.02, 0.24, K).pop(); // sola
    });
  }

  return { parts, colors, vertexCount: colors.length / 3, scale: def.heightM / BASE_HEIGHT };
}

// ---- matrizes 3×4 (linhas) ----
type M = number[];
function mul(a: M, b: M): M {
  const o = new Array<number>(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}
/** Rotação Y · X · Z a partir de graus [x, y, z], com translação t. */
function jointMatrix(e: [number, number, number] | undefined, t: V): M {
  const [ax, ay, az] = e ? [e[0] * DEG, e[1] * DEG, e[2] * DEG] : [0, 0, 0];
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  const X: M = [1, 0, 0, 0, 0, cx, -sx, 0, 0, sx, cx, 0];
  const Y: M = [cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0];
  const Z: M = [cz, -sz, 0, 0, sz, cz, 0, 0, 0, 0, 1, 0];
  const r = mul(Y, mul(X, Z));
  r[3] = t[0]; r[7] = t[1]; r[11] = t[2];
  return r;
}

/** Matriz de mundo (no espaço do personagem, pés no chão em y = 0) de cada junta na pose. */
export function poseMatrices(rig: Rig, pose: DummyPose): Map<Joint, M> {
  const out = new Map<Joint, M>();
  const s = rig.scale;
  for (const p of rig.parts) {
    const local = jointMatrix(pose.joints[p.joint], p.parent ? p.offset : [0, pose.rootY, 0]);
    const parent = p.parent ? out.get(p.parent)! : [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0];
    out.set(p.joint, mul(parent, local));
  }
  return out;
}

/** Escreve as posições de todos os vértices na pose (no espaço do personagem) em `out`. */
export function writePose(rig: Rig, pose: DummyPose, out: Float32Array | number[]): void {
  const mats = poseMatrices(rig, pose);
  let o = 0;
  for (const p of rig.parts) {
    const m = mats.get(p.joint)!;
    const src = p.positions;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], zz = src[i + 2];
      out[o++] = m[0] * x + m[1] * y + m[2] * zz + m[3];
      out[o++] = m[4] * x + m[5] * y + m[6] * zz + m[7];
      out[o++] = m[8] * x + m[9] * y + m[10] * zz + m[11];
    }
  }
}

/** Caixa envolvente da pose: [minX, minY, minZ, maxX, maxY, maxZ]. */
export function poseBounds(rig: Rig, pose: DummyPose): number[] {
  const pos = new Array<number>(rig.vertexCount * 3);
  writePose(rig, pose, pos);
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[i + k]); b[k + 3] = Math.max(b[k + 3], pos[i + k]); }
  return b;
}

/** Posição (no espaço do personagem) de uma junta na pose. */
export function jointPosition(rig: Rig, pose: DummyPose, joint: Joint): V {
  const m = poseMatrices(rig, pose).get(joint)!;
  return [m[3], m[7], m[11]];
}
