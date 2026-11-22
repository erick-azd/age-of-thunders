import * as THREE from 'three';

/**
 * Céu por pixel numa cúpula que segue a câmera (ADR 0005 do Polygonizer): a cor sai da elevação
 * da direção de visão, com degradê suave (smoothstep) e um dithering leve contra faixas.
 */
export function createSky(zenith: string, horizon: string, ground: string): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(zenith) },
      uHorizon: { value: new THREE.Color(horizon) },
      uGround: { value: new THREE.Color(ground) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
      varying vec3 vDir;
      void main() {
        float e = normalize(vDir).y;
        vec3 c = e >= 0.0 ? mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(e, 0.8))) : mix(uHorizon, uGround, smoothstep(0.0, 0.025, -e));
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        gl_FragColor = vec4(c + n / 255.0, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
