import * as THREE from 'three';
import { type DummyPose, type Rig, lerpPose } from '../procgen/dummy';
import { hexToRgb } from '../procgen/mesh-builder';
import {
  type Piece, type PiecePair, UNIT_BOX, UNIT_CYL, UNIT_WHEEL, type UnitGeometry, type VehicleShape,
  ease, morphPiece, morphWheel, pairPieces,
} from '../procgen/vehicle-shape';
import type { Form } from '../sim/vehicle';
import { DummyView } from './dummy-view';

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/**
 * Vista do veículo que se transforma (ADR 0008): a carcaça é uma malha só (1 draw call) com as
 * peças transformadas na CPU; as rodas são instanciadas (1) e o Dummy é outra malha (1).
 * `setMorph` recalcula só quando o progresso muda; parado, não custa nada por quadro.
 */
export class VehicleView {
  readonly group = new THREE.Group();
  private pairs: PiecePair[];
  private units: UnitGeometry[];
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private glow: THREE.BufferAttribute;
  private wheels: THREE.InstancedMesh;
  private u = -1;
  private wheelNow: { pos: number[]; radius: number; width: number }[] = [];
  private steerWheels = 2;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  readonly dummy: DummyView;

  /** `car` e `bike` são as formas; a transformação vai de uma à outra (u = 0 carro, 1 moto). */
  constructor(readonly car: VehicleShape, readonly bike: VehicleShape, rig: Rig, private poses: Record<Form, DummyPose>, material: THREE.Material, wheelColors: { tire: string; hub: string }) {
    this.group.rotation.order = 'YXZ';
    this.pairs = pairPieces(car.pieces, bike.pieces);
    this.units = this.pairs.map((p) => (p.a.kind === 'cyl' ? UNIT_CYL : UNIT_BOX));
    const n = this.units.reduce((s, g) => s + g.positions.length / 3, 0);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.glow = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('color', this.col);
    g.setAttribute('glow', this.glow);
    const body = new THREE.Mesh(g, material);
    body.name = 'carcaca';
    body.frustumCulled = false;

    const wg = new THREE.BufferGeometry();
    const tire = hexToRgb(wheelColors.tire).map(toLinear), hub = hexToRgb(wheelColors.hub).map(toLinear);
    const wc: number[] = [];
    UNIT_WHEEL.slot.forEach((s, i) => { const c = s === 0 ? tire : hub, k = UNIT_WHEEL.shade[i]; wc.push(c[0] * k, c[1] * k, c[2] * k); });
    wg.setAttribute('position', new THREE.Float32BufferAttribute(UNIT_WHEEL.positions, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    this.wheels = new THREE.InstancedMesh(wg, material, 4);
    this.wheels.name = 'rodas';
    this.wheels.frustumCulled = false;

    this.dummy = new DummyView(rig, material);
    this.group.add(body, this.wheels, this.dummy.mesh);
    this.setMorph('car', 'car', 1);
  }

  /** Progresso da transformação de `from` para `to` (t de 0 a 1). */
  setMorph(from: Form, to: Form, t: number): void {
    const u = from === to ? (to === 'car' ? 0 : 1) : to === 'bike' ? t : 1 - t;
    if (u === this.u) return;
    this.u = u;
    // Carcaça
    const P = this.pos.array as Float32Array, Cc = this.col.array as Float32Array, Gl = this.glow.array as Float32Array;
    let o = 0;
    this.pairs.forEach((pr, i) => {
      const pc = morphPiece(pr, u), unit = this.units[i];
      this.writePiece(pc, unit, P, Cc, Gl, o);
      o += unit.positions.length / 3;
    });
    this.pos.needsUpdate = this.col.needsUpdate = this.glow.needsUpdate = true;
    this.body().geometry.computeVertexNormals();
    // Rodas, assento e pose do Dummy
    this.wheelNow = this.car.wheels.map((w, i) => {
      const r = morphWheel(w, this.bike.wheels[i], u);
      return { pos: r.pos, radius: r.radius, width: r.width };
    });
    this.steerWheels = u < 0.5 ? this.car.steerWheels : this.bike.steerWheels;
    const e = ease(u);
    const seat = this.car.seat.map((c, k) => c + (this.bike.seat[k] - c) * e);
    this.dummy.mesh.position.set(seat[0], seat[1], seat[2]);
    this.dummy.setPose(lerpPose(this.poses.car, this.poses.bike, e));
  }

  private body(): THREE.Mesh { return this.group.children[0] as THREE.Mesh; }

  private writePiece(p: Piece, g: UnitGeometry, P: Float32Array, C: Float32Array, Gl: Float32Array, start: number): void {
    // M = T · Rx · Rz · Ry · S
    const [rx, ry, rz] = p.rot, [sx, sy, sz] = p.size;
    const cx = Math.cos(rx), sxn = Math.sin(rx), cz = Math.cos(rz), szn = Math.sin(rz), cy = Math.cos(ry), syn = Math.sin(ry);
    // Rx·Rz
    const a = [cz, -szn, 0, cx * szn, cx * cz, -sxn, sxn * szn, sxn * cz, cx];
    // (Rx·Rz)·Ry
    const r = [
      a[0] * cy - a[2] * syn, a[1], a[0] * syn + a[2] * cy,
      a[3] * cy - a[5] * syn, a[4], a[3] * syn + a[5] * cy,
      a[6] * cy - a[8] * syn, a[7], a[6] * syn + a[8] * cy,
    ];
    const lin = p.colors.map((c) => c.map(toLinear));
    for (let i = 0, v = start; i < g.positions.length; i += 3, v++) {
      const x = g.positions[i] * sx, y = g.positions[i + 1] * sy, zz = g.positions[i + 2] * sz;
      P[v * 3] = r[0] * x + r[1] * y + r[2] * zz + p.pos[0];
      P[v * 3 + 1] = r[3] * x + r[4] * y + r[5] * zz + p.pos[1];
      P[v * 3 + 2] = r[6] * x + r[7] * y + r[8] * zz + p.pos[2];
      const c = lin[g.slot[i / 3]], k = g.shade[i / 3];
      C[v * 3] = c[0] * k; C[v * 3 + 1] = c[1] * k; C[v * 3 + 2] = c[2] * k;
      Gl[v] = p.glow;
    }
  }

  /** Posição do chão sob o centro, rumo, inclinações, giro das rodas e esterço (radianos). */
  update(x: number, y: number, z: number, heading: number, pitch: number, roll: number, spin: number, steer: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, -heading, -roll);
    this.wheelNow.forEach((w, i) => {
      this.e.set(-spin, i < this.steerWheels ? -steer : 0, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(w.pos[0], w.pos[1], w.pos[2]), this.q, this.sc.set(w.width, w.radius, w.radius));
      this.wheels.setMatrixAt(i, this.m);
    });
    this.wheels.instanceMatrix.needsUpdate = true;
  }
}
