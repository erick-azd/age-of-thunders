import * as THREE from 'three';
import { type DummyPose, type Rig, writePose } from '../procgen/dummy';

/**
 * Vista do Dummy: uma malha só (1 draw call) com os vértices transformados na CPU a cada pose
 * (`writePose`). Com material chapado, as normais saem do próprio triângulo no shader.
 */
export class DummyView {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;

  constructor(readonly rig: Rig, material: THREE.Material) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(rig.vertexCount * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('color', new THREE.Float32BufferAttribute(rig.colors, 3));
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'dummy';
  }

  setPose(pose: DummyPose): void {
    writePose(this.rig, pose, this.pos.array as Float32Array);
    this.pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }
}
