import { MeshBuilder, type RGB, hexToRgb } from './mesh-builder';

/**
 * Carcaça "carro" (M0.3, ADR 0006): buggy arcade de cockpit aberto, para o Dummy aparecer sentado.
 * Mesma paleta do Dummy (branco, azul, laranja, cinza, escuro, brilho). Design próprio.
 * Espaço do carro: chão em y = 0, frente em −Z, 4,2 × 2 m. As rodas são uma peça à parte
 * (instanciada 4 vezes) para girar e esterçar.
 */
export interface CarPalette { white: string; armor: string; accent: string; frame: string; dark: string; glow: string }

export interface CarModel {
  body: { positions: number[]; colors: number[]; glow: number[] };
  wheel: { positions: number[]; colors: number[]; glow: number[] };
  /** Centro de cada roda (x, y, z) no espaço do carro: dianteiras primeiro. */
  wheels: [number, number, number][];
  wheelRadius: number;
  /** Onde fica a pelve do Dummy sentado (ponto do assento). */
  seat: [number, number, number];
}

export function buildCarModel(pal: CarPalette): CarModel {
  const W = hexToRgb(pal.white), A = hexToRgb(pal.armor), O = hexToRgb(pal.accent), F = hexToRgb(pal.frame), K = hexToRgb(pal.dark), G = hexToRgb(pal.glow);
  const b = new MeshBuilder(), g = new MeshBuilder();
  const box = (m: MeshBuilder, x: number, y: number, z: number, w: number, h: number, d: number, c: RGB | [RGB, RGB, RGB], rx = 0) =>
    m.push().translate(x, y, z).rotateX(rx).box(w, h, d, c).pop();

  // Chassi e assoalho
  box(b, 0, 0.42, 0.1, 1.5, 0.22, 3.6, [F, K, F]);
  // Bico em cunha (frente em −Z)
  box(b, 0, 0.62, -1.45, 1.55, 0.3, 1.1, [W, K, W], 0.18);
  box(b, 0, 0.5, -2.0, 1.7, 0.2, 0.25, [A, K, A]); // para-choque
  box(b, 0, 0.78, -0.95, 1.2, 0.18, 0.5, [A, K, A], -0.25); // capô
  // Laterais (pontões) com faixa laranja
  for (const s of [-1, 1]) {
    box(b, 0.72 * s, 0.68, 0.15, 0.36, 0.44, 2.3, [A, K, A]);
    box(b, 0.91 * s, 0.7, 0.15, 0.03, 0.1, 1.9, O);
    // Para-lamas sobre as rodas
    box(b, 0.98 * s, 0.98, -1.3, 0.42, 0.08, 1.0, [W, K, W]);
    box(b, 0.98 * s, 0.98, 1.3, 0.42, 0.08, 1.0, [W, K, W]);
  }
  // Cockpit aberto: encosto, santantônio e painel
  box(b, 0, 0.95, 0.75, 0.9, 0.9, 0.16, [F, K, F], -0.15); // encosto
  box(b, 0, 0.55, 0.25, 0.8, 0.12, 0.9, F); // assento
  for (const s of [-1, 1]) box(b, 0.5 * s, 1.35, 0.95, 0.1, 1.0, 0.1, [K, K, K]); // colunas do santantônio
  box(b, 0, 1.85, 0.95, 1.1, 0.1, 0.12, [W, K, W]); // barra do santantônio
  box(b, 0, 0.98, -0.45, 1.0, 0.22, 0.2, [K, K, K]); // painel
  b.push().translate(0, 1.13, -0.28).rotateX(0.5).torus(0.19, 0.03, 12, 4, K).pop(); // volante
  // Traseira: motor, aerofólio e escapamentos
  box(b, 0, 0.8, 1.55, 1.3, 0.5, 0.8, [F, K, F]);
  for (const s of [-1, 1]) box(b, 0.55 * s, 1.25, 1.85, 0.08, 0.5, 0.25, [K, K, K]);
  box(b, 0, 1.5, 1.9, 1.9, 0.08, 0.5, [O, K, O]);
  for (const s of [-1, 1]) b.push().translate(0.3 * s, 0.85, 2.0).rotateX(Math.PI / 2).cylinder(0.08, 0.08, 0.2, 6, F).pop();
  // Luzes: faróis brancos, lanternas vermelhas e faixa verde-ciano
  for (const s of [-1, 1]) {
    box(g, 0.55 * s, 0.62, -2.13, 0.3, 0.1, 0.02, hexToRgb('#f4f7ff'));
    box(g, 0.45 * s, 0.85, 1.96, 0.25, 0.08, 0.02, hexToRgb('#ff3b30'));
    box(g, 0.91 * s, 0.86, 0.15, 0.02, 0.04, 1.6, G);
  }

  const body = b.build(), lit = g.build();
  const glow = [...body.positions.map(() => 0).filter((_, i) => i % 3 === 0), ...lit.positions.map(() => 1).filter((_, i) => i % 3 === 0)];

  // Roda: pneu octogonal largo com cubo laranja (eixo em X).
  const r = 0.42, wb = new MeshBuilder();
  wb.push().rotateZ(Math.PI / 2).translate(0, -0.17, 0).cylinder(r, r, 0.34, 10, K, F).pop();
  wb.push().rotateZ(Math.PI / 2).translate(0, -0.18, 0).cylinder(0.16, 0.16, 0.36, 6, O).pop();
  const wheel = wb.build();

  return {
    body: { positions: [...body.positions, ...lit.positions], colors: [...body.colors, ...lit.colors], glow },
    wheel: { positions: wheel.positions, colors: wheel.colors, glow: wheel.positions.map(() => 0).filter((_, i) => i % 3 === 0) },
    wheels: [[-0.98, r, -1.3], [0.98, r, -1.3], [-0.98, r, 1.3], [0.98, r, 1.3]],
    wheelRadius: r,
    seat: [0, 0.61, 0.3],
  };
}
