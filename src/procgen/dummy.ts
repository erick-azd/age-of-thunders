import { z } from 'zod';
import { DEG } from '../sim/math';
import { MeshBuilder, type RGB, type V, hexToRgb } from './mesh-builder';

/**
 * O Dummy (M0.2, ADR 0004 e 0005): piloto de peças rígidas facetadas em estilo mecha arcade,
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
  /** Paleta arcade (ADR 0005): corpo branco, armadura azul, detalhes laranja, estrutura cinza, juntas e brilho. */
  colors: z.object({ white: Hex, armor: Hex, accent: Hex, frame: Hex, dark: Hex, glow: Hex }),
  poses: z.record(z.string(), PoseSchema),
});
export type DummyDef = z.infer<typeof DummySchema>;

export const DUMMY_SPECS = [{ key: 'heightM', label: 'Altura do Dummy', min: 1.2, max: 2.4, step: 0.05, unit: 'm' }] as const;

/** Altura natural do modelo (pé ao topo da cabeça) antes da escala. */
export const BASE_HEIGHT = 1.84;

interface Part { joint: Joint; parent: Joint | null; offset: V; positions: number[] }
/** `glow` por vértice (0 ou 1): viseira e painéis que brilham. */
export interface Rig { parts: Part[]; colors: number[]; glow: number[]; vertexCount: number; scale: number }

/** Bloco facetado (octógono esticado) de y0 a y1, com largura w e profundidade d na base. */
function seg(b: MeshBuilder, y0: number, y1: number, w: number, d: number, taper: number, color: RGB): void {
  const k = 1 / Math.cos(Math.PI / 8);
  b.push().translate(0, y0, 0).scale((w / 2) * k, 1, (d / 2) * k).rotateY(Math.PI / 8).cylinder(1, taper, y1 - y0, 8, color).pop();
}
const ball = (b: MeshBuilder, x: number, y: number, zz: number, r: number, c: RGB) => b.push().translate(x, y, zz).ico(r, c).pop();
const boxAt = (b: MeshBuilder, x: number, y: number, zz: number, w: number, h: number, d: number, c: RGB, rx = 0, rz = 0) =>
  b.push().translate(x, y, zz).rotateX(rx).rotateZ(rz).box(w, h, d, c).pop();

/**
 * Monta as peças do Dummy no estilo "piloto-mecha arcade dos anos 90" (design original): armadura
 * em placas, ombreiras e pés grandes, cabeça pequena com viseira, painéis luminosos e mochila com
 * dois propulsores. Cada peça é desenhada no espaço da sua junta; `glow` desenha as partes que brilham.
 */
export function buildDummyRig(def: DummyDef): Rig {
  const C = def.colors;
  const W = hexToRgb(C.white), A = hexToRgb(C.armor), O = hexToRgb(C.accent), F = hexToRgb(C.frame), K = hexToRgb(C.dark), G = hexToRgb(C.glow);
  const parts: Part[] = [];
  const colors: number[] = [];
  const glow: number[] = [];
  const add = (joint: Joint, parent: Joint | null, offset: V, draw: (b: MeshBuilder) => void, lit?: (b: MeshBuilder) => void) => {
    const b = new MeshBuilder();
    draw(b);
    const solid = b.build();
    const n0 = solid.positions.length;
    const g = new MeshBuilder();
    lit?.(g);
    const shine = g.build();
    parts.push({ joint, parent, offset, positions: [...solid.positions, ...shine.positions] });
    colors.push(...solid.colors, ...shine.colors);
    for (let i = 0; i < n0 / 3; i++) glow.push(0);
    for (let i = 0; i < shine.positions.length / 3; i++) glow.push(1);
  };

  // Tronco
  add('root', null, [0, 0, 0], (b) => {
    seg(b, -0.11, 0.06, 0.3, 0.2, 1.12, F); // pelve
    boxAt(b, 0, -0.05, -0.115, 0.2, 0.15, 0.03, W, 0.15); // saia frontal
    boxAt(b, 0, 0.02, -0.128, 0.08, 0.05, 0.03, O); // fivela
    for (const s of [-1, 1]) boxAt(b, 0.17 * s, -0.04, 0, 0.04, 0.15, 0.15, A); // placas laterais
    ball(b, -0.1, -0.08, 0, 0.06, K);
    ball(b, 0.1, -0.08, 0, 0.06, K);
  });
  add('spine', 'root', [0, 0.06, 0], (b) => {
    seg(b, 0, 0.07, 0.19, 0.14, 1, F);
    seg(b, 0.07, 0.09, 0.22, 0.16, 1, K);
    seg(b, 0.09, 0.16, 0.2, 0.14, 1, F);
  });
  add('chest', 'spine', [0, 0.16, 0], (b) => {
    seg(b, 0, 0.12, 0.3, 0.2, 1.25, W); // costelas brancas
    seg(b, 0.12, 0.28, 0.41, 0.26, 0.86, A); // peitoral azul largo
    seg(b, 0.27, 0.31, 0.26, 0.2, 0.8, F); // gola
    for (const s of [-1, 1]) {
      boxAt(b, 0.09 * s, 0.17, -0.13, 0.15, 0.1, 0.03, A, 0, -0.18 * s); // placas do peito
      boxAt(b, 0.205 * s, 0.15, -0.05, 0.03, 0.06, 0.09, O); // respiros laranja
      ball(b, 0.215 * s, 0.245, 0, 0.055, K);
    }
    // Mochila com dois propulsores.
    boxAt(b, 0, 0.17, 0.17, 0.26, 0.22, 0.12, F);
    boxAt(b, 0, 0.26, 0.2, 0.2, 0.05, 0.08, A);
    for (const s of [-1, 1]) b.push().translate(0.07 * s, -0.01, 0.21).cylinder(0.05, 0.035, 0.08, 6, O).pop();
  }, (g) => {
    boxAt(g, 0, 0.22, -0.143, 0.11, 0.035, 0.012, G); // painel do peito
    for (const s of [-1, 1]) boxAt(g, 0.07 * s, 0.215, 0.233, 0.05, 0.03, 0.01, G); // luzes da mochila
  });
  add('neck', 'chest', [0, 0.3, 0], (b) => { b.cylinder(0.045, 0.04, 0.08, 6, K); });
  add('head', 'neck', [0, 0.07, 0], (b) => {
    seg(b, 0, 0.05, 0.12, 0.13, 1.3, K); // queixo
    seg(b, 0.05, 0.16, 0.17, 0.2, 1.0, W); // capacete
    seg(b, 0.16, 0.235, 0.17, 0.2, 0.62, A); // topo azul
    boxAt(b, 0, 0.235, 0.01, 0.03, 0.05, 0.17, A); // crista
    for (const s of [-1, 1]) boxAt(b, 0.09 * s, 0.1, 0, 0.02, 0.07, 0.1, O); // orelhas laranja
  }, (g) => {
    boxAt(g, 0, 0.12, -0.1, 0.15, 0.035, 0.02, G); // viseira
  });

  // Braços (o esquerdo fica em −X)
  for (const [s, side] of [[-1, 'L'], [1, 'R']] as const) {
    const sh = `shoulder${side}` as Joint, el = `elbow${side}` as Joint, wr = `wrist${side}` as Joint;
    add(sh, 'chest', [0.235 * s, 0.245, 0], (b) => {
      boxAt(b, 0.05 * s, -0.02, 0, 0.17, 0.15, 0.2, A, 0, 0.12 * s); // ombreira grande
      boxAt(b, 0.12 * s, -0.09, 0, 0.05, 0.05, 0.21, O); // ponta laranja
      seg(b, -0.28, -0.09, 0.085, 0.085, 1.1, W);
      ball(b, 0, -0.3, 0, 0.045, F);
    }, (g) => {
      boxAt(g, 0.142 * s, 0.0, 0, 0.012, 0.03, 0.12, G, 0, 0.12 * s); // faixa da ombreira
    });
    add(el, sh, [0, -0.3, 0], (b) => {
      seg(b, -0.25, -0.03, 0.1, 0.11, 1.15, W); // antebraço robusto
      seg(b, -0.25, -0.18, 0.115, 0.125, 1, A); // punho azul
      boxAt(b, 0.06 * s, -0.12, 0, 0.012, 0.08, 0.05, O);
      ball(b, 0, -0.265, 0, 0.032, K);
    });
    add(wr, el, [0, -0.27, 0], (b) => {
      boxAt(b, 0, -0.055, -0.005, 0.05, 0.1, 0.09, F); // mão
      boxAt(b, -0.03 * s, -0.04, -0.02, 0.02, 0.06, 0.03, F); // polegar
    });
  }

  // Pernas
  for (const [s, side] of [[-1, 'L'], [1, 'R']] as const) {
    const hp = `hip${side}` as Joint, kn = `knee${side}` as Joint, an = `ankle${side}` as Joint;
    add(hp, 'root', [0.1 * s, -0.08, 0], (b) => {
      seg(b, -0.41, -0.05, 0.13, 0.14, 1.2, W);
      boxAt(b, 0.075 * s, -0.2, 0, 0.03, 0.22, 0.12, A); // armadura lateral da coxa
      ball(b, 0, -0.43, 0, 0.055, K);
    });
    add(kn, hp, [0, -0.43, 0], (b) => {
      seg(b, -0.39, -0.04, 0.15, 0.17, 0.72, W); // canela larga embaixo
      boxAt(b, 0, -0.06, -0.085, 0.11, 0.12, 0.04, A); // joelheira
      boxAt(b, 0, -0.24, 0.09, 0.1, 0.18, 0.04, A); // panturrilha
      boxAt(b, 0.085 * s, -0.3, 0, 0.012, 0.1, 0.06, O);
      ball(b, 0, -0.41, 0, 0.035, F);
    }, (g) => {
      boxAt(g, 0, -0.05, -0.107, 0.06, 0.025, 0.01, G); // luz da joelheira
    });
    add(an, kn, [0, -0.42, 0], (b) => {
      boxAt(b, 0, -0.03, -0.04, 0.14, 0.09, 0.28, A); // pé grande
      boxAt(b, 0, -0.05, -0.18, 0.13, 0.05, 0.06, F); // biqueira
      boxAt(b, 0, -0.02, 0.11, 0.1, 0.06, 0.05, O); // calcanhar laranja
      boxAt(b, 0, -0.08, -0.04, 0.15, 0.02, 0.29, K); // sola
    });
  }

  return { parts, colors, glow, vertexCount: colors.length / 3, scale: def.heightM / BASE_HEIGHT };
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

/** Pose intermediária (transformação): interpola `rootY` e cada junta, grau a grau. */
export function lerpPose(a: DummyPose, b: DummyPose, t: number): DummyPose {
  const joints: DummyPose['joints'] = {};
  for (const j of JOINTS) {
    const ea = a.joints[j] ?? [0, 0, 0], eb = b.joints[j] ?? [0, 0, 0];
    if (!a.joints[j] && !b.joints[j]) continue;
    joints[j] = [ea[0] + (eb[0] - ea[0]) * t, ea[1] + (eb[1] - ea[1]) * t, ea[2] + (eb[2] - ea[2]) * t];
  }
  return { label: t < 0.5 ? a.label : b.label, rootY: a.rootY + (b.rootY - a.rootY) * t, joints };
}
