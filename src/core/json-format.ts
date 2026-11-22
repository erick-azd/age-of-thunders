// JSON formatado para os arquivos de data/ (M1.1): usado pelo endpoint do editor de voo
// (tools/dev-tools.ts) e pela exportação no jogo, para os dois gerarem o mesmo texto.
const isPrim = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isPrimArray = (v: unknown) => Array.isArray(v) && v.every(isPrim);

/**
 * JSON com 2 espaços, na ordem de campos do esquema (a ordem do objeto recebido).
 * Listas de primitivos e objetos curtos de primitivos ficam numa linha só, como nos
 * arquivos escritos à mão (`"rings": [{ "x": 100, "z": 1250, ... }]`).
 */
export function formatJson(value: unknown): string {
  const pad = (n: number) => '  '.repeat(n);
  const fmt = (v: unknown, ind: number): string => {
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (v.every(isPrim)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      return `[\n${v.map((x) => pad(ind + 1) + fmt(x, ind + 1)).join(',\n')}\n${pad(ind)}]`;
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
      if (!entries.length) return '{}';
      if (entries.every(([, x]) => isPrim(x) || isPrimArray(x))) {
        const line = `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${fmt(x, 0)}`).join(', ')} }`;
        if (line.length + ind * 2 <= 110) return line;
      }
      return `{\n${entries.map(([k, x]) => `${pad(ind + 1)}${JSON.stringify(k)}: ${fmt(x, ind + 1)}`).join(',\n')}\n${pad(ind)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(value, 0)}\n`;
}
