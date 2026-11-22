/**
 * Editor F1 gerado das specs (ADR 0001 do Polygonizer): cada spec vira um controle deslizante que
 * edita o objeto de parâmetros ao vivo. Parâmetro novo = esquema Zod + JSON + spec, sem tocar aqui.
 * "Salvar" grava o JSON em data/ pelo servidor de desenvolvimento (npm run dev).
 */
export interface Spec { key: string; label: string; min: number; max: number; step: number; unit?: string }
export interface Section { title: string; specs: readonly Spec[]; values: Record<string, number>; file?: string; onChange?: () => void }

export class EditorPanel {
  readonly el = document.createElement('div');

  constructor(parent: HTMLElement, private sections: Section[]) {
    this.el.className = 'editor';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.render();
  }

  get open(): boolean { return !this.el.hidden; }
  toggle(): void { this.el.hidden = !this.el.hidden; }

  private render(): void {
    this.el.innerHTML = '<h2>Editor (F1)</h2>';
    for (const s of this.sections) {
      const box = document.createElement('section');
      box.innerHTML = `<h3>${s.title}</h3>`;
      for (const spec of s.specs) {
        const row = document.createElement('label');
        const val = document.createElement('span');
        const input = document.createElement('input');
        Object.assign(input, { type: 'range', min: String(spec.min), max: String(spec.max), step: String(spec.step), value: String(s.values[spec.key]) });
        const show = () => { val.textContent = `${s.values[spec.key]}${spec.unit ? ` ${spec.unit}` : ''}`; };
        input.addEventListener('input', () => { s.values[spec.key] = Number(input.value); show(); s.onChange?.(); });
        row.append(spec.label, input, val);
        show();
        box.appendChild(row);
      }
      if (s.file) {
        const save = document.createElement('button');
        save.textContent = `Salvar ${s.file}`;
        save.addEventListener('click', async () => {
          const r = await fetch('/__editor/save', { method: 'POST', body: JSON.stringify({ path: s.file, data: s.values }) }).catch(() => null);
          save.textContent = r?.ok ? 'Salvo' : 'Só no npm run dev';
        });
        box.appendChild(save);
      }
      this.el.appendChild(box);
    }
  }
}
