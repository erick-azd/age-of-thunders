import type { PlayerInput } from '../sim/player';

/**
 * Entrada: gamepad (mapeamento "standard") e teclado. Devolve a entrada da sim (pura) a cada passo.
 * Gamepad: analógico esquerdo X = virar, Y = subir/descer, RT (botão 7) = acelerar, A (0) = confirmar.
 * Teclado: setas/WASD, Espaço = acelerar, Enter = confirmar.
 */
export class Input {
  private keys = new Set<string>();
  private prevA = false;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'F1') e.preventDefault(); });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  read(): PlayerInput {
    const k = this.keys, p = this.pad();
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    let steer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let climb = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    let throttle = k.has('Space') ? 1 : 0;
    if (p) {
      steer = steer || dz(p.axes[0] ?? 0);
      climb = climb || -dz(p.axes[1] ?? 0);
      throttle = Math.max(throttle, p.buttons[7]?.value ?? 0);
    }
    return { steer, throttle, climb };
  }

  /** "A" ou Enter acabou de ser apertado (borda de subida). */
  confirmPressed(): boolean {
    const now = this.keys.has('Enter') || !!this.pad()?.buttons[0]?.pressed;
    const edge = now && !this.prevA;
    this.prevA = now;
    return edge;
  }

  has(code: string): boolean { return this.keys.has(code); }
}
