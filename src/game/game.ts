import * as THREE from 'three';
import playerJson from '../../data/config/player.json';
import worldJson from '../../data/world/mundo.json';
import { Input } from '../core/input';
import { EditorPanel } from '../editor/panel';
import { MeshBuilder, hexToRgb } from '../procgen/mesh-builder';
import { Terrain, WorldSchema } from '../procgen/terrain';
import { flatMaterial, toGeometry } from '../render/mesh-utils';
import { createSky } from '../render/sky';
import { v3 } from '../sim/math';
import { PLAYER_SPECS, type PlayerInput, PlayerParamsSchema, type PlayerState, createPlayer, neutralInput, stepPlayer } from '../sim/player';

/** Passo fixo da simulação (60 Hz); a renderização interpola entre o passo anterior e o atual. */
export const STEP = 1 / 60;

type Screen = 'title' | 'playing';
export interface DebugCamera { pos: [number, number, number]; look: [number, number, number]; fov?: number }

/** Planador de exemplo feito com o MeshBuilder (frente para −Z). */
function buildGlider(): MeshBuilder {
  const b = new MeshBuilder();
  const body = hexToRgb('#f2f3f6'), stripe = hexToRgb('#e0408a'), dark = hexToRgb('#2b3448');
  b.push().translate(0, 0, 0).box(1.2, 1.0, 6, [body, dark, body]).pop();
  b.push().translate(0, 0.55, -1).box(0.9, 0.5, 1.6, dark).pop();
  b.push().translate(0, 0, 0.4).box(11, 0.18, 1.6, [body, dark, stripe]).pop();
  b.push().translate(0, 0.9, 2.6).box(0.18, 1.6, 1.0, stripe).pop();
  b.push().translate(0, 0.2, 2.8).box(3.6, 0.14, 0.8, body).pop();
  return b;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 12000);
  readonly terrain: Terrain;
  readonly params = PlayerParamsSchema.parse(playerJson);
  state: PlayerState;
  private prev: PlayerState;
  private input = new Input(window);
  private lastInput: PlayerInput = neutralInput();
  private editor: EditorPanel;
  private sky: THREE.Mesh;
  private playerMesh: THREE.Mesh;
  private titleEl: HTMLDivElement;
  private hudEl: HTMLDivElement;
  private acc = 0;
  private f1Down = false;
  private camPos = new THREE.Vector3();
  screen: Screen = 'title';
  simTime = 0;
  frames = 0;
  ready = false;
  debugCam: DebugCamera | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const def = WorldSchema.parse(worldJson);
    this.terrain = new Terrain(def).generate();
    const P = def.palette;

    // Céu, neblina e luz com a paleta do mundo.
    this.sky = createSky(P.skyZenith, P.skyHorizon, P.skyGround);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(P.skyHorizon, 1200, 5500);
    this.scene.add(new THREE.HemisphereLight(P.skyHorizon, '#5a7a3a', 1.6));
    const sun = new THREE.DirectionalLight('#fff4c2', 1.8);
    sun.position.set(0.6, 1, 0.3);
    this.scene.add(sun);

    // Terreno (1 draw call), mar, árvores instanciadas (1 draw call).
    const mat = flatMaterial();
    this.scene.add(new THREE.Mesh(toGeometry(this.terrain.mesh()), mat));
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: P.ocean }));
    sea.position.y = -0.2;
    this.scene.add(sea);
    const tree = new MeshBuilder();
    tree.push().translate(0, 2, 0).box(0.8, 4, 0.8, hexToRgb('#7a5230')).pop();
    tree.push().translate(0, 7, 0).ico(3.4, hexToRgb('#3d9a3a')).pop();
    const trees = new THREE.InstancedMesh(toGeometry(tree.build()), mat, Math.max(1, this.terrain.trees.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    this.terrain.trees.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      trees.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, t.y - 0.3, t.z), q, new THREE.Vector3(t.s, t.s, t.s)));
      const k = 0.85 + (i % 7) * 0.04;
      trees.setColorAt(i, col.setRGB(k, k, k * 0.95));
    });
    trees.count = this.terrain.trees.length;
    trees.computeBoundingSphere();
    this.scene.add(trees);

    this.playerMesh = new THREE.Mesh(toGeometry(buildGlider().build()), mat);
    this.scene.add(this.playerMesh);

    this.state = createPlayer(v3(0, this.terrain.groundHeight(0, 1200) + 80, 1200), 0, 40);
    this.prev = structuredClone(this.state);

    // UI: título, HUD e editor F1.
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title';
    this.titleEl.innerHTML = '<h1>Age of Thunders</h1><p>A / Enter para começar · F1 abre o editor</p>';
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'hud';
    this.hudEl.hidden = true;
    ui.append(this.titleEl, this.hudEl);
    this.editor = new EditorPanel(ui, [{ title: 'Veículo', specs: PLAYER_SPECS, values: this.params, file: 'config/player.json' }]);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.render();
      this.frames++;
      this.ready = true;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Um passo fixo da simulação. */
  private step(inp: PlayerInput): void {
    this.prev = structuredClone(this.state);
    stepPlayer(this.state, inp, this.params, this.terrain, STEP);
    this.simTime += STEP;
  }

  private update(dt: number): void {
    const f1 = this.input.has('F1');
    if (f1 && !this.f1Down) this.editor.toggle();
    this.f1Down = f1;
    if (this.screen === 'title') {
      if (this.input.confirmPressed()) { this.screen = 'playing'; this.titleEl.hidden = true; this.hudEl.hidden = false; }
      return;
    }
    this.lastInput = this.input.read();
    this.acc += dt;
    while (this.acc >= STEP) { this.step(this.lastInput); this.acc -= STEP; }
  }

  private render(): void {
    const a = this.acc / STEP, s = this.state, p = this.prev;
    const x = p.pos.x + (s.pos.x - p.pos.x) * a, y = p.pos.y + (s.pos.y - p.pos.y) * a, z = p.pos.z + (s.pos.z - p.pos.z) * a;
    this.playerMesh.position.set(x, y, z);
    this.playerMesh.rotation.set(0, -s.heading, 0);
    if (this.debugCam) {
      const c = this.debugCam;
      this.camera.position.set(...c.pos);
      this.camera.fov = c.fov ?? 60;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(...c.look);
    } else {
      // Câmera de perseguição simples (no Polygonizer: quadro em quaternion com slerp, ADR 0004).
      const back = new THREE.Vector3(x - Math.sin(s.heading) * 24, y + 8, z + Math.cos(s.heading) * 24);
      this.camPos.lerp(back, this.frames === 0 ? 1 : 0.12);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(x, y + 2, z);
    }
    this.sky.position.copy(this.camera.position);
    this.hudEl.textContent = `VEL ${s.speed.toFixed(0)} m/s   ALT ${(s.pos.y - this.terrain.groundHeight(s.pos.x, s.pos.z)).toFixed(0)} m${s.crashed ? '   ACIDENTE' : ''}`;
    this.renderer.render(this.scene, this.camera);
  }

  // ---- API de depuração (smoke test e ferramentas) ----
  debugState() {
    return { ready: this.ready, screen: this.screen, simTime: this.simTime, pos: { ...this.state.pos }, speed: this.state.speed, crashed: this.state.crashed, editorOpen: this.editor.open };
  }
  debugCamera(c: DebugCamera | null): void { this.debugCam = c; }
  /** Avança a simulação sem renderizar, com a última entrada (ou a dada). */
  debugAdvance(seconds: number, inp?: Partial<PlayerInput>): void {
    const i = { ...this.lastInput, ...inp };
    for (let t = 0; t < seconds; t += STEP) this.step(i);
  }
}
