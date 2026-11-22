import * as THREE from 'three';
import type { MeshData } from '../procgen/mesh-builder';

/** Converte MeshData neutro (procgen) em BufferGeometry com cor por vértice e normais chapadas. */
export function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.colors, 3));
  if (m.glow) g.setAttribute('glow', new THREE.Float32BufferAttribute(m.glow, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Material padrão do estilo "Arcade 93": Lambert, cor por vértice, flat shading. */
export function flatMaterial(opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
  // Atributo opcional `glow` (0 a 1): soma a cor do vértice como emissiva (faixas de luz sem draw call
  // extra, ADR 0003). Geometrias sem o atributo leem 0 e ficam iguais.
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * 1.4;');
  };
  return m;
}
