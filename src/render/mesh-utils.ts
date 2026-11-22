import * as THREE from 'three';
import type { MeshData } from '../procgen/mesh-builder';

/** Converte MeshData neutro (procgen) em BufferGeometry com cor por vértice e normais chapadas. */
export function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Material padrão do estilo "Arcade 93": Lambert, cor por vértice, flat shading. */
export function flatMaterial(opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
}
