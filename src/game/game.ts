import * as THREE from 'three';
import dummyJson from '../../data/config/dummy.json';
import carJson from '../../data/config/carro.json';
import bikeJson from '../../data/config/moto.json';
import districtJson from '../../data/world/bairro.json';
import worldJson from '../../data/world/mundo.json';
import { Input } from '../core/input';
import { EditorPanel } from '../editor/panel';
import { buildBikeModel, buildCarModel } from '../procgen/car-model';
import { DUMMY_SPECS, DummySchema, buildDummyRig } from '../procgen/dummy';
import { DISTRICT_SPECS, type District, DistrictSchema, generateDistrict, materialColors, materialGlow } from '../procgen/district';
import { MeshBuilder, hexToRgb } from '../procgen/mesh-builder';
import { Terrain, WorldSchema } from '../procgen/terrain';
import { meshRegion } from '../procgen/voxel-mesher';
import { flatMaterial, toGeometry } from '../render/mesh-utils';
import { CarView } from '../render/car-view';
import { DummyView } from '../render/dummy-view';
import { createSky } from '../render/sky';
import { Arena } from '../sim/arena';
import { v3 } from '../sim/math';
import { CAR_SPECS, type CarInput, CarParamsSchema, type CarState, createCar, fitsAt, forwardSpeed, neutralCarInput, stepCar } from '../sim/car';

/** Passo fixo da simulação (60 Hz); a renderização interpola entre o passo anterior e o atual. */
export const STEP = 1 / 60;

type Screen = 'title' | 'playing';
/** Formas do M0. A transformação animada entra na M0.5; por enquanto a troca é instantânea. */
export type Form = 'car' | 'bike';
export interface DebugCamera { pos: [number, number, number]; look: [number, number, number]; fov?: number }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 12000);
  readonly terrain: Terrain;
  readonly districtDef = DistrictSchema.parse(districtJson);
  district!: District;
  world!: Arena;
  private districtMeshes: THREE.Mesh[] = [];
  private districtTimer = 0;
  private mat = flatMaterial();
  readonly dummyDef = DummySchema.parse(dummyJson);
  private showcase = new THREE.Group();
  /** Vitrine do Dummy (M0.2): posição de cada pose, para câmeras e screenshots. */
  showcaseSpots: Record<string, [number, number, number]> = {};
  readonly params = CarParamsSchema.parse(carJson);
  readonly bikeParams = CarParamsSchema.parse(bikeJson);
  form: Form = 'car';
  private bike!: CarView;
  state: CarState;
  private prev: CarState;
  private spawn: { x: number; y: number; z: number; heading: number };
  private input = new Input(window);
  private lastInput: CarInput = neutralCarInput();
  private car!: CarView;
  private camYaw = 0;
  private renderDt = 0;
  private editor: EditorPanel;
  private sky: THREE.Mesh;
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

    // Bairro de voxels no platô central (mapa híbrido, ADR 0002).
    this.buildDistrict();
    this.scene.add(this.showcase);
    this.buildShowcase();

    // Carro do jogador (M0.3): começa na rua central, ao sul, de frente para o centro (−Z).
    this.car = this.makeCar();
    this.bike = this.makeBike();
    this.bike.group.visible = false;
    this.scene.add(this.car.group, this.bike.group);
    this.spawn = { x: 2.5, y: def.plateauHeight + 0.5, z: 150, heading: 0 };
    this.state = createCar(v3(this.spawn.x, this.spawn.y, this.spawn.z), this.spawn.heading);
    this.prev = structuredClone(this.state);
    this.camYaw = this.state.heading;

    // UI: título, HUD e editor F1.
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title';
    this.titleEl.innerHTML = '<h1>Age of Thunders</h1><p>A / Enter para começar · F1 abre o editor</p>';
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'hud';
    this.hudEl.hidden = true;
    ui.append(this.titleEl, this.hudEl);
    this.editor = new EditorPanel(ui, [
      { title: 'Carro', specs: CAR_SPECS, values: this.params, file: 'config/carro.json' },
      { title: 'Moto', specs: CAR_SPECS, values: this.bikeParams, file: 'config/moto.json' },
      { title: 'Dummy', specs: DUMMY_SPECS, values: this.dummyDef as unknown as Record<string, number>, file: 'config/dummy.json', onChange: () => this.rebuildDummies() },
      {
        title: 'Cidade (regenera ao mudar)', specs: DISTRICT_SPECS, values: this.districtDef as unknown as Record<string, number>, file: 'world/bairro.json',
        onChange: () => { window.clearTimeout(this.districtTimer); this.districtTimer = window.setTimeout(() => this.buildDistrict(), 250); },
      },
    ]);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Gera (ou regenera) o bairro e suas malhas: uma por coluna de 48 × 48 m (1 draw call cada). */
  buildDistrict(): void {
    for (const m of this.districtMeshes) { this.scene.remove(m); m.geometry.dispose(); }
    this.districtMeshes = [];
    const def = this.districtDef, size = def.sizeM;
    this.district = generateDistrict(def, v3(-size / 2, this.terrain.def.plateauHeight - 0.5, -size / 2));
    if (this.world) { this.world.voxels = this.district.grid; this.buildShowcase(); }
    else this.world = new Arena(this.terrain, this.district.grid);
    const g = this.district.grid, colors = materialColors(def), glow = materialGlow(def), COL = 96; // 48 × 48 m por malha
    for (let cz = 0; cz < g.sz; cz += COL) for (let cx = 0; cx < g.sx; cx += COL) {
      let top = 0;
      for (let k = cz >> 5; k < Math.min(g.ncz, (cz + COL) >> 5); k++) for (let i = cx >> 5; i < Math.min(g.ncx, (cx + COL) >> 5); i++) top = Math.max(top, g.chunkColumnTop(i, k));
      const data = meshRegion(g, cx, cz, Math.min(COL, g.sx - cx), Math.min(COL, g.sz - cz), colors, top, glow);
      if (!data.positions.length) continue;
      const mesh = new THREE.Mesh(toGeometry(data), this.mat);
      mesh.name = `bairro-${cx / COL}-${cz / COL}`;
      this.scene.add(mesh);
      this.districtMeshes.push(mesh);
    }
  }

  /**
   * Vitrine da M0.2: o Dummy nas quatro poses lado a lado, no gramado ao sul da cidade,
   * virado para +Z. As poses sentadas ganham um assento provisório (o veículo de verdade vem na M0.3).
   */
  buildShowcase(): void {
    for (const c of [...this.showcase.children]) { this.showcase.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    this.showcaseSpots = {};
    // No gramado do platô, logo depois da borda sul da cidade, com a cidade ao fundo.
    const g = this.district.grid;
    const cx = 0, z = g.origin.z + g.sz * 0.5 + 12, y = this.terrain.groundHeight(cx, z);
    const rig = buildDummyRig(this.dummyDef);
    const dark = hexToRgb('#2a2d33'), seatC = hexToRgb('#3d4148'), steel = hexToRgb('#7c838a');
    const seats: Record<string, number> = {};
    const order = ['tpose', 'standing', 'car', 'bike'];
    order.forEach((name, i) => {
      const pose = this.dummyDef.poses[name];
      if (!pose) return;
      const x = cx + [-5.5, -2.8, 1.2, 5.6][i];
      if (name === 'car' || name === 'bike') {
        // O veículo de verdade, estacionado e virado para +Z.
        const parked = name === 'car' ? this.makeCar() : this.makeBike();
        parked.update(x, y, z, Math.PI, 0, 0, 0, 0);
        this.showcase.add(parked.group);
        this.showcaseSpots[name] = [x, y, z];
        return;
      }
      const seatY = seats[name] ?? 0;
      const view = new DummyView(rig, this.mat);
      view.setPose(pose);
      view.mesh.position.set(x, y + seatY, z);
      view.mesh.rotation.y = Math.PI;
      this.showcase.add(view.mesh);
      this.showcaseSpots[name] = [x, y, z];
      if (!seatY) return;
      // Assento provisório (no espaço do personagem: frente em −Z).
      const b = new MeshBuilder();
      {
        b.push().translate(0, -0.08, 0.05).box(0.26, 0.1, 0.6, seatC).pop();
        b.push().translate(0, 0.0, -0.45).box(0.3, 0.22, 0.45, steel).pop();
        b.push().translate(0, 0.35, -0.72).box(0.7, 0.04, 0.04, dark).pop();
        b.push().translate(0, -0.45, -0.1).box(0.2, 0.6, 0.8, dark).pop();
        for (const sx of [-0.2, 0.2]) b.push().translate(sx, -0.62, 0.2).box(0.18, 0.03, 0.08, steel).pop();
      }
      const prop = new THREE.Mesh(toGeometry(b.build()), this.mat);
      prop.position.copy(view.mesh.position);
      prop.rotation.y = Math.PI;
      this.showcase.add(prop);
    });
  }

  private makeCar(): CarView {
    return new CarView(buildCarModel(this.dummyDef.colors), buildDummyRig(this.dummyDef), this.dummyDef.poses.car, this.mat);
  }

  private makeBike(): CarView {
    return new CarView(buildBikeModel(this.dummyDef.colors), buildDummyRig(this.dummyDef), this.dummyDef.poses.bike, this.mat);
  }

  /** Mudou o Dummy no editor: refaz a vitrine e os veículos do jogador. */
  private rebuildDummies(): void {
    this.buildShowcase();
    this.scene.remove(this.car.group, this.bike.group);
    this.car = this.makeCar();
    this.bike = this.makeBike();
    this.scene.add(this.car.group, this.bike.group);
    this.setForm(this.form);
  }

  private get activeParams() { return this.form === 'car' ? this.params : this.bikeParams; }

  /** Troca de forma mantendo posição, rumo e velocidade; recusa se a nova carroceria não couber. */
  setForm(f: Form): boolean {
    const p = f === 'car' ? this.params : this.bikeParams;
    if (f !== this.form && !fitsAt(this.state, p, this.world)) return false;
    this.form = f;
    this.car.group.visible = f === 'car';
    this.bike.group.visible = f === 'bike';
    return true;
  }

  private respawn(): void {
    this.state = createCar(v3(this.spawn.x, this.spawn.y, this.spawn.z), this.spawn.heading);
    this.prev = structuredClone(this.state);
    this.camYaw = this.state.heading;
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

  /** Um passo fixo da simulação. */
  private step(inp: CarInput): void {
    this.prev = structuredClone(this.state);
    const ev = stepCar(this.state, inp, this.activeParams, this.world, STEP);
    this.simTime += STEP;
    if (ev.some((e) => e.type === 'water') || this.state.pos.y < -60) this.respawn();
  }

  private update(dt: number): void {
    const f1 = this.input.has('F1');
    if (f1 && !this.f1Down) this.editor.toggle();
    this.f1Down = f1;
    if (this.screen === 'title') {
      if (this.input.confirmPressed()) { this.screen = 'playing'; this.titleEl.hidden = true; this.hudEl.hidden = false; }
      return;
    }
    if (this.input.formPressed()) this.setForm(this.form === 'car' ? 'bike' : 'car');
    this.lastInput = this.input.read();
    this.acc += dt;
    while (this.acc >= STEP) { this.step(this.lastInput); this.acc -= STEP; }
  }

  private render(): void {
    const a = this.acc / STEP, s = this.state, p = this.prev;
    const L = (u: number, v: number) => u + (v - u) * a;
    const x = L(p.pos.x, s.pos.x), y = L(p.pos.y, s.pos.y), z = L(p.pos.z, s.pos.z), h = L(p.heading, s.heading);
    const view = this.form === 'car' ? this.car : this.bike;
    view.update(x, y, z, h, L(p.pitch, s.pitch), L(p.roll, s.roll) + L(p.lean, s.lean), L(p.wheelSpin, s.wheelSpin), L(p.steerVis, s.steerVis));
    if (this.debugCam) {
      const c = this.debugCam;
      this.camera.position.set(...c.pos);
      this.camera.fov = c.fov ?? 60;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(...c.look);
    } else {
      // Câmera de perseguição: segue o rumo com atraso (gira menos que o carro numa derrapagem).
      let d = h - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Suavização pelo tempo real (independe da taxa de quadros); a posição acompanha o carro sem atraso.
      this.camYaw += d * (this.frames === 0 ? 1 : 1 - Math.exp(-5 * this.renderDt));
      const fx = Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      this.camPos.set(x - fx * 7.5, y + 3.1, z - fz * 7.5);
      this.camera.position.copy(this.camPos);
      if (this.camera.fov !== 65) { this.camera.fov = 65; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(x + fx * 4, y + 1.3, z + fz * 4);
    }
    this.sky.position.copy(this.camera.position);
    this.hudEl.textContent = `${Math.abs(forwardSpeed(s) * 3.6).toFixed(0).padStart(3, ' ')} km/h${s.onGround ? '' : '   NO AR'}`;
    this.renderer.render(this.scene, this.camera);
  }

  // ---- API de depuração (smoke test e ferramentas) ----
  debugState() {
    let triangles = 0;
    for (const m of this.districtMeshes) triangles += m.geometry.getAttribute('position').count / 3;
    return {
      ready: this.ready, screen: this.screen, simTime: this.simTime, form: this.form, lean: this.state.lean, pos: { ...this.state.pos }, heading: this.state.heading, speed: forwardSpeed(this.state), onGround: this.state.onGround, wallHits: this.state.wallHits, editorOpen: this.editor.open,
      showcase: this.showcaseSpots,
      district: { buildings: this.district.buildings.length, sites: this.district.sites.length, viaducts: this.district.viaducts.length, meshes: this.districtMeshes.length, triangles },
    };
  }
  debugCamera(c: DebugCamera | null): void { this.debugCam = c; }
  debugSetForm(f: Form): boolean { return this.setForm(f); }
  /** Avança a simulação sem renderizar, com a última entrada (ou a dada). */
  debugAdvance(seconds: number, inp?: Partial<CarInput>): void {
    const i = { ...this.lastInput, ...inp };
    for (let t = 0; t < seconds; t += STEP) this.step(i);
  }
}
