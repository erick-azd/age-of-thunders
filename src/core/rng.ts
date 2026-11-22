/** RNG determinístico (mulberry32). Use sempre este em vez de Math.random na simulação e na geração. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RNG da simulação como dado (mesma sequência do mulberry32): o estado é um número, então a partida
 * inteira pode ser copiada, enviada pela rede e rebobinada (requisito do servidor do online).
 */
export interface RngState { s: number }
export const rngState = (seed: number): RngState => ({ s: seed >>> 0 });
export function nextRandom(st: RngState): number {
  st.s = (st.s + 0x6d2b79f5) >>> 0;
  let t = st.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Hash inteiro 2D → [0, 1). Útil para variação estável por célula. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
