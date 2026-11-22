/**
 * Roda de formas (M1.2, ADR 0012; GDD §5 e §9). Quatro setores: CARRO (cima), MOTO (direita),
 * HOVER (baixo) e TANQUE (esquerda). Formas que ainda não existem aparecem apagadas ("em breve").
 * No controle e no mouse a escolha vem da direção; no toque, tocando no setor.
 */
export const WHEEL_FORMS = ['car', 'bike', 'hover', 'tank'] as const;
export type WheelForm = (typeof WHEEL_FORMS)[number];
const LABELS: Record<WheelForm, string> = { car: 'CARRO', bike: 'MOTO', hover: 'HOVER', tank: 'TANQUE' };

/** Setor da direção (x para a direita, y para baixo, como na tela): 0 cima, 1 direita, 2 baixo, 3 esquerda; −1 no centro. */
export function sectorOf(x: number, y: number, dead = 0.35): number {
  if (Math.hypot(x, y) < dead) return -1;
  const a = Math.atan2(x, -y); // 0 = cima, +90° = direita
  return ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
}

export class FormWheel {
  readonly el = document.createElement('div');
  private slots: HTMLButtonElement[] = [];
  open = false;
  selected = -1;

  constructor(parent: HTMLElement, onPick: (f: WheelForm) => void) {
    this.el.className = 'form-wheel';
    this.el.hidden = true;
    WHEEL_FORMS.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = `fw-slot s${i}`;
      b.innerHTML = `<b>${LABELS[f]}</b><span>${i + 1}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!b.disabled) onPick(f); });
      this.slots.push(b);
      this.el.appendChild(b);
    });
    const hub = document.createElement('div');
    hub.className = 'fw-hub';
    this.el.appendChild(hub);
    parent.appendChild(this.el);
  }

  show(current: string, available: readonly string[]): void {
    this.open = true;
    this.selected = -1;
    this.el.hidden = false;
    WHEEL_FORMS.forEach((f, i) => {
      const b = this.slots[i];
      b.disabled = !available.includes(f);
      b.classList.toggle('current', f === current);
      b.title = b.disabled ? 'em breve' : '';
      b.querySelector('span')!.textContent = b.disabled ? 'em breve' : String(i + 1);
    });
    this.highlight(-1);
  }

  highlight(i: number): void {
    this.selected = i >= 0 && !this.slots[i].disabled ? i : -1;
    this.slots.forEach((b, k) => b.classList.toggle('sel', k === this.selected));
  }

  hide(): void { this.open = false; this.el.hidden = true; }
}
