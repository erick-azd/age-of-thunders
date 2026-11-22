import * as THREE from 'three';
import weaponJson from '../../data/config/canhao.json';
import carJson from '../../data/config/carro.json';
import combatJson from '../../data/config/combate.json';
import dummyJson from '../../data/config/dummy.json';
import bikeJson from '../../data/config/moto.json';
import morphJson from '../../data/config/transformacao.json';
import districtJson from '../../data/world/bairro.json';
import worldJson from '../../data/world/mundo.json';
import { Input } from '../core/input';
import { TouchControls } from '../core/touch';
import { type Profile, chooseProfile } from './profile';
import { EditorPanel } from '../editor/panel';
import { DISTRICT_SPECS, type District, DistrictSchema, generateDistrict, materialColors, materialGlow } from '../procgen/district';
import { DUMMY_SPECS, type DummyDef, DummySchema, buildDummyRig } from '../procgen/dummy';
import { MeshBuilder, type RGB, hexToRgb } from '../procgen/mesh-builder';
import { Terrain, WorldSchema } from '../procgen/terrain';
import { buildBikeShape, buildCarShape } from '../procgen/vehicle-shape';
import { DistrictView } from '../render/district-view';
import { DummyView } from '../render/dummy-view';
import { FormWheel, WHEEL_FORMS, sectorOf } from '../render/form-wheel';
import { Bolts, Debris, Flashes, Turret } from '../render/fx';
import { Hud } from '../render/hud';
import { flatMaterial, toGeometry } from '../render/mesh-utils';
import { createSky } from '../render/sky';
import { Targets } from '../render/targets';
import { VehicleView } from '../render/vehicle-view';
import { Arena } from '../sim/arena';
import { type StreetNav, buildStreetNav } from '../sim/bot';
import { CAR_SPECS, type CarInput, CarParamsSchema, forwardSpeed, neutralCarInput } from '../sim/car';
import { COMBAT_SPECS, CombatSchema, type MatchEvent, type MatchState, createMatch, stepMatch } from '../sim/match';
import { type Vec3, v3 } from '../sim/math';
import { FORMS, type Form, MORPH_SPECS, MorphSchema, type VehicleState, createVehicle, startMorph } from '../sim/vehicle';
import { VOXEL } from '../sim/voxels';
import { WEAPON_SPECS, WeaponSchema, fire, raycast } from '../sim/weapons';

/** Passo fixo da simulação (60 Hz); a renderização interpola entre o passo anterior e o atual. */
export const STEP = 1 / 60;

type Screen = 'title' | 'playing';
export interface DebugCamera { pos: [number, number, number]; look: [number, number, number]; fov?: number }

/** Cores do time do bot: armadura vermelha, detalhes amarelos, brilho laranja. */
const BOT_COLORS = { armor: '#d8342a', accent: '#f5b81c', glow: '#ff9a1f' };

/** Um combatente na tela: veículo que se transforma, torre do canhão e o estado anterior (interpolação). */
interface Rider { view: VehicleView; turret: Turret; prev: VehicleState }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 12000);
  readonly terrain: Terrain;
  readonly districtDef = DistrictSchema.parse(districtJson);
  district!: District;
  world!: Arena;
  nav!: StreetNav;
  private city?: DistrictView;
  private districtTimer = 0;
  private mat = flatMaterial();
  readonly dummyDef = DummySchema.parse(dummyJson);
  private showcase = new THREE.Group();
  /** Vitrine (M0.2–M0.5): posição de cada peça, para câmeras e screenshots. */
  showcaseSpots: Record<string, [number, number, number]> = {};
  readonly params = CarParamsSchema.parse(carJson);
  readonly bikeParams = CarParamsSchema.parse(bikeJson);
  readonly morphParams = MorphSchema.parse(morphJson);
  readonly weapon = WeaponSchema.parse(weaponJson);
  readonly combat = CombatSchema.parse(combatJson);
  /** A partida inteira (simulação pura): jogador, bots, alvos e projéteis. */
  match!: MatchState;
  private spawn!: { pos: Vec3; heading: number };
  private riders: Rider[] = [];
  private input = new Input(window);
  private lastInput: CarInput = neutralCarInput();
  private pendingMorph: Form | null = null;
  /** Roda de formas: tempo segurando o botão, vetor de escolha (mouse) e se abriu pelo toque. */
  private wheel!: FormWheel;
  private formWasHeld = false;
  private formHoldT = 0;
  private wheelVec = { x: 0, y: 0 };
  private wheelByTouch = false;
  private camYaw = 0;
  private renderDt = 0;
  /** Mira: desvio de rumo da câmera em relação ao veículo e inclinação (radianos). */
  private aimYaw = 0;
  private aimPitch = 0.06;
  private aimIdle = 0;
  /** Ponto para onde a câmera (a mira) aponta agora, e a boca do canhão do jogador. */
  aimPoint = v3();
  private muzzle = v3();
  private firing = false;
  private bolts!: Bolts;
  private debris!: Debris;
  private flashes!: Flashes;
  private targetsView!: Targets;
  private hud!: Hud;
  stats = { shots: 0, blasts: 0, voxelsRemoved: 0, debrisKicked: 0, lastBlast: [0, 0, 0] as [number, number, number], hitsTaken: 0, hitsDealt: 0 };
  private editor: EditorPanel;
  private sky: THREE.Mesh;
  private titleEl: HTMLDivElement;
  private acc = 0;
  private f1Down = false;
  private camPos = new THREE.Vector3();
  screen: Screen = 'title';
  simTime = 0;
  frames = 0;
  ready = false;
  debugCam: DebugCamera | null = null;
  /** Perfil visual (padrão ou celular) e medidor de desempenho (F3). */
  readonly profile: Profile = chooseProfile();
  private perfEl!: HTMLDivElement;
  private perfOn = false;
  private f3Down = false;
  private fps = 60;
  private frameMs = 16.7;
  private perfT = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    const pr = this.profile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: pr.antialias });
    this.renderer.setPixelRatio(Math.min(pr.pixelRatioMax, window.devicePixelRatio));
    this.camera.far = pr.far;
    const def = WorldSchema.parse(worldJson);
    this.terrain = new Terrain(def).generate();
    const P = def.palette;

    // Céu, neblina e luz com a paleta do mundo.
    this.sky = createSky(P.skyZenith, P.skyHorizon, P.skyGround);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(P.skyHorizon, pr.fogNear, pr.fogFar);
    // Luz arcade (ADR 0005): céu frio e chão neutro, sol branco forte; brancos ficam brancos.
    this.scene.add(new THREE.HemisphereLight('#e4f0ff', '#8c8478', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 2.1);
    sun.position.set(0.6, 1, 0.3);
    this.scene.add(sun);

    // Terreno (1 draw call), mar, árvores instanciadas (1 draw call).
    const mat = this.mat;
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

    // Cidade de voxels no platô central (mapa híbrido, ADR 0002) e a vitrine ao sul.
    this.spawn = { pos: v3(2.5, def.plateauHeight + 0.5, 150), heading: 0 };
    this.buildDistrict();
    this.scene.add(this.showcase);

    // Efeitos do combate (ADR 0009) e alvos (ADR 0010).
    this.bolts = new Bolts(this.dummyDef.colors.glow);
    this.debris = new Debris(pr.debrisMax);
    this.flashes = new Flashes();
    this.targetsView = new Targets(mat, this.dummyDef.colors);
    this.scene.add(this.bolts.mesh, this.debris.mesh, this.flashes.mesh, this.targetsView.mesh);

    // Partida (M0.7): o jogador começa na rua central, ao sul, de frente para o centro (−Z).
    this.newMatch();

    // UI: título, HUD arcade e editor F1.
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title';
    this.titleEl.innerHTML = '<h1>Age of Thunders</h1><p>A / Enter para começar · F1 abre o editor</p>';
    ui.append(this.titleEl);
    this.hud = new Hud(ui);
    this.wheel = new FormWheel(ui, (f) => { this.pickForm(f); });
    if (pr.touch) {
      this.input.touch = new TouchControls(ui);
      document.body.classList.add('touch-on');
      canvas.addEventListener('pointerdown', () => this.input.touch?.tap());
      this.titleEl.querySelector('p')!.textContent = 'Toque para começar';
    } else canvas.addEventListener('click', () => { if (this.screen === 'playing' && !this.input.locked) canvas.requestPointerLock?.(); });
    this.perfEl = document.createElement('div');
    this.perfEl.className = 'perf';
    ui.append(this.perfEl);
    this.perfOn = pr.showPerf;
    this.editor = new EditorPanel(ui, [
      { title: 'Carro', specs: CAR_SPECS, values: this.params, file: 'config/carro.json' },
      { title: 'Moto', specs: CAR_SPECS, values: this.bikeParams, file: 'config/moto.json' },
      { title: 'Transformação', specs: MORPH_SPECS, values: this.morphParams, file: 'config/transformacao.json' },
      { title: 'Canhão', specs: WEAPON_SPECS, values: this.weapon, file: 'config/canhao.json' },
      { title: 'Combate e bot', specs: COMBAT_SPECS, values: this.combat, file: 'config/combate.json' },
      { title: 'Dummy', specs: DUMMY_SPECS, values: this.dummyDef as unknown as Record<string, number>, file: 'config/dummy.json', onChange: () => this.rebuildRiders() },
      {
        title: 'Cidade (regenera ao mudar)', specs: DISTRICT_SPECS, values: this.districtDef as unknown as Record<string, number>, file: 'world/bairro.json',
        onChange: () => { window.clearTimeout(this.districtTimer); this.districtTimer = window.setTimeout(() => { this.buildDistrict(); this.newMatch(); }, 250); },
      },
    ]);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Gera (ou regenera) a cidade, as malhas (ADR 0009) e o grafo de ruas do bot (ADR 0010). */
  buildDistrict(): void {
    this.city?.dispose();
    const def = this.districtDef, size = def.sizeM;
    this.district = generateDistrict(def, v3(-size / 2, this.terrain.def.plateauHeight - 0.5, -size / 2));
    if (this.world) this.world.voxels = this.district.grid;
    else this.world = new Arena(this.terrain, this.district.grid);
    this.nav = buildStreetNav(def, this.terrain.def.plateauHeight + 0.5, this.district.viaducts.map((v) => ({ axis: v.axis, lineM: -size / 2 + v.line * VOXEL })));
    this.city = new DistrictView(this.scene, this.district.grid, materialColors(def), materialGlow(def), this.mat);
  }

  /** Começa uma partida nova (jogador, bots, alvos) e recria as vistas dos combatentes. */
  private newMatch(): void {
    this.match = createMatch(1993, this.nav, this.spawn, this.combat);
    this.rebuildRiders();
    this.camYaw = this.spawn.heading;
  }

  private dummyColors(team: 'player' | 'bot'): DummyDef['colors'] {
    return team === 'player' ? this.dummyDef.colors : { ...this.dummyDef.colors, ...BOT_COLORS };
  }

  private makeVehicle(colors: DummyDef['colors']): VehicleView {
    const rig = buildDummyRig({ ...this.dummyDef, colors });
    return new VehicleView({ car: buildCarShape(colors), bike: buildBikeShape(colors) }, rig,
      { car: this.dummyDef.poses.car, bike: this.dummyDef.poses.bike }, this.mat, { tire: colors.dark, hub: colors.accent });
  }

  /** (Re)cria a vista de cada combatente: veículo, Dummy e torre, na cor do time; e a vitrine. */
  private rebuildRiders(): void {
    for (const r of this.riders) this.scene.remove(r.view.group);
    this.riders = this.match.fighters.map((f) => {
      const colors = this.dummyColors(f.team), view = this.makeVehicle(colors), turret = new Turret(this.mat, colors);
      view.group.add(turret.group);
      this.scene.add(view.group);
      return { view, turret, prev: structuredClone(f.veh) };
    });
    this.buildShowcase();
  }

  /**
   * Vitrine: o Dummy em T e em pé, o carro, três momentos da transformação e a moto, lado a lado,
   * no gramado ao sul da cidade, virados para +Z.
   */
  buildShowcase(): void {
    for (const c of [...this.showcase.children]) { this.showcase.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    this.showcaseSpots = {};
    const g = this.district.grid;
    const cx = 0, z = g.origin.z + g.sz * 0.5 + 12, y = this.terrain.groundHeight(cx, z);
    const rig = buildDummyRig(this.dummyDef);
    const row: [string, number][] = [['tpose', -9.5], ['standing', -7], ['car', -3.5], ['morph25', 1], ['morph50', 5], ['morph75', 9], ['bike', 13]];
    for (const [name, dx] of row) {
      const x = cx + dx;
      this.showcaseSpots[name] = [x, y, z];
      if (name === 'tpose' || name === 'standing') {
        const view = new DummyView(rig, this.mat);
        view.setPose(this.dummyDef.poses[name]);
        view.mesh.position.set(x, y, z);
        view.mesh.rotation.y = Math.PI;
        this.showcase.add(view.mesh);
        continue;
      }
      const v = this.makeVehicle(this.dummyDef.colors);
      const t = name === 'car' ? 0 : name === 'bike' ? 1 : Number(name.slice(5)) / 100;
      v.setMorph('car', 'bike', t);
      v.update(x, y, z, Math.PI, 0, 0, 0, 0);
      this.showcase.add(v.group);
    }
  }

  /** O veículo do jogador (o smoke e as ferramentas leem por aqui). */
  get state(): VehicleState { return this.match.fighters[0].veh; }
  private get formParams() { return { car: this.params, bike: this.bikeParams }; }
  private get matchParams() { return { cars: this.formParams, morph: this.morphParams, weapon: this.weapon, combat: this.combat }; }

  /** Pede a transformação (vale no próximo passo). Sem destino: a próxima forma da lista. */
  transform(to?: Form): void {
    const i = FORMS.indexOf(this.state.form);
    this.pendingMorph = to ?? FORMS[(i + 1) % FORMS.length];
  }

  /** Escolha na roda (ou tecla 1–4): só formas que existem e diferentes da atual. */
  private pickForm(f: string): void {
    this.wheel.hide();
    this.wheelByTouch = false;
    if ((FORMS as readonly string[]).includes(f) && f !== this.state.form) this.transform(f as Form);
  }

  /**
   * Botão de forma: toque rápido troca para a próxima; segurado por 0,25 s abre a roda.
   * Controle e mouse escolhem pela direção e confirmam ao soltar; no toque a roda fica aberta até
   * tocar num setor (ou tocar de novo no FORMA para fechar).
   */
  private updateFormWheel(dt: number, aim: { mouseX: number; mouseY: number; stickX: number; stickY: number }): boolean {
    const held = this.input.formHeld(), touchDown = !!this.input.touch?.formDown;
    if (held && !this.formWasHeld) {
      this.formHoldT = 0;
      this.wheelVec = { x: 0, y: 0 };
      if (this.wheel.open && this.wheelByTouch) { this.wheel.hide(); this.wheelByTouch = false; this.formWasHeld = held; return true; }
    }
    if (held) {
      this.formHoldT += dt;
      if (this.formHoldT > 0.25 && !this.wheel.open) { this.wheel.show(this.state.form, FORMS); this.wheelByTouch = touchDown; }
    }
    if (this.wheel.open && !this.wheelByTouch) {
      // Direção: analógico direito (absoluto) ou mouse (acumulado).
      this.wheelVec.x = Math.max(-1, Math.min(1, this.wheelVec.x + aim.mouseX * 0.01));
      this.wheelVec.y = Math.max(-1, Math.min(1, this.wheelVec.y + aim.mouseY * 0.01));
      const sx = Math.hypot(aim.stickX, aim.stickY) > 0.5 ? aim.stickX : this.wheelVec.x;
      const sy = Math.hypot(aim.stickX, aim.stickY) > 0.5 ? aim.stickY : this.wheelVec.y;
      // Guarda a última direção escolhida: soltar o analógico junto com o botão não perde a escolha.
      const sec = sectorOf(sx, sy);
      if (sec >= 0) this.wheel.highlight(sec);
    }
    if (!held && this.formWasHeld) {
      if (!this.wheel.open) this.transform();
      else if (!this.wheelByTouch) {
        const sel = this.wheel.selected;
        this.wheel.hide();
        if (sel >= 0) this.pickForm(WHEEL_FORMS[sel]);
      }
    }
    this.formWasHeld = held;
    const d = this.input.digitPressed();
    if (d >= 0) this.pickForm(WHEEL_FORMS[d]);
    return this.wheel.open;
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
      this.renderDt = dt;
      this.render();
      this.frames++;
      this.ready = true;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Um passo fixo da partida. */
  private step(inp: CarInput): void {
    this.match.fighters.forEach((f, i) => { if (this.riders[i]) this.riders[i].prev = structuredClone(f.veh); });
    const ev = stepMatch(this.match, { input: inp, fire: this.firing, aim: this.aimPoint, muzzle: this.muzzle, morph: this.pendingMorph },
      this.matchParams, this.world, this.district.grid, this.nav, this.spawn, STEP);
    if (this.match.fighters[0].respawnT <= 0) this.pendingMorph = null; // destruído: o pedido espera a volta
    this.simTime += STEP;
    this.onEvents(ev);
  }

  /** O que a simulação conta vira efeito: entulho, re-malha, explosão de veículo e de alvo. */
  private onEvents(ev: MatchEvent[]): void {
    const g = this.district.grid, colors = materialColors(this.districtDef);
    for (const e of ev) {
      if (e.type === 'shot') { if (e.owner === 0) this.stats.shots++; }
      else if (e.type === 'blast') {
        const b = e.blast;
        if (b.owner === 0) {
          this.stats.blasts++;
          this.stats.voxelsRemoved += b.removed.length / 4;
          this.stats.lastBlast = [b.pos.x, b.pos.y, b.pos.z];
        }
        this.city?.markRemoved(b.removed);
        this.debris.spawn(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z), b.removed, (x, y, z) => [g.origin.x + (x + 0.5) * VOXEL, g.origin.y + (y + 0.5) * VOXEL, g.origin.z + (z + 0.5) * VOXEL], colors);
      } else if (e.type === 'hit') {
        if (e.victim === 0) this.stats.hitsTaken++;
        if (e.owner === 0) { this.stats.hitsDealt++; this.hud.hitMarker(); }
      } else if (e.type === 'kill') {
        const f = this.match.fighters.find((x) => x.id === e.victim)!;
        this.burst(e.pos, this.dummyColors(f.team), 36);
      } else if (e.type === 'targetDown') {
        this.burst(e.pos, this.dummyDef.colors, 18);
      } else if (e.type === 'respawn') {
        const i = this.match.fighters.findIndex((x) => x.id === e.id);
        if (i >= 0 && this.riders[i]) this.riders[i].prev = structuredClone(this.match.fighters[i].veh);
        if (e.id === 0) { this.camYaw = this.state.heading; this.aimYaw = 0; }
      }
    }
  }

  /** Estilhaços na cor de um veículo ou alvo destruído. */
  private burst(p: Vec3, c: DummyDef['colors'], n: number): void {
    const pal: RGB[] = [hexToRgb(c.white), hexToRgb(c.armor), hexToRgb(c.accent), hexToRgb(c.dark)];
    const removed: number[] = [];
    for (let i = 0; i < n; i++) removed.push(i, 0, 0, i % pal.length);
    const center = new THREE.Vector3(p.x, p.y + 0.6, p.z);
    this.debris.spawn(center, removed, (i) => [p.x + Math.cos(i * 2.4) * 0.9, p.y + 0.4 + (i % 5) * 0.3, p.z + Math.sin(i * 2.4) * 0.9], pal, n);
  }

  private update(dt: number): void {
    const f1 = this.input.has('F1');
    if (f1 && !this.f1Down) this.editor.toggle();
    this.f1Down = f1;
    const f3 = this.input.has('F3');
    if (f3 && !this.f3Down) this.perfOn = !this.perfOn;
    this.f3Down = f3;
    // Desempenho: média móvel do tempo de quadro.
    if (dt > 0) { this.frameMs += (dt * 1000 - this.frameMs) * 0.05; this.fps = 1000 / this.frameMs; }
    if (this.screen === 'title') {
      if (this.input.confirmPressed()) { this.screen = 'playing'; this.titleEl.hidden = true; }
      return;
    }
    this.lastInput = this.input.read();
    // Mira: mouse (preso) e analógico direito giram a câmera; parada por 2 s, volta para a frente.
    // Com a roda de formas aberta, eles escolhem a forma (a câmera fica parada).
    const aim = this.input.readAim();
    if (this.updateFormWheel(dt, aim)) { aim.mouseX = aim.mouseY = aim.stickX = aim.stickY = 0; }
    const turn = aim.mouseX * 0.0025 + aim.stickX * 2.4 * dt, tilt = -aim.mouseY * 0.0022 - aim.stickY * 1.6 * dt;
    if (turn || tilt) this.aimIdle = 0; else this.aimIdle += dt;
    this.aimYaw = Math.atan2(Math.sin(this.aimYaw + turn), Math.cos(this.aimYaw + turn));
    this.aimPitch = Math.min(0.7, Math.max(-0.35, this.aimPitch + tilt));
    if (this.aimIdle > 2) { const k = 1 - Math.exp(-2 * dt); this.aimYaw -= this.aimYaw * k; this.aimPitch += (0.06 - this.aimPitch) * k; }
    this.firing = this.input.fireHeld();
    this.acc += dt;
    while (this.acc >= STEP) { this.step(this.lastInput); this.acc -= STEP; }
  }

  private render(): void {
    const a = this.acc / STEP;
    const L = (u: number, v: number) => u + (v - u) * a;
    const player = this.match.fighters[0];
    let px = 0, py = 0, pz = 0, ph = 0;
    this.match.fighters.forEach((f, i) => {
      const r = this.riders[i];
      if (!r) return;
      const s = f.veh, p = r.prev;
      r.view.group.visible = f.respawnT <= 0;
      const x = L(p.pos.x, s.pos.x), y = L(p.pos.y, s.pos.y), z = L(p.pos.z, s.pos.z), h = L(p.heading, s.heading);
      const mt = L(p.morphT, s.morphT);
      r.view.setMorph(s.morphFrom, s.form, mt);
      r.view.update(x, y, z, h, L(p.pitch, s.pitch), L(p.roll, s.roll) + L(p.lean, s.lean), L(p.wheelSpin, s.wheelSpin), L(p.steerVis, s.steerVis));
      // Torre: no encaixe da forma (santantônio do carro, rabeta da moto), deslizando na transformação.
      r.turret.group.position.copy(r.view.turretMount);
      if (i === 0) { px = x; py = y; pz = z; ph = h; }
    });

    if (this.debugCam) {
      const c = this.debugCam;
      this.camera.position.set(...c.pos);
      this.camera.fov = c.fov ?? 60;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(...c.look);
    } else {
      // Câmera de perseguição + mira: segue o rumo com atraso e soma o desvio da mira.
      let d = ph - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * (this.frames === 0 ? 1 : 1 - Math.exp(-5 * this.renderDt));
      const yaw = this.camYaw + this.aimYaw, pitch = this.aimPitch;
      const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      const cy = py + 2.0;
      this.camPos.set(px - fx * 7.5, cy + 1.1 - fy * 7.5, pz - fz * 7.5);
      this.camPos.y = Math.max(this.camPos.y, py + 0.6);
      this.camera.position.copy(this.camPos);
      if (this.camera.fov !== 65) { this.camera.fov = 65; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(px + fx * 30, cy + 1.1 + fy * 30 - 1.4, pz + fz * 30);
    }
    this.sky.position.copy(this.camera.position);

    // Mira do jogador: o que está no centro da tela (raio da câmera); as torres giram para o alvo.
    this.camera.updateMatrixWorld();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hit = raycast(this.world, v3(this.camera.position.x, this.camera.position.y, this.camera.position.z), v3(dir.x, dir.y, dir.z), this.weapon.rangeM, 0.5);
    this.aimPoint = hit.point;
    this.match.fighters.forEach((f, i) => {
      const r = this.riders[i];
      if (!r) return;
      const target = i === 0 ? hit.point : f.brain?.sees && player.respawnT <= 0 ? v3(player.veh.pos.x, player.veh.pos.y + 0.8, player.veh.pos.z) : null;
      if (target) {
        r.view.group.updateMatrixWorld(true);
        const local = r.view.group.worldToLocal(new THREE.Vector3(target.x, target.y, target.z)).sub(r.turret.group.position);
        r.turret.group.rotation.y = Math.atan2(-local.x, -local.z);
        r.turret.barrel.rotation.x = Math.atan2(local.y - 0.2, Math.hypot(local.x, local.z));
      } else { r.turret.group.rotation.y *= 0.9; r.turret.barrel.rotation.x *= 0.9; }
    });
    const mz = new THREE.Vector3();
    this.riders[0]?.view.group.updateMatrixWorld(true);
    this.riders[0]?.turret.muzzle.getWorldPosition(mz);
    this.muzzle = v3(mz.x, mz.y, mz.z);

    // Efeitos, alvos e re-malha das colunas atingidas (no máximo uma vez por quadro).
    this.city?.flush();
    this.bolts.update(this.match.shots);
    this.flashes.update(this.renderDt);
    this.targetsView.update(this.match.targets, this.match.time);
    const sp = player.veh.vel;
    this.stats.debrisKicked += this.debris.update(this.renderDt, (qx, qz, ym) => this.world.floorAt(qx, qz, ym), { x: px, y: py, z: pz, vx: sp.x, vz: sp.z, radius: player.veh.physForm === 'car' ? 1.8 : 1.0 });
    this.hud.update(this.screen === 'playing' && !this.debugCam, this.match, forwardSpeed(player.veh), this.combat.targets);
    this.renderer.render(this.scene, this.camera);
    this.perfT -= this.renderDt;
    this.perfEl.hidden = !this.perfOn;
    if (this.perfOn && this.perfT <= 0) {
      this.perfT = 0.25;
      const info = this.renderer.info.render;
      this.perfEl.textContent = `${this.fps.toFixed(0)} fps · ${this.frameMs.toFixed(1)} ms · ${info.calls} dc · ${(info.triangles / 1000).toFixed(0)}k tri · ${this.profile.name}`;
    }
  }

  // ---- API de depuração (smoke test e ferramentas) ----
  debugState() {
    const s = this.state, f = this.match.fighters;
    return {
      ready: this.ready, screen: this.screen, profile: this.profile.name, touch: this.profile.touch, fps: this.fps, frameMs: this.frameMs, simTime: this.simTime, wheelOpen: this.wheel.open, form: s.form, physForm: s.physForm, morphT: s.morphT, lean: s.lean,
      pos: { ...s.pos }, heading: s.heading, speed: forwardSpeed(s), onGround: s.onGround, wallHits: s.wallHits, editorOpen: this.editor.open,
      showcase: this.showcaseSpots,
      tower: this.towerCenter(),
      district: {
        buildings: this.district.buildings.length, sites: this.district.sites.length, viaducts: this.district.viaducts.length,
        meshes: this.city?.meshes.length ?? 0, triangles: this.city?.triangles() ?? 0, remeshed: this.city?.remeshed ?? 0,
      },
      combat: { ...this.stats, projectiles: this.match.shots.length, debris: this.debris.count, aim: { ...this.aimPoint } },
      match: {
        time: this.match.time, playerHp: f[0].hp, kills: f[0].kills, deaths: f[0].deaths, targetsDown: this.match.targetsDown,
        targets: this.match.targets.map((t) => ({ x: t.x, y: t.y, z: t.z, alive: t.respawnT <= 0 })),
        bots: f.slice(1).map((b) => ({ pos: { ...b.veh.pos }, hp: b.hp, alive: b.respawnT <= 0, sees: !!b.brain?.sees, kills: b.kills })),
      },
    };
  }
  debugCamera(c: DebugCamera | null): void { this.debugCam = c; }
  /** Volta ao ponto de partida, com a vida cheia (smoke e ferramentas). */
  debugRespawn(): void {
    const f = this.match.fighters[0];
    f.respawnT = 0;
    f.hp = f.maxHp;
    f.veh = createVehicle(this.spawn.pos, this.spawn.heading, f.veh.form);
    this.riders[0].prev = structuredClone(f.veh);
    this.camYaw = this.spawn.heading;
    this.aimYaw = 0;
  }

  /** Centro da torre central na meia altura (alvo do smoke). */
  towerCenter(): [number, number, number] {
    const t = this.district.buildings.find((b) => b.tower), g = this.district.grid;
    if (!t) return [0, 0, 0];
    return [g.origin.x + ((t.x0 + t.x1) / 2) * VOXEL, g.origin.y + 20, g.origin.z + ((t.z0 + t.z1) / 2) * VOXEL];
  }

  /** Atira do canhão do jogador em direção a um ponto do mundo (smoke e ferramentas). */
  debugFireAt(x: number, y: number, z: number): void {
    this.match.shots.push(fire(this.muzzle, v3(x, y, z), this.weapon, 0));
    this.stats.shots++;
  }
  /** Transforma e, se `instant`, completa a transformação na hora. */
  debugSetForm(f: Form, instant = true): boolean {
    const s = this.state;
    const ok = startMorph(s, f, this.formParams, this.world);
    if (ok && instant) { s.morphT = 1; s.physForm = f; this.riders[0].prev = structuredClone(s); }
    return ok;
  }
  /** Avança a simulação sem renderizar, com a última entrada (ou a dada). */
  debugAdvance(seconds: number, inp?: Partial<CarInput>): void {
    const i = { ...this.lastInput, ...inp };
    for (let t = 0; t < seconds; t += STEP) this.step(i);
  }
}
