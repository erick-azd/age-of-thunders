import * as THREE from 'three';
import { MeshBuilder, type RGB, hexToRgb } from '../procgen/mesh-builder';
import type { Projectile } from '../sim/weapons';
import { linearColors, toGeometry } from './mesh-utils';

/**
 * Efeitos do combate (M0.6, ADR 0009). São só visuais (ficam fora de `src/sim`): entulho que quica
 * e some, clarões de explosão, projéteis e a torre do canhão. Cada efeito é um InstancedMesh (1 draw
 * call) com limite fixo de instâncias.
 */
const unitBox = (c: RGB, glow = 0) => { const b = new MeshBuilder(); b.box(1, 1, 1, c); const m = b.build(); return { ...m, glow: m.positions.map((_, i) => (i % 3 === 0 ? glow : -1)).filter((v) => v >= 0) }; };

/** Material com brilho por instância: soma a cor da instância como emissiva (clarões e projéteis). */
function glowInstanceMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb * 1.6;\n#endif');
  };
  return m;
}

interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; wx: number; wy: number; s: number; life: number; c: THREE.Color }

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private list: Chunk[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(readonly max = 300) {
    const g = toGeometry(unitBox([1, 1, 1]));
    g.deleteAttribute('color');
    g.deleteAttribute('glow');
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ flatShading: true }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'entulho';
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }

  get count(): number { return this.list.length; }

  /** Solta entulho a partir dos voxels arrancados ([x, y, z, m, ...] → posições em metros por `toWorld`). */
  spawn(center: THREE.Vector3, removed: number[], toWorld: (x: number, y: number, z: number) => [number, number, number], colors: RGB[], budget = 40): void {
    const n = removed.length / 4, stride = Math.max(1, Math.floor(n / budget));
    for (let j = 0; j < n; j += stride) {
      const [x, y, z] = toWorld(removed[j * 4], removed[j * 4 + 1], removed[j * 4 + 2]);
      const dx = x - center.x, dy = y - center.y, dz = z - center.z, d = Math.hypot(dx, dy, dz) || 1, k = 6 + Math.random() * 8;
      const rgb = linearColors(colors[removed[j * 4 + 3]] ?? [0.5, 0.5, 0.5]);
      if (this.list.length >= this.max) this.list.shift();
      this.list.push({
        x, y, z, vx: (dx / d) * k, vy: Math.abs(dy / d) * k + 4 + Math.random() * 4, vz: (dz / d) * k,
        rx: 0, ry: 0, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, s: 0.3 + Math.random() * 0.25, life: 3 + Math.random() * 2,
        c: new THREE.Color(rgb[0], rgb[1], rgb[2]),
      });
    }
  }

  /** Física simples de pedaço solto; o veículo chuta o entulho em que encosta (atropelar entulho). */
  update(dt: number, floorAt: (x: number, z: number, yMax: number) => number, kicker?: { x: number; y: number; z: number; vx: number; vz: number; radius: number }): number {
    let kicked = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.life -= dt;
      if (c.life <= 0) { this.list.splice(i, 1); continue; }
      if (kicker) {
        const dx = c.x - kicker.x, dz = c.z - kicker.z, d = Math.hypot(dx, dz);
        if (d < kicker.radius && c.y < kicker.y + 1.5) {
          const sp = Math.hypot(kicker.vx, kicker.vz);
          if (sp > 2) { c.vx = kicker.vx * 1.1 + (dx / (d || 1)) * 3; c.vz = kicker.vz * 1.1 + (dz / (d || 1)) * 3; c.vy = Math.max(c.vy, 3 + sp * 0.15); kicked++; }
        }
      }
      c.vy -= 22 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.rx += c.wx * dt; c.ry += c.wy * dt;
      const fl = floorAt(c.x, c.z, c.y + 0.4) + c.s / 2;
      if (c.y < fl) {
        c.y = fl;
        if (c.vy < -2) { c.vy = -c.vy * 0.35; c.wx *= 0.6; c.wy *= 0.6; } else c.vy = 0;
        c.vx *= 0.75; c.vz *= 0.75;
        if (Math.abs(c.vx) + Math.abs(c.vz) < 0.3) { c.wx = 0; c.wy = 0; }
      }
    }
    this.list.forEach((c, i) => {
      const s = c.s * Math.min(1, c.life / 0.6);
      this.e.set(c.rx, c.ry, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(c.x, c.y, c.z), this.q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, c.c);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return kicked;
  }
}

/** Clarões de explosão: icosaedros que crescem e somem em 0,35 s. */
export class Flashes {
  readonly mesh: THREE.InstancedMesh;
  private list: { x: number; y: number; z: number; t: number; size: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(readonly max = 24) {
    const b = new MeshBuilder();
    b.ico(1, [1, 1, 1]);
    const g = toGeometry(b.build());
    g.deleteAttribute('color');
    this.mesh = new THREE.InstancedMesh(g, glowInstanceMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'claroes';
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }

  add(x: number, y: number, z: number, size: number): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, z, t: 0, size });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) if ((this.list[i].t += dt) > 0.35) this.list.splice(i, 1);
    this.list.forEach((f, i) => {
      const k = f.t / 0.35, s = f.size * (0.4 + 0.9 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5)) * (1 - k * 0.6);
      this.m.compose(this.v.set(f.x, f.y, f.z), this.q, this.sc.set(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.col.setRGB(1, 0.55 - 0.35 * k, 0.12 * (1 - k)));
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Projéteis em voo: barras curtas luminosas apontadas na direção do voo. */
export class Bolts {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private d = new THREE.Vector3();
  private fwd = new THREE.Vector3(0, 0, 1);
  private sc = new THREE.Vector3(0.18, 0.18, 1.4);

  constructor(color: string, readonly max = 48) {
    const g = toGeometry(unitBox([1, 1, 1]));
    g.deleteAttribute('color');
    g.deleteAttribute('glow');
    this.mesh = new THREE.InstancedMesh(g, glowInstanceMaterial(), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'projeteis';
    const c = linearColors(hexToRgb(color));
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
  }

  update(list: readonly Projectile[]): void {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      this.q.setFromUnitVectors(this.fwd, this.d.set(p.vel.x, p.vel.y, p.vel.z).normalize());
      this.m.compose(this.v.set(p.pos.x, p.pos.y, p.pos.z), this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Torre do canhão: base, corpo e cano com ponta luminosa. Gira em Y (rumo da mira) e o cano em X. */
export class Turret {
  readonly group = new THREE.Group();
  readonly barrel = new THREE.Group();
  readonly muzzle = new THREE.Object3D();

  constructor(material: THREE.Material, pal: { white: string; armor: string; accent: string; frame: string; dark: string; glow: string }) {
    const A = hexToRgb(pal.armor), O = hexToRgb(pal.accent), F = hexToRgb(pal.frame), K = hexToRgb(pal.dark), G = hexToRgb(pal.glow);
    const base = new MeshBuilder();
    base.push().translate(0, 0.05, 0).box(0.36, 0.1, 0.36, [F, K, F]).pop();
    base.push().translate(0, 0.17, 0.02).box(0.3, 0.16, 0.34, [A, K, A]).pop();
    const bar = new MeshBuilder(), lit = new MeshBuilder();
    bar.push().translate(0, 0, -0.32).box(0.09, 0.09, 0.62, [K, K, F]).pop();
    bar.push().translate(0, 0, -0.08).box(0.14, 0.12, 0.12, O).pop();
    lit.push().translate(0, 0, -0.64).box(0.11, 0.11, 0.03, G).pop();
    const b = bar.build(), l = lit.build();
    const barrelData = { positions: [...b.positions, ...l.positions], colors: [...b.colors, ...l.colors], glow: [...new Array(b.positions.length / 3).fill(0), ...new Array(l.positions.length / 3).fill(1)] };
    this.group.add(new THREE.Mesh(toGeometry(base.build()), material));
    this.barrel.position.set(0, 0.2, 0);
    this.barrel.add(new THREE.Mesh(toGeometry(barrelData), material));
    this.muzzle.position.set(0, 0, -0.7);
    this.barrel.add(this.muzzle);
    this.group.add(this.barrel);
    this.group.name = 'torre';
  }
}
