import type { MatchState } from '../sim/match';

/**
 * HUD arcade (M0.7, ADR 0010; GDD §9): barras grandes de vida no topo (você à esquerda, o
 * inimigo à direita), cronômetro grande no meio, forma e velocidade embaixo à esquerda, placar
 * embaixo à direita, mira no centro. Tudo em DOM (0 draw call). Estilo nosso, inspirado nos
 * arcades de mecha dos anos 90.
 */
export class Hud {
  readonly el = document.createElement('div');
  private pFill: HTMLDivElement;
  private eFill: HTMLDivElement;
  private pNum: HTMLSpanElement;
  private eNum: HTMLSpanElement;
  private eBar: HTMLDivElement;
  private timer: HTMLDivElement;
  private form: HTMLDivElement;
  private score: HTMLDivElement;
  private banner: HTMLDivElement;
  private cross: HTMLDivElement;
  private hitT = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'hud-arcade';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-bar player"><span class="hud-tag">VOCÊ</span><div class="hud-track"><div class="hud-fill"></div></div><span class="hud-num"></span></div>
        <div class="hud-timer"></div>
        <div class="hud-bar enemy"><span class="hud-num"></span><div class="hud-track"><div class="hud-fill"></div></div><span class="hud-tag">INIMIGO</span></div>
      </div>
      <div class="hud-form"></div>
      <div class="hud-score"></div>
      <div class="hud-banner"></div>
      <div class="crosshair"></div>`;
    parent.appendChild(this.el);
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as unknown as T;
    this.pFill = q('.player .hud-fill');
    this.eFill = q('.enemy .hud-fill');
    this.pNum = q('.player .hud-num');
    this.eNum = q('.enemy .hud-num');
    this.eBar = q('.hud-bar.enemy');
    this.timer = q('.hud-timer');
    this.form = q('.hud-form');
    this.score = q('.hud-score');
    this.banner = q('.hud-banner');
    this.cross = q('.crosshair');
  }

  /** Acerto do jogador: a mira pisca em laranja. */
  hitMarker(): void { this.hitT = 0.18; }

  update(visible: boolean, m: MatchState, speed: number, targetCount: number): void {
    this.el.hidden = !visible;
    if (!visible) return;
    const p = m.fighters[0], e = m.fighters[1];
    const pct = (hp: number, max: number) => `${Math.max(0, Math.min(100, (hp / max) * 100)).toFixed(1)}%`;
    this.pFill.style.width = pct(p.hp, p.maxHp);
    this.pNum.textContent = String(Math.max(0, Math.ceil(p.hp))).padStart(3, '0');
    this.pFill.classList.toggle('hurt', p.hurtT < 0.25);
    if (e) {
      this.eBar.hidden = false;
      this.eFill.style.width = pct(e.hp, e.maxHp);
      this.eNum.textContent = String(Math.max(0, Math.ceil(e.hp))).padStart(3, '0');
      this.eFill.classList.toggle('hurt', e.hurtT < 0.25);
    } else this.eBar.hidden = true;
    const t = m.time, mm = Math.floor(t / 60), ss = Math.floor(t % 60), cc = Math.floor((t % 1) * 100);
    this.timer.textContent = `${String(mm).padStart(2, '0')}'${String(ss).padStart(2, '0')}"${String(cc).padStart(2, '0')}`;
    const v = p.veh, form = v.morphT < 1 ? 'TRANSFORMANDO' : v.form === 'car' ? 'CARRO' : 'MOTO';
    this.form.innerHTML = `<b>${form}</b><span>${Math.abs(speed * 3.6).toFixed(0).padStart(3, '0')} km/h</span>`;
    const alive = m.targets.filter((x) => x.respawnT <= 0).length;
    this.score.innerHTML = `<span>ABATES <b>${p.kills}</b></span><span>DERROTAS <b>${p.deaths}</b></span><span>ALVOS <b>${m.targetsDown}</b> · ${alive}/${targetCount}</span>`;
    this.banner.textContent = p.respawnT > 0 ? `DESTRUÍDO · VOLTA EM ${Math.ceil(p.respawnT)}` : '';
    this.banner.hidden = p.respawnT <= 0;
    this.hitT = Math.max(0, this.hitT - 1 / 60);
    this.cross.classList.toggle('hit', this.hitT > 0);
  }
}
