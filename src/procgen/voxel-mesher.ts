import { VOXEL, type VoxelGrid } from '../sim/voxels';
import type { MeshData, RGB } from './mesh-builder';

/** Marca "sólido fora do grid" (abaixo de y = 0): suprime as faces de baixo, que ficam enterradas. */
const BELOW = 255;

/**
 * Malha de uma coluna do grid (região [x0, x0+w) × [0, topo) × [z0, z0+d)) com faces fundidas
 * ("greedy meshing"): só desenha faces entre sólido e vazio, e junta retângulos vizinhos do mesmo
 * material num quad só. Puro (sem Three.js); devolve triângulos não indexados com cor por face.
 * Os vizinhos fora da região são lidos do grid, então colunas lado a lado não desenham faces internas.
 */
export function meshRegion(g: VoxelGrid, x0: number, z0: number, w: number, d: number, colors: RGB[], top = g.sy, glowTable?: number[]): MeshData {
  const positions: number[] = [];
  const out: number[] = [];
  const glow: number[] | undefined = glowTable ? [] : undefined;
  const H = Math.min(top, g.sy);
  if (H <= 0) return { positions, colors: out, glow };

  // Cópia densa da região com 1 voxel de borda (leitura rápida no laço).
  const px = w + 2, py = H + 2, pz = d + 2;
  const pad = new Uint8Array(px * py * pz);
  for (let y = -1; y <= H; y++) for (let z = -1; z <= d; z++) for (let x = -1; x <= w; x++) {
    pad[((y + 1) * pz + (z + 1)) * px + (x + 1)] = y < 0 ? BELOW : g.get(x0 + x, y, z0 + z);
  }
  const at = (x: number, y: number, z: number) => pad[((y + 1) * pz + (z + 1)) * px + (x + 1)];

  const dims = [w, H, d];
  const ox = g.origin.x + x0 * VOXEL, oy = g.origin.y, oz = g.origin.z + z0 * VOXEL;
  const x = [0, 0, 0], q = [0, 0, 0];

  for (let dd = 0; dd < 3; dd++) {
    const u = (dd + 1) % 3, v = (dd + 2) % 3;
    q[0] = q[1] = q[2] = 0;
    q[dd] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (x[dd] = -1; x[dd] < dims[dd];) {
      // Máscara do plano entre a camada x[dd] e a seguinte: +material (face de a, normal +dd),
      // −material (face de b, normal −dd), 0 sem face. Só entram faces de voxels desta região.
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
        const a = at(x[0], x[1], x[2]), b = at(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
        if (a && !b && x[dd] >= 0) mask[n] = a;
        else if (b && !a && x[dd] < dims[dd] - 1) mask[n] = -b;
        else mask[n] = 0;
      }
      x[dd]++;
      // Junta retângulos iguais.
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const c = mask[n];
          if (c === 0) { i++; n++; continue; }
          let wq = 1;
          while (i + wq < dims[u] && mask[n + wq] === c) wq++;
          let hq = 1;
          grow: for (; j + hq < dims[v]; hq++) {
            for (let k = 0; k < wq; k++) if (mask[n + k + hq * dims[u]] !== c) break grow;
          }
          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0], dv = [0, 0, 0];
          du[u] = wq;
          dv[v] = hq;
          const P = (a: number, b: number): [number, number, number] => [
            ox + (x[0] + du[0] * a + dv[0] * b) * VOXEL,
            oy + (x[1] + du[1] * a + dv[1] * b) * VOXEL,
            oz + (x[2] + du[2] * a + dv[2] * b) * VOXEL,
          ];
          const p0 = P(0, 0), p1 = P(1, 0), p2 = P(1, 1), p3 = P(0, 1);
          // e_u × e_v = e_dd: a ordem p0 → p1 → p2 dá normal +dd.
          const tris = c > 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
          const col = colors[Math.abs(c)] ?? [1, 0, 1];
          const gl = glowTable?.[Math.abs(c)] ?? 0;
          for (const p of tris) { positions.push(p[0], p[1], p[2]); out.push(col[0], col[1], col[2]); glow?.push(gl); }
          for (let l = 0; l < hq; l++) for (let k = 0; k < wq; k++) mask[n + k + l * dims[u]] = 0;
          i += wq;
          n += wq;
        }
      }
    }
  }
  return { positions, colors: out, glow };
}
