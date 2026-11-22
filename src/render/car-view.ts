import * as THREE from 'three';
import type { CarModel } from '../procgen/car-model';
import type { DummyPose, Rig } from '../procgen/dummy';
import { DummyView } from './dummy-view';
import { linearColors } from './mesh-utils';

/**
 * Vista de um veículo de chão (carro ou moto): carroceria (1 draw call), rodas instanciadas (1) e o
 * Dummy sentado ou montado (1).
 * Recebe o estado já interpolado; não conhece a física.
 */
export class CarView {
  readonly group = new THREE.Group();
  private wheels: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private one = new THREE.Vector3(1, 1, 1);
  readonly dummy: DummyView;

  constructor(readonly model: CarModel, rig: Rig, pose: DummyPose, material: THREE.Material) {
    this.group.rotation.order = 'YXZ';
    const geo = (d: { positions: number[]; colors: number[]; glow: number[] }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(linearColors(d.colors), 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(d.glow, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    };
    const body = new THREE.Mesh(geo(model.body), material);
    body.name = 'carro';
    this.wheels = new THREE.InstancedMesh(geo(model.wheel), material, model.wheels.length);
    this.wheels.name = 'rodas';
    this.wheels.frustumCulled = false;
    this.dummy = new DummyView(rig, material);
    this.dummy.setPose(pose);
    this.dummy.mesh.position.set(...model.seat);
    this.group.add(body, this.wheels, this.dummy.mesh);
  }

  /** Posição do chão sob o centro, rumo, inclinações, giro das rodas e esterço (radianos). */
  update(x: number, y: number, z: number, heading: number, pitch: number, roll: number, spin: number, steer: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(pitch, -heading, -roll);
    this.model.wheels.forEach((w, i) => {
      this.e.set(-spin, i < this.model.steerWheels ? -steer : 0, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(w[0], w[1], w[2]), this.q, this.one);
      this.wheels.setMatrixAt(i, this.m);
    });
    this.wheels.instanceMatrix.needsUpdate = true;
  }
}
