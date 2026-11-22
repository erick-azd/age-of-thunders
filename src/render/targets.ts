import * as THREE from 'three';
import { MeshBuilder, hexToRgb } from '../procgen/mesh-builder';
import type { Target } from '../sim/match';
import { toGeometry } from './mesh-utils';

/**
 * Alvos (M0.7, ADR 0010): torres-sinalizadoras de 2,6 m na quina da calçada, com base de perigo,
 * coluna e um anel luminoso que gira. Todos num InstancedMesh (1 draw call); destruído = escondido.
 */
export class Targets {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Vector3(0, 0, 0);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(material: THREE.Material, pal: { white: string; armor: string; accent: string; frame: string; dark: string; glow: string }, readonly max = 40) {
    const Y = hexToRgb('#f5b81c'), K = hexToRgb(pal.dark), F = hexToRgb(pal.frame), W = hexToRgb(pal.white), R = hexToRgb('#ff3b30');
    const b = new MeshBuilder(), g = new MeshBuilder();
    b.push().translate(0, 0.15, 0).box(1.4, 0.3, 1.4, [Y, K, Y]).pop();
    for (const [x, z] of [[-0.45, -0.45], [0.45, 0.45]]) b.push().translate(x, 0.32, z).box(0.3, 0.04, 0.3, K).pop();
    b.push().translate(0, 0.3, 0).cylinder(0.32, 0.26, 1.7, 8, F, K).pop();
    b.push().translate(0, 2.0, 0).cylinder(0.55, 0.55, 0.12, 8, W, W).pop();
    b.push().translate(0, 2.12, 0).cylinder(0.42, 0.0, 0.45, 8, R, R).pop();
    for (let i = 0; i < 4; i++) g.push().rotateY((i * Math.PI) / 2).translate(0, 1.55, 0.5).box(0.32, 0.16, 0.06, hexToRgb(pal.glow)).pop();
    const s = b.build(), l = g.build();
    const geo = toGeometry({
      positions: [...s.positions, ...l.positions], colors: [...s.colors, ...l.colors],
      glow: [...new Array(s.positions.length / 3).fill(0), ...new Array(l.positions.length / 3).fill(1)],
    });
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'alvos';
  }

  update(list: readonly Target[], time: number): void {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) {
      const t = list[i];
      this.q.setFromAxisAngle(this.up, time * 1.5 + i);
      this.m.compose(this.v.set(t.x, t.y, t.z), this.q, t.respawnT > 0 ? this.zero : this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
