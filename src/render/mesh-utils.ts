import * as THREE from 'three';
import type { MeshData } from '../procgen/mesh-builder';

/**
 * As cores dos dados são sRGB (como no editor de imagem); o Three.js espera cor de vértice linear.
 * Sem esta conversão tudo fica lavado e pouco saturado (ADR 0005).
 */
export function linearColors(c: ArrayLike<number>): Float32Array {
  const out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) { const v = c[i]; out[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return out;
}

/** Converte MeshData neutro (procgen) em BufferGeometry com cor por vértice e normais chapadas. */
export function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(linearColors(m.colors), 3));
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
