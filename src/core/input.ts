import type { CarInput } from '../sim/car';

/**
 * Entrada: gamepad (mapeamento "standard") e teclado. Devolve a entrada da sim (pura) a cada passo.
 * Gamepad: analógico esquerdo X = direção, RT (7) = acelerar, LT (6) = freio/ré, B (1) = freio de mão,
 *          A (0) = confirmar.
 * Teclado: W/↑ acelerar, S/↓ freio/ré, A/D ou ←/→ direção, Espaço = freio de mão, Enter = confirmar.
 */
export class Input {
  private keys = new Set<string>();
  private prevA = false;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'F1' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  read(): CarInput {
    const k = this.keys, p = this.pad();
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    let steer = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let throttle = k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    let brake = k.has('ArrowDown') || k.has('KeyS') ? 1 : 0;
    let handbrake = k.has('Space');
    if (p) {
      steer = steer || dz(p.axes[0] ?? 0);
      throttle = Math.max(throttle, p.buttons[7]?.value ?? 0);
      brake = Math.max(brake, p.buttons[6]?.value ?? 0);
      handbrake = handbrake || !!p.buttons[1]?.pressed;
    }
    return { steer, throttle, brake, handbrake };
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
