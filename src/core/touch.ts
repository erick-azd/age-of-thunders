/**
 * Controles de toque (M0.7b, ADR 0011; GDD §5). Usa Pointer Events, então funciona com dedo,
 * caneta e mouse (o smoke testa com o mouse).
 * - Joystick à esquerda: para os lados vira, para cima acelera, para baixo freia e dá ré.
 * - Arrastar na metade direita: gira a mira (como o mouse).
 * - Botões à direita: TIRO (segurar), DERRAPAR (segurar) e FORMA (toque).
 * - Tocar na tela de título começa o jogo.
 */
export class TouchControls {
  readonly el = document.createElement('div');
  steer = 0;
  throttle = 0;
  brake = 0;
  handbrake = false;
  fire = false;
  private formEdge = false;
  private tapEdge = false;
  private aimDX = 0;
  private aimDY = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="touch-aim"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="touch-btn fire">TIRO</button>
      <button class="touch-btn drift">DERRAPAR</button>
      <button class="touch-btn form">FORMA</button>`;
    parent.appendChild(this.el);
    const q = (s: string) => this.el.querySelector(s) as HTMLElement;
    this.stick(q('.touch-stick'), q('.touch-knob'));
    this.aim(q('.touch-aim'));
    this.hold(q('.fire'), (v) => { this.fire = v; });
    this.hold(q('.drift'), (v) => { this.handbrake = v; });
    this.hold(q('.form'), (v) => { if (v) this.formEdge = true; });
    // Qualquer toque conta como "começar" na tela de título.
    this.el.addEventListener('pointerdown', () => { this.tapEdge = true; });
  }

  private stick(base: HTMLElement, knob: HTMLElement): void {
    const R = 60;
    let id = -1, cx = 0, cy = 0;
    const set = (x: number, y: number) => {
      const d = Math.hypot(x, y), k = d > R ? R / d : 1, nx = (x * k) / R, ny = (y * k) / R;
      knob.style.transform = `translate(${x * k}px, ${y * k}px)`;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      this.steer = dz(nx);
      this.throttle = Math.max(0, dz(-ny));
      this.brake = Math.max(0, dz(ny));
    };
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      base.setPointerCapture(id);
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      set(e.clientX - cx, e.clientY - cy);
      e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; set(0, 0); };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
  }

  private aim(area: HTMLElement): void {
    let id = -1, lx = 0, ly = 0;
    area.addEventListener('pointerdown', (e) => { id = e.pointerId; area.setPointerCapture(id); lx = e.clientX; ly = e.clientY; e.preventDefault(); });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.aimDX += e.clientX - lx; this.aimDY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    });
    const up = (e: PointerEvent) => { if (e.pointerId === id) id = -1; };
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  }

  private hold(btn: HTMLElement, set: (v: boolean) => void): void {
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); btn.classList.add('on'); set(true); e.preventDefault(); });
    const up = () => { btn.classList.remove('on'); set(false); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Toque fora dos controles (na tela de jogo): conta como "começar" no título. */
  tap(): void { this.tapEdge = true; }

  consumeForm(): boolean { const v = this.formEdge; this.formEdge = false; return v; }
  consumeTap(): boolean { const v = this.tapEdge; this.tapEdge = false; return v; }
  consumeAim(): { dx: number; dy: number } { const v = { dx: this.aimDX, dy: this.aimDY }; this.aimDX = this.aimDY = 0; return v; }
}
