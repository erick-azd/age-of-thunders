import * as THREE from 'three';
import dummyJson from '../../data/config/dummy.json';
import weaponJson from '../../data/config/canhao.json';
import carJson from '../../data/config/carro.json';
import bikeJson from '../../data/config/moto.json';
import morphJson from '../../data/config/transformacao.json';
import districtJson from '../../data/world/bairro.json';
import worldJson from '../../data/world/mundo.json';
import { Input } from '../core/input';
import { EditorPanel } from '../editor/panel';
import { buildBikeShape, buildCarShape } from '../procgen/vehicle-shape';
import { DUMMY_SPECS, DummySchema, buildDummyRig } from '../procgen/dummy';
import { DISTRICT_SPECS, type District, DistrictSchema, generateDistrict, materialColors, materialGlow } from '../procgen/district';
import { MeshBuilder, hexToRgb } from '../procgen/mesh-builder';
import { Terrain, WorldSchema } from '../procgen/terrain';
import { flatMaterial, toGeometry } from '../render/mesh-utils';
import { DistrictView } from '../render/district-view';
import { Bolts, Debris, Flashes, Turret } from '../render/fx';
import { VehicleView } from '../render/vehicle-view';
import { DummyView } from '../render/dummy-view';
import { createSky } from '../render/sky';
import { Arena } from '../sim/arena';
import { v3 } from '../sim/math';
import { VOXEL } from '../sim/voxels';
import { type Projectile, WEAPON_SPECS, WeaponSchema, fire, raycast, stepProjectiles } from '../sim/weapons';
import { CAR_SPECS, type CarInput, CarParamsSchema, forwardSpeed, neutralCarInput } from '../sim/car';
import { type Form, MORPH_SPECS, MorphSchema, type VehicleState, createVehicle, startMorph, stepVehicle } from '../sim/vehicle';

/** Passo fixo da simulação (60 Hz); a renderização interpola entre o passo anterior e o atual. */
export const STEP = 1 / 60;

type Screen = 'title' | 'playing';
export interface DebugCamera { pos: [number, number, number]; look: [number, number, number]; fov?: number }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 12000);
  readonly terrain: Terrain;
  readonly districtDef = DistrictSchema.parse(districtJson);
  district!: District;
  world!: Arena;
  private city?: DistrictView;
  private districtTimer = 0;
  private mat = flatMaterial();
  readonly dummyDef = DummySchema.parse(dummyJson);
  private showcase = new THREE.Group();
  /** Vitrine do Dummy (M0.2): posição de cada pose, para câmeras e screenshots. */
  showcaseSpots: Record<string, [number, number, number]> = {};
  readonly params = CarParamsSchema.parse(carJson);
  readonly bikeParams = CarParamsSchema.parse(bikeJson);
  readonly morphParams = MorphSchema.parse(morphJson);
  readonly weapon = WeaponSchema.parse(weaponJson);
  /** Projéteis em voo e tempo até o próximo tiro (estado da simulação). */
  projectiles: Projectile[] = [];
  private cooldown = 0;
  /** Mira: desvio de rumo da câmera em relação ao veículo e inclinação (radianos). */
  private aimYaw = 0;
  private aimPitch = 0.06;
  private aimIdle = 0;
  /** Ponto para onde a câmera (a mira) aponta agora. */
  aimPoint = v3();
  private firing = false;
  private turret!: Turret;
  private bolts!: Bolts;
  private debris!: Debris;
  private flashes!: Flashes;
  private crosshair!: HTMLDivElement;
  stats = { shots: 0, blasts: 0, voxelsRemoved: 0, debrisKicked: 0, lastBlast: [0, 0, 0] as [number, number, number] };
  state: VehicleState;
  private prev: VehicleState;
  private spawn: { x: number; y: number; z: number; heading: number };
  private input = new Input(window);
  private lastInput: CarInput = neutralCarInput();
  private vehicle!: VehicleView;
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
    this.vehicle = this.makeVehicle();
    this.scene.add(this.vehicle.group);
    // Combate (M0.6): torre no veículo, projéteis, entulho e clarões.
    this.turret = new Turret(mat, this.dummyDef.colors);
    this.vehicle.group.add(this.turret.group);
    this.bolts = new Bolts(this.dummyDef.colors.glow);
    this.debris = new Debris(300);
    this.flashes = new Flashes();
    this.scene.add(this.bolts.mesh, this.debris.mesh, this.flashes.mesh);
    this.spawn = { x: 2.5, y: def.plateauHeight + 0.5, z: 150, heading: 0 };
    this.state = createVehicle(v3(this.spawn.x, this.spawn.y, this.spawn.z), this.spawn.heading, 'car');
    this.prev = structuredClone(this.state);
    this.camYaw = this.state.heading;

    // UI: título, HUD e editor F1.
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'title';
    this.titleEl.innerHTML = '<h1>Age of Thunders</h1><p>A / Enter para começar · F1 abre o editor</p>';
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'hud';
    this.hudEl.hidden = true;
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    ui.append(this.titleEl, this.hudEl, this.crosshair);
    canvas.addEventListener('click', () => { if (this.screen === 'playing' && !this.input.locked) canvas.requestPointerLock?.(); });
    this.editor = new EditorPanel(ui, [
      { title: 'Carro', specs: CAR_SPECS, values: this.params, file: 'config/carro.json' },
      { title: 'Moto', specs: CAR_SPECS, values: this.bikeParams, file: 'config/moto.json' },
      { title: 'Transformação', specs: MORPH_SPECS, values: this.morphParams, file: 'config/transformacao.json' },
      { title: 'Canhão', specs: WEAPON_SPECS, values: this.weapon, file: 'config/canhao.json' },
      { title: 'Dummy', specs: DUMMY_SPECS, values: this.dummyDef as unknown as Record<string, number>, file: 'config/dummy.json', onChange: () => this.rebuildDummies() },
      {
        title: 'Cidade (regenera ao mudar)', specs: DISTRICT_SPECS, values: this.districtDef as unknown as Record<string, number>, file: 'world/bairro.json',
        onChange: () => { window.clearTimeout(this.districtTimer); this.districtTimer = window.setTimeout(() => this.buildDistrict(), 250); },
      },
    ]);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Gera (ou regenera) a cidade e suas malhas (grupos de 48 × 48 m, 1 draw call cada; ADR 0009). */
  buildDistrict(): void {
    this.city?.dispose();
    const def = this.districtDef, size = def.sizeM;
    this.district = generateDistrict(def, v3(-size / 2, this.terrain.def.plateauHeight - 0.5, -size / 2));
    if (this.world) { this.world.voxels = this.district.grid; this.buildShowcase(); }
    else this.world = new Arena(this.terrain, this.district.grid);
    this.city = new DistrictView(this.scene, this.district.grid, materialColors(def), materialGlow(def), this.mat);
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
    // Da esquerda para a direita: T, em pé, carro, três momentos da transformação e a moto.
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
      const v = this.makeVehicle();
      const t = name === 'car' ? 0 : name === 'bike' ? 1 : Number(name.slice(5)) / 100;
      v.setMorph('car', 'bike', t);
      v.update(x, y, z, Math.PI, 0, 0, 0, 0);
      this.showcase.add(v.group);
    }
  }

  private makeVehicle(): VehicleView {
    const c = this.dummyDef.colors;
    return new VehicleView(buildCarShape(c), buildBikeShape(c), buildDummyRig(this.dummyDef),
      { car: this.dummyDef.poses.car, bike: this.dummyDef.poses.bike }, this.mat, { tire: c.dark, hub: c.accent });
  }

  /** Mudou o Dummy no editor: refaz a vitrine e o veículo do jogador. */
  private rebuildDummies(): void {
    this.buildShowcase();
    this.scene.remove(this.vehicle.group);
    this.vehicle = this.makeVehicle();
    this.scene.add(this.vehicle.group);
  }

  private get formParams(): Record<Form, typeof this.params> { return { car: this.params, bike: this.bikeParams }; }

  /** Começa a transformação para a outra forma (recusa se não couber ou se já estiver transformando). */
  transform(to?: Form): boolean {
    return startMorph(this.state, to ?? (this.state.form === 'car' ? 'bike' : 'car'), this.formParams, this.world);
  }

  /** Dispara da boca do canhão em direção ao alvo. */
  shoot(target: { x: number; y: number; z: number }): void {
    this.vehicle.group.updateMatrixWorld(true);
    const m = new THREE.Vector3();
    this.turret.muzzle.getWorldPosition(m);
    this.projectiles.push(fire(v3(m.x, m.y, m.z), v3(target.x, target.y, target.z), this.weapon));
    this.flashes.add(m.x, m.y, m.z, 0.45);
    this.cooldown = this.weapon.cooldownS;
    this.stats.shots++;
  }

  private respawn(): void {
    this.aimYaw = 0;
    this.state = createVehicle(v3(this.spawn.x, this.spawn.y, this.spawn.z), this.spawn.heading, this.state.form);
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
    const ev = stepVehicle(this.state, inp, this.formParams, this.morphParams, this.world, STEP);
    this.simTime += STEP;
    // Canhão: atira na direção da mira; projéteis voam e arrancam voxels.
    this.cooldown = Math.max(0, this.cooldown - STEP);
    if (this.firing && this.cooldown === 0) this.shoot(this.aimPoint);
    const blasts = stepProjectiles(this.projectiles, this.world, this.district.grid, this.weapon, STEP);
    for (const b of blasts) {
      this.stats.blasts++;
      this.stats.voxelsRemoved += b.removed.length / 4;
      this.stats.lastBlast = [b.pos.x, b.pos.y, b.pos.z];
      this.city?.markRemoved(b.removed);
      const g = this.district.grid;
      this.debris.spawn(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z), b.removed, (x, y, z) => [g.origin.x + (x + 0.5) * VOXEL, g.origin.y + (y + 0.5) * VOXEL, g.origin.z + (z + 0.5) * VOXEL], materialColors(this.districtDef));
      // Sem esfera de clarão na explosão (o Erick não gostou; ADR 0009, atualização de 22/11).
    }
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
    if (this.input.formPressed()) this.transform();
    this.lastInput = this.input.read();
    // Mira: mouse (preso) e analógico direito giram a câmera; parada por 2 s, volta para a frente.
    const aim = this.input.readAim();
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
    const a = this.acc / STEP, s = this.state, p = this.prev;
    const L = (u: number, v: number) => u + (v - u) * a;
    const x = L(p.pos.x, s.pos.x), y = L(p.pos.y, s.pos.y), z = L(p.pos.z, s.pos.z), h = L(p.heading, s.heading);
    const view = this.vehicle;
    view.setMorph(s.morphFrom, s.form, L(p.morphT, s.morphT));
    view.update(x, y, z, h, L(p.pitch, s.pitch), L(p.roll, s.roll) + L(p.lean, s.lean), L(p.wheelSpin, s.wheelSpin), L(p.steerVis, s.steerVis));
    // Torre: no alto do santantônio (carro) ou na rabeta (moto), apontada para a mira.
    const u = s.form === s.morphFrom ? (s.form === 'car' ? 0 : 1) : s.form === 'bike' ? L(p.morphT, s.morphT) : 1 - L(p.morphT, s.morphT);
    this.turret.group.position.set(0, 1.92 + (1.05 - 1.92) * u, 0.95 + (0.66 - 0.95) * u);
    if (this.debugCam) {
      const c = this.debugCam;
      this.camera.position.set(...c.pos);
      this.camera.fov = c.fov ?? 60;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(...c.look);
    } else {
      // Câmera de perseguição + mira: segue o rumo com atraso e soma o desvio da mira.
      let d = h - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Suavização pelo tempo real (independe da taxa de quadros); a posição acompanha o carro sem atraso.
      this.camYaw += d * (this.frames === 0 ? 1 : 1 - Math.exp(-5 * this.renderDt));
      const yaw = this.camYaw + this.aimYaw, pitch = this.aimPitch;
      const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      const px = x, py = y + 2.0, pz = z; // pivô acima do veículo
      this.camPos.set(px - fx * 7.5, py + 1.1 - fy * 7.5, pz - fz * 7.5);
      this.camPos.y = Math.max(this.camPos.y, y + 0.6);
      this.camera.position.copy(this.camPos);
      if (this.camera.fov !== 65) { this.camera.fov = 65; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(px + fx * 30, py + 1.1 + fy * 30 - 1.4, pz + fz * 30);
    }
    this.sky.position.copy(this.camera.position);
    // Mira: o que está no centro da tela (raio da câmera).
    this.camera.updateMatrixWorld();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hit = raycast(this.world, v3(this.camera.position.x, this.camera.position.y, this.camera.position.z), v3(dir.x, dir.y, dir.z), this.weapon.rangeM, 0.5);
    this.aimPoint = hit.point;
    // Torre gira para o alvo (no espaço do veículo).
    const local = this.vehicle.group.worldToLocal(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)).sub(this.turret.group.position);
    this.turret.group.rotation.y = Math.atan2(-local.x, -local.z);
    this.turret.barrel.rotation.x = Math.atan2(local.y - 0.2, Math.hypot(local.x, local.z));
    // Efeitos e re-malha das colunas atingidas (no máximo uma vez por quadro).
    this.city?.flush();
    this.bolts.update(this.projectiles);
    this.flashes.update(this.renderDt);
    const sp = this.state.vel;
    this.stats.debrisKicked += this.debris.update(this.renderDt, (qx, qz, ym) => this.world.floorAt(qx, qz, ym), { x, y, z, vx: sp.x, vz: sp.z, radius: this.state.physForm === 'car' ? 1.8 : 1.0 });
    this.crosshair.hidden = this.screen !== 'playing' || !!this.debugCam;
    this.hudEl.textContent = `${Math.abs(forwardSpeed(s) * 3.6).toFixed(0).padStart(3, ' ')} km/h${s.onGround ? '' : '   NO AR'}`;
    this.renderer.render(this.scene, this.camera);
  }

  // ---- API de depuração (smoke test e ferramentas) ----
  debugState() {
    const triangles = this.city?.triangles() ?? 0;
    return {
      ready: this.ready, screen: this.screen, simTime: this.simTime, form: this.state.form, physForm: this.state.physForm, morphT: this.state.morphT, lean: this.state.lean, pos: { ...this.state.pos }, heading: this.state.heading, speed: forwardSpeed(this.state), onGround: this.state.onGround, wallHits: this.state.wallHits, editorOpen: this.editor.open,
      showcase: this.showcaseSpots,
      tower: this.towerCenter(),
      district: { buildings: this.district.buildings.length, sites: this.district.sites.length, viaducts: this.district.viaducts.length, meshes: this.city?.meshes.length ?? 0, triangles, remeshed: this.city?.remeshed ?? 0 },
      combat: { ...this.stats, projectiles: this.projectiles.length, debris: this.debris.count, aim: { ...this.aimPoint } },
    };
  }
  debugCamera(c: DebugCamera | null): void { this.debugCam = c; }
  /** Volta ao ponto de partida (smoke e ferramentas). */
  debugRespawn(): void { this.respawn(); }

  /** Centro da torre central na meia altura (alvo do smoke). */
  towerCenter(): [number, number, number] {
    const t = this.district.buildings.find((b) => b.tower), g = this.district.grid;
    if (!t) return [0, 0, 0];
    return [g.origin.x + ((t.x0 + t.x1) / 2) * VOXEL, g.origin.y + 20, g.origin.z + ((t.z0 + t.z1) / 2) * VOXEL];
  }

  /** Atira do canhão em direção a um ponto do mundo (smoke e ferramentas). */
  debugFireAt(x: number, y: number, z: number): void { this.shoot({ x, y, z }); }
  /** Transforma e, se `instant`, completa a transformação na hora. */
  debugSetForm(f: Form, instant = true): boolean {
    const ok = this.transform(f);
    if (ok && instant) { this.state.morphT = 1; this.state.physForm = f; this.prev = structuredClone(this.state); }
    return ok;
  }
  /** Avança a simulação sem renderizar, com a última entrada (ou a dada). */
  debugAdvance(seconds: number, inp?: Partial<CarInput>): void {
    const i = { ...this.lastInput, ...inp };
    for (let t = 0; t < seconds; t += STEP) this.step(i);
  }
}
