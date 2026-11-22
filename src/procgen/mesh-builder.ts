/**
 * Construtor de malhas low-poly neutro (sem Three.js). Produz triângulos
 * não-indexados com cor por face — o formato nativo do visual "flat shading".
 * Cada primitiva é convexa e orienta seus triângulos para fora automaticamente,
 * então a ordem dos vértices não importa para quem escreve geradores.
 */
export type RGB = [number, number, number];
export type V = [number, number, number];

export interface MeshData {
  positions: number[];
  colors: number[];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const shade = (c: RGB, k: number): RGB => [
  Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k),
];

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/** Matriz afim 3x4 em ordem de linhas: [m0 m1 m2 tx; m3 m4 m5 ty; m6 m7 m8 tz]. */
type Mat = number[];
const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function mul(a: Mat, b: Mat): Mat {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    }
    r[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return r;
}

function apply(m: Mat, v: V): V {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
  ];
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class MeshBuilder {
  positions: number[] = [];
  colors: number[] = [];
  private m: Mat = IDENT.slice();
  private stack: Mat[] = [];

  push(): this { this.stack.push(this.m.slice()); return this; }
  pop(): this { this.m = this.stack.pop() ?? IDENT.slice(); return this; }

  translate(x: number, y: number, z: number): this {
    this.m = mul(this.m, [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
    return this;
  }
  rotateY(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.m = mul(this.m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
    return this;
  }
  rotateX(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.m = mul(this.m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
    return this;
  }
  rotateZ(a: number): this {
    const c = Math.cos(a), s = Math.sin(a);
    this.m = mul(this.m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
    return this;
  }
  scale(x: number, y = x, z = x): this {
    this.m = mul(this.m, [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]);
    return this;
  }

  /** Triângulo em coordenadas locais; se `center` for dado, a face é orientada para longe dele. */
  tri(a: V, b: V, c: V, color: RGB, center?: V): this {
    let A = a, B = b, C = c;
    if (center) {
      const n = cross(sub(b, a), sub(c, a));
      const cen: V = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(n, sub(cen, center)) < 0) { B = c; C = b; }
    }
    // Espelhamento (escala negativa) inverte a orientação.
    const det = this.m[0] * (this.m[5] * this.m[10] - this.m[6] * this.m[9])
      - this.m[1] * (this.m[4] * this.m[10] - this.m[6] * this.m[8])
      + this.m[2] * (this.m[4] * this.m[9] - this.m[5] * this.m[8]);
    if (det < 0) { const t = B; B = C; C = t; }
    for (const v of [A, B, C]) {
      const p = apply(this.m, v);
      this.positions.push(p[0], p[1], p[2]);
      this.colors.push(color[0], color[1], color[2]);
    }
    return this;
  }

  quad(a: V, b: V, c: V, d: V, color: RGB, center?: V): this {
    this.tri(a, b, c, color, center);
    this.tri(a, c, d, color, center);
    return this;
  }

  /** Caixa centrada na origem. Cores: [topo, base, laterais] ou uma cor só. */
  box(w: number, h: number, d: number, color: RGB | [RGB, RGB, RGB]): this {
    const [top, bottom, side] = (Array.isArray(color[0]) ? color : [color, color, color]) as [RGB, RGB, RGB];
    const x = w / 2, y = h / 2, z = d / 2;
    const c: V = [0, 0, 0];
    const sideA = shade(side, 0.92);
    this.quad([-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], top, c);
    this.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], bottom, c);
    this.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], side, c);
    this.quad([-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], side, c);
    this.quad([x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z], sideA, c);
    this.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], sideA, c);
    return this;
  }

  /** Cilindro/cone com base em y=0. */
  cylinder(rBottom: number, rTop: number, h: number, sides: number, color: RGB, capColor?: RGB): this {
    const c: V = [0, h / 2, 0];
    const cap = capColor ?? color;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const b0: V = [Math.cos(a0) * rBottom, 0, Math.sin(a0) * rBottom];
      const b1: V = [Math.cos(a1) * rBottom, 0, Math.sin(a1) * rBottom];
      const t0: V = [Math.cos(a0) * rTop, h, Math.sin(a0) * rTop];
      const t1: V = [Math.cos(a1) * rTop, h, Math.sin(a1) * rTop];
      const k = 0.9 + 0.1 * Math.cos(a0 * 1.0 + 0.6);
      if (rTop > 1e-4) this.quad(b0, b1, t1, t0, shade(color, k), c);
      else this.tri(b0, b1, [0, h, 0], shade(color, k), c);
      if (rTop > 1e-4) this.tri([0, h, 0], t0, t1, cap, c);
      if (rBottom > 1e-4) this.tri([0, 0, 0], b0, b1, shade(cap, 0.7), c);
    }
    return this;
  }

  /** Telhado em prisma triangular ao longo do eixo X, base em y=0. */
  prism(w: number, h: number, d: number, roof: RGB, gable: RGB): this {
    const x = w / 2, z = d / 2;
    const c: V = [0, h / 3, 0];
    this.quad([-x, 0, -z], [x, 0, -z], [x, h, 0], [-x, h, 0], roof, c);
    this.quad([-x, 0, z], [x, 0, z], [x, h, 0], [-x, h, 0], shade(roof, 0.85), c);
    this.tri([-x, 0, -z], [-x, 0, z], [-x, h, 0], gable, c);
    this.tri([x, 0, -z], [x, 0, z], [x, h, 0], gable, c);
    return this;
  }

  /** Icosaedro (esfera de 20 faces). */
  ico(r: number, color: RGB, jitter?: () => number): this {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw: V[] = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
      [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const verts = raw.map((v) => {
      const l = Math.hypot(v[0], v[1], v[2]);
      const k = (r / l) * (jitter ? 1 + (jitter() - 0.5) * 0.3 : 1);
      return [v[0] * k, v[1] * k, v[2] * k] as V;
    });
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    faces.forEach(([a, b, c], i) => {
      const k = 0.9 + 0.12 * ((i * 7) % 5) / 4;
      this.tri(verts[a], verts[b], verts[c], shade(color, k), [0, 0, 0]);
    });
    return this;
  }

  /**
   * Loft ao longo de Z: cada seção é uma elipse de `sides` lados.
   * colorFn(segmento, lado) devolve a cor de cada face.
   */
  loft(sections: { z: number; w: number; h: number; y: number; sq?: number }[], sides: number, colorFn: (seg: number, side: number) => RGB): this {
    // `sq` (0..1) deixa a seção mais "quadrada" (superelipse): laterais retas e fundo chato dos caças.
    const ring = (s: { z: number; w: number; h: number; y: number; sq?: number }): V[] => {
      const pts: V[] = [];
      const p = 1 - 0.7 * Math.min(1, Math.max(0, s.sq ?? 0));
      const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
        pts.push([f(Math.cos(a)) * s.w / 2, s.y + f(Math.sin(a)) * s.h / 2, s.z]);
      }
      return pts;
    };
    const rings = sections.map(ring);
    for (let sgi = 0; sgi < sections.length - 1; sgi++) {
      const r0 = rings[sgi], r1 = rings[sgi + 1];
      const cen: V = [0, (sections[sgi].y + sections[sgi + 1].y) / 2, (sections[sgi].z + sections[sgi + 1].z) / 2];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const col = colorFn(sgi, i);
        const a = r0[i], b = r0[j], c = r1[j], d = r1[i];
        const degenerate0 = sections[sgi].w < 1e-3;
        const degenerate1 = sections[sgi + 1].w < 1e-3;
        if (degenerate0) this.tri(a, c, d, col, cen);
        else if (degenerate1) this.tri(a, b, c, col, cen);
        else this.quad(a, b, c, d, col, cen);
      }
    }
    // Tampas nas pontas não degeneradas.
    const capRing = (r: V[], s: { z: number; w: number; y: number }, col: RGB, inward: number) => {
      if (s.w < 1e-3) return;
      const center: V = [0, s.y, s.z];
      for (let i = 0; i < sides; i++) this.tri(center, r[i], r[(i + 1) % sides], col, [0, s.y, s.z + inward]);
    };
    capRing(rings[0], sections[0], colorFn(0, 0), 1);
    capRing(rings[rings.length - 1], sections[sections.length - 1], colorFn(sections.length - 2, 0), -1);
    return this;
  }

  /**
   * Painel de asa/empenagem: trapézio espesso no plano XZ (envergadura em +X).
   * rootLE/rootTE em z; tip deslocada por sweep; dihedral eleva a ponta.
   */
  panel(o: { rootLE: number; rootTE: number; tipLE: number; tipTE: number; span: number; thick: number; tipThick?: number; dihedral?: number }, color: RGB, edge?: RGB): this {
    const tt = o.tipThick ?? o.thick * 0.6;
    const yTip = Math.tan(o.dihedral ?? 0) * o.span;
    const v: V[] = [
      [0, o.thick / 2, o.rootLE], [0, o.thick / 2, o.rootTE], [o.span, yTip + tt / 2, o.tipTE], [o.span, yTip + tt / 2, o.tipLE],
      [0, -o.thick / 2, o.rootLE], [0, -o.thick / 2, o.rootTE], [o.span, yTip - tt / 2, o.tipTE], [o.span, yTip - tt / 2, o.tipLE],
    ];
    const c: V = [o.span / 2, yTip / 2, (o.rootLE + o.rootTE + o.tipLE + o.tipTE) / 4];
    const e = edge ?? shade(color, 0.8);
    this.quad(v[0], v[1], v[2], v[3], color, c);
    this.quad(v[4], v[5], v[6], v[7], shade(color, 0.75), c);
    this.quad(v[0], v[3], v[7], v[4], e, c);
    this.quad(v[1], v[2], v[6], v[5], e, c);
    this.quad(v[0], v[1], v[5], v[4], e, c);
    this.quad(v[3], v[2], v[6], v[7], e, c);
    return this;
  }

  /** Toro low-poly no plano XY (eixo em Z). */
  torus(R: number, r: number, radial: number, tubular: number, color: RGB): this {
    const pt = (i: number, j: number): V => {
      const u = (i / tubular) * Math.PI * 2;
      const v = (j / radial) * Math.PI * 2;
      return [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)];
    };
    for (let i = 0; i < tubular; i++) {
      const u = ((i + 0.5) / tubular) * Math.PI * 2;
      const cen: V = [R * Math.cos(u), R * Math.sin(u), 0];
      for (let j = 0; j < radial; j++) {
        const k = 0.85 + 0.15 * Math.cos((j / radial) * Math.PI * 2);
        this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), shade(color, k), cen);
      }
    }
    return this;
  }

  build(): MeshData {
    return { positions: this.positions, colors: this.colors };
  }
}
