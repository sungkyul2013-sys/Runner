import * as THREE from 'three';
import { Renderer } from '../core/Renderer';
import { World } from '../world/World';
import { Effects } from '../combat/Effects';
import { Weapons, Target } from '../combat/Weapons';
import { EnemyAir, GroundTarget, BuildingTarget } from '../combat/Enemies';
import { Aircraft } from '../aircraft/Aircraft';
import { getSpec } from '../aircraft/specs';
import { nearestApproach, ilsDeviation } from '../aircraft/Assist';
import type { Env, Part } from '../aircraft/FlightModel';
import { Input, InputEvent } from '../core/Input';
import { Audio } from '../core/Audio';
import { HUD, HudData, HudTarget } from '../ui/HUD';
import { Menus, SandboxCfg, UIHost, ResultData } from '../ui/Menus';
import { CameraRig, CAM_NAMES } from './CameraRig';
import { MISSIONS, MissionDef, ObjDef, RingSet, AeroTracker, MOVE_NAMES } from './Missions';
import { LandingEval } from './LandingEval';
import { WEATHER_PRESETS, WeatherState } from '../world/Sky';
import { RUNWAYS, CARRIER, CITY, CANYON_X, AIRPORT, runwayAt, onCarrierDeck, terrainHeight } from '../world/WorldDef';
import { settings, progress, save } from '../core/Save';
import { clamp, DEG, M_TO_FT, MS_TO_KT, mulberry32 } from '../core/math';

type State = 'loading' | 'menu' | 'flight' | 'paused' | 'results' | 'photo' | 'replay';
interface Frame { p: number[]; q: number[]; s: number[] }

const GROUND_BASE: [string, number, number][] = [['sam', 2600, -12400], ['sam', 3600, -11200], ['aaa', 3000, -11800], ['aaa', 2200, -11600], ['radar', 3100, -12200], ['fuel', 2800, -11000], ['tank', 2400, -11300], ['tank', 3300, -11500], ['hangar', 3500, -12500], ['truck', 2700, -11450]];

export class Game implements UIHost {
  readonly r: Renderer;
  readonly world: World;
  readonly fx = new Effects();
  readonly weapons: Weapons;
  readonly input = new Input();
  readonly audio = new Audio();
  readonly hud = new HUD();
  readonly menus: Menus;
  readonly cam: CameraRig;
  state: State = 'loading';
  player: Aircraft | null = null;
  private menuAc: Aircraft | null = null;
  private menuKind: 'title' | 'hangar' | 'briefing' = 'title';
  private orbitT = 0;
  enemies: EnemyAir[] = [];
  grounds: GroundTarget[] = [];
  bTargets: BuildingTarget[] = [];
  private env: Env = { wind: new THREE.Vector3(), turbulence: 0, time: 0, carrierWires: [], catapult: false };
  // mission runtime
  mission: MissionDef | null = null;
  private sandbox: SandboxCfg | null = null;
  private objIdx = 0;
  private rings: RingSet | null = null;
  private aero: AeroTracker | null = null;
  private missionT = 0;
  private kills = 0; private ringMiss = 0; private ringHit = 0;
  private landing = new LandingEval();
  private lastLanding: ReturnType<LandingEval['finalize']> = null;
  private stoppedT = 0;
  private ended = false;
  private waves = 0;
  private infAmmo = false;
  private lockTarget: Target | null = null; private lockT = 0; private targetCycle = 0;
  private gunAcc = 0; private gunSnd = 0;
  private prevPos = new THREE.Vector3();
  private frames: Frame[] = []; private recT = 0; private replayIdx = 0;
  private maxG = 0; private maxSpd = 0; private dist = 0;
  private flash = 0; private dmgFlash = 0;
  private calloutAlt = 9999;
  private clock = new THREE.Clock();
  private t = 0;
  private fpsAcc = 0; private fpsN = 0;
  private outcome: ResultData | null = null;
  private engineFailed = false;
  private lastGear = 1;
  private camNameT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
    this.world = new World(this.r.scene, this.r.renderer, this.r.profile);
    this.r.scene.add(this.fx.group);
    this.weapons = new Weapons(this.fx, this.world.city);
    this.r.scene.add(this.weapons.group);
    this.cam = new CameraRig(this.r.camera);
    this.r.scene.add(this.cam.cockpit);
    this.menus = new Menus(this);
    this.env.carrierWires = this.world.airport.wiresZ;
    this.input.show(false);
    this.hud.visible = false;

    this.fx.onShake = (a, p) => { const d = p.distanceTo(this.r.camera.position); this.cam.shake(a * clamp(300 / (d + 50), 0, 1.5)); this.flash = Math.max(this.flash, clamp(a * 60 / (d + 30), 0, 0.25)); };
    this.fx.onBoom = (p, s) => this.audio.explosion(p.distanceTo(this.r.camera.position), s);
    this.weapons.onKill = (t, by) => {
      if (by !== 'player') return;
      this.kills++; progress.kills++;
      this.menus.banner(t.kind === 'air' ? 'SPLASH' : 'DESTROYED', t.name, 'var(--burn)', 1500);
      this.menus.feed(t.name, t.kind === 'air' ? 'KILL' : 'HIT');
      if (t.kind === 'air') this.audio.say('splash', 'Splash one', 2);
    };
    this.weapons.onHitPlayer = (dmg, at) => this.damagePlayer(dmg, at);
    this.weapons.onMissileLaunchAtPlayer = () => this.audio.say('mlaunch', 'Missile launch', 3);
    this.weapons.onGunSound = () => { if (this.gunSnd <= 0) { this.audio.gun(); this.gunSnd = 0.05; } };
    this.weapons.onHitMarker = () => this.audio.click();
    this.world.weather.onLightning = (d) => this.audio.thunder(d);

    const unlock = () => { this.audio.init(); if (this.state === 'menu') this.audio.menuMusic(true); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  }

  /* ================= boot ================= */
  async boot() {
    const tips = ['지형 생성 중…', '대기 산란 계산 중…', '공항 조명 설치 중…', '도시 건설 중…', '항공모함 배치 중…', '셰이더 컴파일 중…'];
    const step = (p: number, i: number) => new Promise<void>((res) => { this.menus.loading(p, tips[i % tips.length]); setTimeout(res, 16); });
    await step(0.05, 0);
    this.world.sky.setTime(17.3);
    this.world.setWeather(WEATHER_PRESETS.scattered.w);
    const p0 = new THREE.Vector3(0, 300, 1500);
    for (let i = 0; i < 30; i++) {
      this.world.terrain.update([p0], 300, 40);
      if (this.world.terrain.pending === 0) break;
      await step(0.05 + (i / 30) * 0.6, Math.floor(i / 6));
    }
    await step(0.7, 4);
    this.setMenuScene('title');
    this.world.update(0.016, this.r.camera, p0, new THREE.Vector3(), this.fx);
    await step(0.8, 5);
    try { this.r.renderer.compile(this.r.scene, this.r.camera); } catch { /* ignore */ }
    await step(1, 5);
    this.state = 'menu';
    this.menus.main();
    this.loop();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.menus.fpsEl.style.display = settings.showFps ? '' : 'none'; this.menus.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.r.pixelRatio.toFixed(2)}x`; this.fpsAcc = 0; this.fpsN = 0; }
    this.gunSnd -= dt;
    switch (this.state) {
      case 'menu': this.updateMenu(dt); break;
      case 'flight': this.updateFlight(dt); break;
      case 'replay': this.updateReplay(dt); break;
      case 'photo': case 'paused': case 'results': this.updateFrozen(dt); break;
    }
    const g = this.r.grade.uniforms;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.2);
    g.uFlash.value = this.flash + this.world.sky.lightning * 0.15;
    g.uDamage.value = this.dmgFlash + (this.player && this.state === 'flight' ? clamp(1 - this.player.fm.hp.fuselage / 100, 0, 1) * 0.3 : 0);
    g.uRain.value = this.cam.inCockpit ? this.world.sky.weather.rain : 0;
    this.r.adapt(dt);
    this.r.render(dt, this.t);
  };

  /* ================= menu scene ================= */
  setMenuScene(kind: 'title' | 'hangar' | 'briefing') {
    this.menuKind = kind;
    this.state = this.state === 'loading' ? 'loading' : 'menu';
    this.input.show(false);
    this.hud.visible = false; this.hud.clear();
    this.cam.cockpit.visible = false;
    if (kind === 'title') { this.world.sky.setTime(17.3); this.world.setWeather(WEATHER_PRESETS.scattered.w); }
    else { this.world.sky.setTime(14.6); this.world.setWeather({ ...WEATHER_PRESETS.clear.w, fog: 0 }); }
    this.previewAircraft(this.menus.selAc, this.menus.selLiv);
    if (kind === 'title') this.cam.setMode('cinematic');
  }

  previewAircraft(id: string, livery: number) {
    if (this.menuAc) { this.r.scene.remove(this.menuAc.group); this.menuAc.removeTrails(); }
    const ac = new Aircraft(getSpec(id), livery, 'neutral');
    this.r.scene.add(ac.group);
    ac.addTrailsTo(this.r.scene);
    ac.assist.level = 'standard';
    if (this.menuKind === 'title') {
      ac.reset(new THREE.Vector3(-900, 420, 2200), 0, ac.spec.vRef * 1.7, false);
      ac.fm.gear = 0; ac.controls.gearDown = false;
      ac.assist.engageAP(ac.fm); ac.assist.ap.altT = 420; ac.assist.ap.spdT = ac.spec.vRef * 1.7;
    } else {
      const p = new THREE.Vector3(AIRPORT.cx + 330, 0, AIRPORT.cz - 300);
      const gy = Math.min(...ac.spec.gear.map((g) => g.p[1]));
      p.y = AIRPORT.elev - gy;
      ac.reset(p, 270 * DEG, 0, true);
      ac.fm.thr = 0.0;
    }
    this.menuAc = ac;
    this.cam.target = null;
  }

  private updateMenu(dt: number) {
    const ac = this.menuAc;
    if (!ac) return;
    this.input.update(dt);
    const ev = this.input.consume();
    if (this.menuKind === 'title') {
      const fm = ac.fm;
      ac.assist.ap.hdgT = ((ac.assist.ap.hdgT + dt * 2.2) % 360);
      ac.controls.throttle = 0.7;
      const out = ac.assist.update(dt, fm, { pitch: 0, roll: 0, yaw: 0 }, 0.7, 0);
      ac.controls.throttle = out.throttle ?? 0.7;
      for (let i = 0; i < 4; i++) fm.step(dt / 4, out.cmd, ac.controls, this.env);
      if (fm.crashed) this.previewAircraft(this.menus.selAc, this.menus.selLiv);
      ac.animate(dt, this.fx, this.world.sky.night, true);
      this.cam.update(dt, ac, 0, 0, 0, false);
    } else {
      // hangar turntable orbit — drag to rotate
      ac.fm.rpm = 0.25; ac.fm.thr = 0.05;
      ac.animate(dt, null, this.world.sky.night, true);
      this.orbitT += dt * 0.12 - this.input.state.lookX; this.input.state.lookX = 0;
      const portrait = innerHeight > innerWidth;
      const s = ac.spec, R = (Math.max(s.geom.length, s.geom.wing.span) * 0.85 + 5) * (portrait ? 1.9 : 1);
      const c = this.r.camera;
      const off = portrait ? 0 : this.menuKind === 'briefing' ? -R * 0.35 : R * 0.18;
      const ctr = ac.fm.pos.clone().add(new THREE.Vector3(0, s.geom.radius * 0.6, 0));
      c.position.set(ctr.x + Math.cos(this.orbitT) * R, ctr.y + R * 0.22 + Math.sin(this.orbitT * 0.7) * R * 0.05, ctr.z + Math.sin(this.orbitT) * R);
      c.up.set(0, 1, 0);
      c.lookAt(ctr.clone().add(new THREE.Vector3(0, 0, 0)));
      c.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion), off);
      if (portrait) c.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion), -R * (this.menuKind === 'briefing' ? 0.32 : 0.12));
      if (c.fov !== 42) { c.fov = 42; c.updateProjectionMatrix(); }
    }
    void ev;
    this.world.update(dt, this.r.camera, ac.fm.pos, ac.fm.vel, this.fx);
    this.fx.update(dt, this.world.sky.fog);
    this.audio.silenceEngine();
  }

  /* ================= starting flights ================= */
  private buildPlayer(id: string, livery: number) {
    if (this.player) { this.r.scene.remove(this.player.group); this.player.removeTrails(); }
    if (this.menuAc) { this.r.scene.remove(this.menuAc.group); this.menuAc.removeTrails(); this.menuAc = null; }
    const ac = new Aircraft(getSpec(id), livery, 'player');
    this.r.scene.add(ac.group);
    ac.addTrailsTo(this.r.scene);
    this.player = ac;
    this.cam.buildCockpit(ac);
    const fm = ac.fm;
    fm.onTouchdown = (vn, idx, speed) => {
      const g = ac.spec.gear[idx];
      if (!g.nose) { this.landing.touch(fm, vn); }
      this.audio.touchdown(clamp(-vn / 4, 0.05, 1) * (speed > 15 ? 1 : 0.3));
      if (speed > 20) this.fx.tireSmoke(fm.gearState[idx].worldPos, 6);
      this.cam.shake(clamp(-vn / 3, 0, 1.2));
    };
    fm.onScrape = (p, sev) => { if (Math.random() < 0.3) this.fx.hitSparks(p, 3); this.cam.shake(sev * 0.2); };
    fm.onDamage = (part, amt) => { if (amt > 3) { this.dmgFlash = Math.min(0.8, this.dmgFlash + amt / 60); } void part; };
    fm.onCrash = (reason) => this.crash(reason);
    fm.onGearCollapse = () => { this.menus.toast('랜딩기어 파손!', 'var(--rd)'); this.audio.hit(); };
    fm.onHook = () => { this.landing.onWire(fm, this.world.airport.wiresZ); this.audio.hook(); this.menus.toast(`어레스팅 와이어 #${this.landing.wire} 캐치!`, 'var(--gn)'); };
    return ac;
  }

  private clearCombat() {
    for (const e of this.enemies) { this.r.scene.remove(e.ac.group); e.ac.removeTrails(); }
    for (const g of this.grounds) this.r.scene.remove(g.group);
    this.enemies = []; this.grounds = []; this.bTargets = [];
    this.weapons.clear();
    this.fx.clear();
    this.world.city.reset();
    if (this.rings) { this.r.scene.remove(this.rings.group); this.rings = null; }
  }

  private spawn(ac: Aircraft, type: string, x?: number, z?: number, alt?: number, hdg = 0, speed?: number) {
    const s = ac.spec;
    const gy = Math.min(...s.gear.map((g) => g.p[1]));
    const p = new THREE.Vector3();
    let ground = false;
    this.env.catapult = false;
    switch (type) {
      case 'runway': { const r = RUNWAYS[0]; p.set(r.cx, r.elev - gy + 0.02, r.cz + r.length / 2 - 70); ground = true; hdg = 0; break; }
      case 'far': { const r = RUNWAYS[2 + Math.floor(Math.random() * (RUNWAYS.length - 2))]; p.set(r.cx, r.elev - gy + 0.02, r.cz + r.length / 2 - 70); ground = true; hdg = 0; this.menus.notice(r.name); break; }
      case 'altiport': { const r = RUNWAYS[1]; p.set(r.cx, r.elev - gy + 0.02, r.cz + r.length / 2 - 40); ground = true; hdg = 0; break; }
      case 'carrier': p.set(CARRIER.cx + 12, CARRIER.deck - gy + 0.02, CARRIER.cz + 60); ground = true; hdg = 0; break;
      case 'catapult': p.set(CARRIER.cx - 8, CARRIER.deck - gy + 0.02, CARRIER.cz - CARRIER.length / 2 + 95); ground = true; hdg = 0; this.env.catapult = true; break;
      case 'city': p.set(CITY.cx, 450, CITY.cz + CITY.hz + 2500); hdg = 0; break;
      case 'canyon': p.set(CANYON_X - 400, 450, 3600); hdg = 345 * DEG; break;
      case 'mountain': p.set(-500, 2700, -6000); hdg = 330 * DEG; break;
      default: p.set(x ?? 0, alt ?? 800, z ?? 4000);
    }
    if (type === 'air' && x !== undefined) p.set(x, alt ?? 800, z ?? 0);
    if (type === 'air' && x === undefined) p.set(0, 800, 5000);
    const v = ground ? 0 : speed ?? Math.max(s.vRef * 1.6, type === 'mountain' ? s.vRef * 2 : 0);
    ac.reset(p, type === 'air' || type === 'city' || type === 'canyon' || type === 'mountain' ? hdg : hdg, v, ground);
    if (!ground) {
      const slow = v < s.vRef * 1.35;
      ac.controls.gearDown = slow || !s.retract; ac.fm.gear = ac.controls.gearDown ? 1 : 0;
      if (slow && s.flapNotches.length > 1) { ac.flapIdx = Math.floor(s.flapNotches.length / 2); ac.controls.flaps = s.flapNotches[ac.flapIdx]; ac.fm.flaps = ac.controls.flaps; }
      ac.controls.throttle = slow ? 0.45 : 0.75; ac.fm.thr = ac.controls.throttle;
      ac.controls.brake = 0;
    }
    this.input.setThrottle(ac.controls.throttle);
    this.prevPos.copy(ac.fm.pos);
  }

  private applyWorld(hour: number, weather: string, wind?: [number, number], turb?: number) {
    let w: WeatherState;
    if (weather === 'random') {
      const keys = Object.keys(WEATHER_PRESETS);
      w = { ...WEATHER_PRESETS[keys[Math.floor(Math.random() * keys.length)]].w };
      w.windDir = Math.random() * 360; w.windSpeed = Math.random() * 12;
      hour = 6 + Math.random() * 16;
    } else w = { ...WEATHER_PRESETS[weather].w };
    if (wind) { w.windDir = wind[0]; w.windSpeed = wind[1]; }
    if (turb !== undefined) w.turbulence = turb;
    this.world.sky.setTime(hour);
    this.world.setWeather(w);
    this.env.turbulence = w.turbulence;
    this.env.wind.copy(this.world.wind);
  }

  private commonStart() {
    this.state = 'flight';
    this.ended = false; this.outcome = null;
    this.objIdx = 0; this.missionT = 0; this.kills = 0; this.ringMiss = 0; this.ringHit = 0;
    this.landing.reset(); this.lastLanding = null; this.stoppedT = 0; this.waves = 0;
    this.lockTarget = null; this.lockT = 0;
    this.frames = []; this.recT = 0;
    this.maxG = 1; this.maxSpd = 0; this.dist = 0;
    this.engineFailed = false;
    this.calloutAlt = 9999;
    this.wreck = 0;
    this.menus.hideAll(); this.menus.closeAP(); this.menus.tip(null);
    this.input.show(true);
    this.input.root.classList.toggle('desk', matchMedia('(pointer:fine)').matches);
    this.hud.visible = true;
    this.audio.menuMusic(false);
    this.audio.init();
    const p = this.player!;
    this.input.setWeapons(p.spec.gun > 0);
    p.assist.level = settings.assist;
    p.assist.autoRudder = settings.autoRudder;
    p.assist.groundAssist = settings.groundAssist;
    this.cam.setMode(this.cam.mode === 'cinematic' ? 'chase' : this.cam.mode);
    this.lastGear = p.fm.gear;
    progress.flights++; save();
    // warm terrain around the spawn point
    for (let i = 0; i < 12; i++) { this.world.terrain.update([p.fm.pos], p.fm.pos.y, 30); if (!this.world.terrain.pending) break; }
  }

  startMission(def: MissionDef, acId: string, livery: number) {
    this.mission = def; this.sandbox = null;
    this.clearCombat();
    const ac = this.buildPlayer(acId, livery);
    this.applyWorld(def.hour, def.weather, def.wind);
    const st = def.start;
    let speed = st.speed;
    if (st.type === 'air' && st.speed !== undefined && acId !== def.aircraft) {
      // rescale approach speed for the chosen aircraft
      speed = (st.speed / getSpec(def.aircraft).vRef) * ac.spec.vRef;
    }
    this.spawn(ac, st.type, st.x, st.z, st.alt, (st.hdg ?? 0) * DEG, speed);
    ac.fm.invincible = false; ac.fm.infiniteFuel = false; this.infAmmo = def.id === 'x3';
    ac.smokeOn = !!def.smoke;
    this.commonStart();
    this.activateObjective();
    this.spawnTraffic(2);
    const idx = MISSIONS.filter((m) => m.cat === def.cat).indexOf(def) + 1;
    this.menus.intro(`${def.cat === 'campaign' ? 'MISSION' : def.cat === 'course' ? 'COURSE' : 'CHALLENGE'} ${String(idx).padStart(2, '0')}`, this.menus.codename(def.id), def.title);
    if (def.tips?.length && settings.assist !== 'realistic') this.menus.tip(def.tips[0]);
  }

  startSandbox(cfg: SandboxCfg) {
    this.mission = null; this.sandbox = { ...cfg };
    this.clearCombat();
    const ac = this.buildPlayer(cfg.aircraft, cfg.livery);
    this.applyWorld(cfg.hour, cfg.weather, [cfg.windDir, cfg.windSpeed], cfg.turbulence);
    this.spawn(ac, cfg.spawn);
    ac.fm.invincible = cfg.invincible; ac.fm.infiniteFuel = cfg.infFuel; this.infAmmo = cfg.infAmmo;
    this.commonStart();
    for (let i = 0; i < cfg.enemies; i++) this.spawnEnemy('fighter', ac.fm.pos.x + (Math.random() - 0.5) * 8000, ac.fm.pos.z - 7000 - Math.random() * 4000, 1500 + Math.random() * 2000);
    if (cfg.ground) for (const [k, x, z] of GROUND_BASE) this.spawnGround(k, x, z);
    if (cfg.traffic) this.spawnTraffic(3);
    this.menus.intro('FREE FLIGHT', ac.spec.name, `${ac.spec.ko} · 자유 비행`);
  }

  private spawnEnemy(role: 'fighter' | 'bomber' | 'drone' | 'traffic', x: number, z: number, alt: number, hdg?: number) {
    const p = new THREE.Vector3(x, Math.max(alt, terrainHeight(x, z) + 400), z);
    const toP = this.player ? this.player.fm.pos.clone().sub(p) : new THREE.Vector3(0, 0, 1);
    const h = hdg ?? Math.atan2(toP.x, -toP.z);
    const e = new EnemyAir(role, p, h, this.weapons, this.fx, 0.45 + Math.random() * 0.4);
    this.r.scene.add(e.ac.group);
    e.ac.addTrailsTo(this.r.scene);
    this.enemies.push(e);
    if (role !== 'traffic') this.weapons.targets.push(e);
    return e;
  }
  private spawnGround(k: string, x: number, z: number) {
    const g = new GroundTarget(k as never, x, z, this.weapons, this.fx);
    this.r.scene.add(g.group);
    this.grounds.push(g);
    this.weapons.targets.push(g);
    return g;
  }
  private spawnTraffic(n: number) {
    const rnd = mulberry32(Math.floor(Math.random() * 1e6));
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      this.spawnEnemy('traffic', Math.cos(a) * 9000, Math.sin(a) * 9000, 2500 + rnd() * 3000, a + Math.PI / 2);
    }
  }

  /* ================= objectives ================= */
  private get obj(): ObjDef | null { return this.mission?.objectives[this.objIdx] ?? null; }

  private activateObjective() {
    const o = this.obj;
    if (!o || !this.player) return;
    if (o.type === 'rings') {
      if (this.rings) this.r.scene.remove(this.rings.group);
      this.rings = new RingSet(o.rings, o.radius);
      this.r.scene.add(this.rings.group);
    } else if (o.type === 'destroy') {
      o.air?.forEach(([role, n, x, z, alt]) => { for (let i = 0; i < n; i++) this.spawnEnemy(role as 'fighter', x + (i - n / 2) * 600, z + i * 300, alt + i * 150); });
      o.ground?.forEach(([k, x, z]) => this.spawnGround(k, x, z));
      if (o.buildings) {
        const tall = [...this.world.city.buildings].filter((b) => b.h > 60 && b.alive).sort(() => Math.random() - 0.5).slice(0, o.buildings);
        for (const b of tall) { const t = new BuildingTarget(b, this.world.city, this.fx); this.bTargets.push(t); this.weapons.targets.push(t); }
      }
    } else if (o.type === 'aero') {
      this.aero = new AeroTracker();
    } else if (o.type === 'protect') {
      for (let i = 0; i < o.bombers; i++) { const e = this.spawnEnemy('bomber', 9000 + i * 400, -12000 - i * 500, 1400, 225 * DEG); e.dest = new THREE.Vector3(CITY.cx, 0, CITY.cz); }
      for (let i = 0; i < o.escorts; i++) this.spawnEnemy('fighter', 9500 + i * 500, -11500, 2000);
    }
  }

  private completeObjective() {
    this.audio.success();
    this.objIdx++;
    if (this.rings && this.obj?.type !== 'rings') { this.r.scene.remove(this.rings.group); this.rings = null; }
    if (!this.obj) { this.finish(true, '모든 목표 달성'); return; }
    this.menus.toast('목표 달성', 'var(--gn)');
    this.activateObjective();
    const tips = this.mission?.tips;
    if (tips && tips[this.objIdx]) this.menus.tip(tips[this.objIdx]); else this.menus.tip(null);
  }

  private updateObjective(dt: number) {
    const p = this.player!;
    const fm = p.fm;
    const o = this.obj;
    const def = this.mission;
    if (def?.timeLimit && this.missionT > def.timeLimit) { this.finish(false, '시간 초과'); return; }
    if (def?.engineFail && !this.engineFailed && this.missionT > def.engineFail) {
      this.engineFailed = true; fm.engineRunning = false;
      this.menus.toast('⚠ 엔진 정지!', 'var(--rd)', 3000); this.audio.say('eng', 'Engine failure', 3);
      this.menus.tip('최적 활공 속도를 유지하며 활주로로 향하세요');
    }
    if (!o) return;
    switch (o.type) {
      case 'climb': if (!fm.onGround && fm.agl > o.agl) this.completeObjective(); break;
      case 'rings': {
        const res = this.rings?.check(this.prevPos, fm.pos);
        if (res === 'hit') { this.ringHit++; this.audio.ring(true); }
        if (res === 'miss') { this.ringMiss++; this.audio.ring(false); this.menus.toast('링 놓침 +5초', 'var(--rd)', 900); this.missionT += 5; }
        if (this.rings && this.rings.idx >= this.rings.meshes.length) this.completeObjective();
        if (this.objIdx === 0 && this.mission?.tips && this.rings && this.rings.idx > 0) this.menus.tip(null);
        break;
      }
      case 'reach': if (Math.hypot(fm.pos.x - o.x, fm.pos.z - o.z) < o.r) this.completeObjective(); break;
      case 'aero': {
        const at = fm.attitude();
        this.aero!.update(dt, fm.omega.x, -fm.omega.z, at.roll, fm.vs);
        if (o.moves.every((m) => this.aero!.done.has(m))) this.completeObjective();
        break;
      }
      case 'destroy': {
        const alive = this.weapons.targets.filter((t) => t.alive && t.team === 'enemy').length + this.bTargets.filter((b) => b.alive).length;
        if (alive === 0) {
          if (this.mission?.id === 'x3') {
            this.waves++;
            this.menus.toast(`WAVE ${this.waves + 1}`, 'var(--am)');
            for (let i = 0; i < 2 + this.waves; i++) this.spawnEnemy('fighter', fm.pos.x + (Math.random() - 0.5) * 9000, fm.pos.z - 8000, 2000 + Math.random() * 2000);
          } else this.completeObjective();
        }
        break;
      }
      case 'protect': {
        const bombers = this.enemies.filter((e) => e.role === 'bomber');
        if (bombers.some((b) => b.alive && Math.hypot(b.pos.x - CITY.cx, b.pos.z - CITY.cz) < 2200)) { this.finish(false, '폭격기가 도시에 도달'); return; }
        if (bombers.every((b) => !b.alive)) this.completeObjective();
        break;
      }
      case 'land': {
        if (fm.onGround && fm.vel.length() < 1.5 && !fm.crashed) {
          this.stoppedT += dt;
          if (this.stoppedT > 1.2) {
            const rw = runwayAt(fm.pos.x, fm.pos.z);
            const deck = onCarrierDeck(fm.pos.x, fm.pos.z);
            const ok = o.where === 'any' ? !!rw || deck : o.where === 'main' ? rw?.rw.id === 'RKSA' : o.where === 'alti' ? rw?.rw.id === 'ALTI' : deck;
            this.lastLanding = this.landing.finalize(fm);
            if (ok) {
              progress.landings++;
              if (this.lastLanding) progress.bestLanding = Math.max(progress.bestLanding, this.lastLanding.score);
              this.completeObjective();
            } else this.finish(false, '지정된 활주로가 아닙니다');
          }
        } else this.stoppedT = 0;
        break;
      }
    }
  }

  private finish(success: boolean, reason: string) {
    if (this.ended) return;
    this.ended = true;
    const def = this.mission;
    let stars = 0;
    if (success && def) {
      stars = 1;
      if (this.missionT <= def.par) stars++;
      const dmgOk = (this.player?.fm.hp.fuselage ?? 0) > 85;
      const landOk = !def.objectives.some((o) => o.type === 'land') || (this.lastLanding?.score ?? 0) >= 80;
      if (dmgOk && landOk && this.ringMiss === 0) stars++;
      progress.stars[def.id] = Math.max(progress.stars[def.id] ?? 0, stars);
      const isScore = def.cat === 'challenge' && def.objectives.some((o) => o.type === 'land');
      const val = isScore ? this.lastLanding?.score ?? 0 : Math.round(this.missionT * 10) / 10;
      const prev = progress.best[def.id];
      progress.best[def.id] = prev === undefined ? val : isScore ? Math.max(prev, val) : Math.min(prev, val);
    }
    if (def?.id === 'x3') { success = true; reason = `${this.waves} 웨이브 · ${this.kills} 격추`; }
    progress.flightTime += this.missionT;
    save();
    const fmt = (v: number) => (settings.units === 'aviation' ? `${Math.round(v * MS_TO_KT)} kt` : `${Math.round(v * 3.6)} km/h`);
    const rows: [string, string][] = [['최대 속도', fmt(this.maxSpd)], ['최대 G', `${this.maxG.toFixed(1)} G`], ['비행 거리', `${(this.dist / 1000).toFixed(1)} km`]];
    if (this.kills) rows.push(['격추 / 파괴', String(this.kills)]);
    if (this.ringHit || this.ringMiss) rows.push(['링', `${this.ringHit} 통과 / ${this.ringMiss} 놓침`]);
    if (this.aero) rows.push(['곡예 기동', [...this.aero.done].map((m) => MOVE_NAMES[m]).join(', ') || '-']);
    const result: ResultData = { success, title: def?.title ?? '자유 비행', reason, time: this.missionT, stars, rows, landing: this.lastLanding, missionId: def?.id ?? null, canReplay: this.frames.length > 30 };
    this.outcome = result;
    if (success) this.audio.success(); else this.audio.fail();
    setTimeout(() => {
      if (this.state !== 'flight' && this.state !== 'replay') return;
      this.state = 'results';
      this.input.show(false);
      this.hud.visible = false; this.hud.clear();
      this.menus.closeAP(); this.menus.tip(null);
      this.audio.silenceEngine();
      this.cam.setMode('orbit');
      this.menus.results(result);
    }, success ? 1500 : 2600);
  }

  private crash(reason: string) {
    const p = this.player;
    if (!p) return;
    const fm = p.fm;
    const energy = fm.crashSpeed + Math.abs(fm.crashVs) * 3;
    const water = reason.includes('바다');
    if (energy > 95 || reason.includes('충돌') && fm.crashSpeed > 70) {
      // high-energy impact: fireball + burning wreck
      this.fx.explosion(fm.pos.clone(), 2.6, fm.vel);
      this.fx.addFire(fm.pos.clone(), 2.5, 60);
      p.vis.root.visible = false;
      this.cam.shake(2);
      this.audio.say('crash', 'Crash', 5);
      this.menus.banner('CRASH', reason, 'var(--burn)', 2400);
    } else {
      // survivable crash: the airframe breaks but stays — smoke, sparks, maybe a small fire
      p.vis.root.visible = true;
      const g = Math.max(fm.groundH, 0);
      fm.pos.y = Math.max(fm.pos.y, g + 0.6);
      const at = fm.attitude();
      fm.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-at.pitch * 0.6 + 0.05, 0, (Math.random() - 0.5) * 0.4)));
      p.vis.gear.forEach((gv) => (gv.root.visible = false));
      if (energy > 55) { p.vis.wingL.visible = Math.random() < 0.5; this.fx.addFire(fm.pos.clone(), 0.8, 30); }
      if (water) { for (let i = 0; i < 30; i++) this.fx.dust(fm.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12)), fm.vel, 1, true); }
      else { this.fx.hitSparks(fm.pos.clone(), 20); for (let i = 0; i < 12; i++) this.fx.dust(fm.pos.clone(), fm.vel, 1); }
      this.wreck = 8;
      p.sync();
      this.cam.shake(1);
      this.audio.hit();
      this.menus.banner(water ? 'DITCHED' : 'AIRFRAME DAMAGED', reason, 'var(--amber)', 2400);
    }
    if (this.mission?.id === 'x3') this.finish(true, '');
    else this.finish(false, reason);
  }
  private wreck = 0;

  private damagePlayer(dmg: number, at: THREE.Vector3) {
    const p = this.player;
    if (!p || p.fm.crashed) return;
    const parts: Part[] = ['engine', 'wingL', 'wingR', 'tail', 'fuselage'];
    p.fm.damage(parts[Math.floor(Math.random() * parts.length)], dmg);
    this.fx.hitSparks(at, 8);
    this.cam.shake(dmg / 20);
    this.audio.hit();
    if (settings.vibration) navigator.vibrate?.(40);
  }

  /* ================= flight loop ================= */
  private handleEvents(ev: Set<InputEvent>) {
    const p = this.player!;
    const c = p.controls;
    for (const e of ev) {
      switch (e) {
        case 'pause': this.pauseGame(); return;
        case 'gear': if (p.spec.retract) { c.gearDown = !c.gearDown; this.audio.gearMotor(); this.menus.notice(c.gearDown ? '기어 DOWN' : '기어 UP'); if (!c.gearDown && p.fm.onGround) c.gearDown = true; } break;
        case 'flapsDown': p.cycleFlaps(1); this.menus.notice(`플랩 ${Math.round(c.flaps * 100)}%`); break;
        case 'flapsCycle': if (p.flapIdx >= p.spec.flapNotches.length - 1) { p.flapIdx = 0; p.controls.flaps = 0; } else p.cycleFlaps(1); this.menus.notice(`플랩 ${Math.round(c.flaps * 100)}%`); break;
        case 'flapsUp': p.cycleFlaps(-1); this.menus.notice(`플랩 ${Math.round(c.flaps * 100)}%`); break;
        case 'airbrake': c.airbrake = !c.airbrake; break;
        case 'hook': if (p.spec.hook) { c.hook = !c.hook; this.menus.notice(c.hook ? '테일훅 DOWN' : '테일훅 UP'); if (!c.hook) p.fm.hooked = false; } break;
        case 'camera': this.cam.next(1); this.camNameT = 1.6; break;
        case 'lights': p.lightsOn = !p.lightsOn; break;
        case 'hud': this.hud.visible = !this.hud.visible; break;
        case 'smoke': p.smokeOn = !p.smokeOn; break;
        case 'photo': this.photo(); return;
        case 'engine': if (!p.fm.engineRunning && p.fm.hp.engine > 0 && !this.engineFailed) { p.fm.engineRunning = true; this.menus.notice('엔진 재시동'); } break;
        case 'ap': this.menus.toggleAP(); break;
        case 'app': this.apCmd('app'); break;
        case 'target': this.targetCycle++; this.lockT = 0; break;
        case 'catapult':
          if (this.env.catapult && p.fm.onGround && !p.fm.catapulting) {
            if (p.fm.thr < 0.85) { this.menus.notice('스로틀을 최대로 올리세요'); break; }
            p.fm.catapulting = true; p.fm.catapultDist = 0; c.brake = 0;
            this.audio.catapult(); this.cam.shake(1.2); this.menus.toast('발진!', 'var(--am)');
          }
          break;
        case 'flare': if (p.flares > 0) { p.flares--; this.weapons.dropFlares(p.fm.pos, p.fm.vel); } break;
        case 'missile': this.fireMissile(); break;
        case 'level': p.assist.levelT = 3; p.assist.disengage(); this.menus.notice('수평 보정'); break;
        case 'pitchhold': p.assist.setPitchHold(!p.assist.pitchHold, p.fm); this.menus.notice(p.assist.pitchHold ? '상하 고정 ON' : '상하 고정 OFF'); break;
        case 'restart': this.restart(); return;
        case 'bomb':
          if (p.bombs > 0 || this.infAmmo) {
            if (!this.infAmmo) p.bombs--;
            this.weapons.dropBomb(p.worldPoint(new THREE.Vector3(0, -p.spec.geom.radius * 1.2, 0)), p.fm.vel, 'player');
            this.audio.click(); this.menus.notice(`BOMB AWAY · ${p.bombs}`);
          } else this.menus.notice('NO BOMBS');
          break;
        case 'cockpit': this.cam.setMode(this.cam.mode === 'cockpit' ? 'chase' : 'cockpit'); this.camNameT = 1.4; break;
      }
    }
  }

  private fireMissile() {
    const p = this.player!;
    if (p.missiles <= 0 && !this.infAmmo) { this.menus.notice('미사일 없음'); return; }
    const locked = this.lockT >= 1.2 ? this.lockTarget : null;
    const slot = p.spec.missiles - p.missiles;
    const mm = p.missileMeshes[slot % Math.max(1, p.missileMeshes.length)];
    const from = mm ? mm.getWorldPosition(new THREE.Vector3()) : p.worldPoint(new THREE.Vector3(0, -1, 0));
    if (mm && !this.infAmmo) mm.visible = false;
    if (!this.infAmmo) p.missiles--;
    this.weapons.fireMissile(from, p.fm.vel, p.fm.attitude().f, locked, 'player');
    this.audio.missile();
    this.audio.say('fox', 'Fox two', 1);
  }

  private updateFlight(dt: number) {
    const p = this.player!;
    const fm = p.fm;
    this.missionT += dt;
    this.env.time += dt;
    this.input.update(dt);
    const ev = this.input.consume();
    this.handleEvents(ev);
    if (this.state !== 'flight') return;
    const st = this.input.state;
    const c = p.controls;
    c.throttle = st.throttle;
    c.ab = st.ab;
    c.reverse = st.reverse;
    c.brake = st.brake > 0 ? st.brake : fm.onGround && st.throttle < 0.05 && fm.tas < 1 && !this.env.catapult ? 1 : 0;
    // physics
    if (!fm.crashed) {
      const out = p.assist.update(dt, fm, { pitch: st.pitch, roll: st.roll, yaw: st.yaw }, st.throttle, st.steer);
      if (out.throttle !== null) { c.throttle = out.throttle; this.input.setThrottle(out.throttle); }
      if (out.brake !== null) c.brake = out.brake;
      c.steer = out.steer;
      const hold = this.env.catapult && fm.onGround && !fm.catapulting;
      if (hold) c.brake = 1;
      const holdPos = hold ? fm.pos.clone() : null;
      const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < sub; i++) fm.step(dt / sub, out.cmd, c, this.env);
      if (holdPos) { fm.pos.x = holdPos.x; fm.pos.z = holdPos.z; fm.vel.x = 0; fm.vel.z = 0; }
      if (this.env.catapult && !fm.onGround && !fm.catapulting && fm.agl > 15) this.env.catapult = false;
      // obstacle collisions
      if (!fm.crashed && !fm.invincible) {
        const hit = this.world.obstacleHit(fm.pos, p.spec.geom.radius) || this.world.obstacleHit(p.worldPoint(p.vis.tipL), 0.5) || this.world.obstacleHit(p.worldPoint(p.vis.tipR), 0.5);
        if (hit) fm.crash(hit);
        for (const e of this.enemies) if (e.alive && e.pos.distanceTo(fm.pos) < (e.radius + p.vis.radius) * 0.6) { fm.crash('공중 충돌'); e.kill(e.pos); }
      }
      this.protectMsg = out.protect;
    }
    // stats
    this.maxG = Math.max(this.maxG, fm.gLoad); this.maxSpd = Math.max(this.maxSpd, fm.ias); this.dist += fm.vel.length() * dt;
    if (fm.gear > 0.99 && this.lastGear <= 0.99) this.audio.click();
    this.lastGear = fm.gear;
    // weapons
    this.weapons.playerPos.copy(fm.pos);
    if (!fm.crashed && (p.spec.gun > 0)) {
      if (st.fire && (p.gunAmmo > 0 || this.infAmmo)) {
        this.gunAcc += dt;
        while (this.gunAcc > 1 / 18) {
          this.gunAcc -= 1 / 18;
          if (!this.infAmmo) p.gunAmmo--;
          const f = fm.attitude().f;
          this.weapons.fireGun(p.worldPoint(new THREE.Vector3(0.6, 0.2, -p.spec.geom.length * 0.42)), f, fm.vel, 'player', 0.0025);
          this.cam.shake(0.05);
        }
        this.fx.muzzle(p.worldPoint(new THREE.Vector3(0.6, 0.2, -p.spec.geom.length * 0.47)), fm.vel, fm.attitude().f);
      }
      // lock-on
      const cand = this.findCandidate();
      if (cand !== this.lockTarget) { this.lockTarget = cand; this.lockT = 0; } else if (cand) this.lockT += dt;
    }
    this.weapons.update(dt);
    for (const e of this.enemies) e.update(dt, p, this.env);
    for (const g of this.grounds) g.update(dt, p, this.t);
    // mission
    if (!this.ended) this.updateObjective(dt);
    this.landing.update(dt, fm);
    this.rings?.update(this.t);
    // record replay (30 Hz)
    this.recT += dt;
    if (this.recT > 1 / 30 && !fm.crashed) {
      this.recT = 0;
      this.frames.push({ p: fm.pos.toArray(), q: fm.quat.toArray() as number[], s: [fm.de, fm.da, fm.dr, fm.flaps, fm.gear, fm.thr, fm.abOn, fm.airbrake, fm.rpm, ...fm.gearState.map((g) => g.compression)] });
      if (this.frames.length > 30 * 360) this.frames.shift();
    }
    // visuals
    if (!fm.crashed) p.animate(dt, this.fx, this.world.sky.night, this.cam.inCockpit);
    this.cam.target = this.lockTarget?.pos ?? null;
    if (this.cam.mode === 'padlock' && !this.cam.target) {
      const next = this.rings?.next;
      if (next) this.cam.target = next.position;
    }
    this.cam.update(dt, p, st.lookX, st.lookY, st.zoom, st.looking);
    st.lookX = 0; st.lookY = 0; st.zoom = 0;
    // cloud whiteout + turbulence inside clouds
    const inCloud = settings.clouds ? this.world.clouds.densityAt(this.r.camera.position) : 0;
    this.world.sky.fog.density += inCloud * 0.004;
    this.env.turbulence = this.world.sky.weather.turbulence + this.world.clouds.densityAt(fm.pos) * 0.6;
    this.world.update(dt, this.r.camera, fm.pos, fm.vel, this.fx);
    if (inCloud > 0) this.world.sky.fog.density = Math.max(this.world.sky.fog.density, inCloud * 0.005);
    this.fx.update(dt, this.world.sky.fog);
    this.prevPos.copy(fm.pos);
    // G effects on screen
    const g = fm.gLoad;
    const gm = p.spec.gMax;
    const black = clamp((g - gm * 0.85) / (gm * 0.3), 0, 1) * (p.spec.engine.type === 'jet' ? 1 : 0.6);
    const red = clamp((-g - 2) / 2, 0, 1);
    this.r.grade.uniforms.uRedout.value = black > 0 ? black * 0.9 : -red * 0.8;
    this.updateAudio(dt);
    this.pushControlStatus();
    this.drawHUD(dt);
    this.menus.updateAP();
    if (this.camNameT > 0) this.camNameT -= dt;
  }
  private protectMsg = '';

  private pushControlStatus() {
    const p = this.player!, fm = p.fm, s = p.spec;
    this.input.setStatus({
      bombs: p.bombs, weapons: s.gun > 0, gun: this.infAmmo ? 999 : p.gunAmmo, missiles: this.infAmmo ? 99 : p.missiles, flares: p.flares,
      lock: this.lockTarget ? clamp(this.lockT / 1.2, 0, 1) : 0, locked: this.lockT >= 1.2,
      retract: s.retract, gearDown: p.controls.gearDown, onGround: fm.onGround, lowSlow: fm.agl < 450 && fm.ias < s.vRef * 1.8,
      hook: s.hook, hookDown: p.controls.hook, catapult: this.env.catapult && fm.onGround && !fm.catapulting,
      flaps: p.controls.flaps > 0.01 ? `${Math.round(p.controls.flaps * 100)}%` : 'UP', hasFlaps: s.flapNotches.length > 1,
      airbrake: p.controls.airbrake, hasAirbrake: s.brakeCD > 0, ap: p.assist.ap.on, app: p.assist.ap.app, pitchHold: p.assist.pitchHold,
    });
  }

  private findCandidate(): Target | null {
    const p = this.player!;
    const f = p.fm.attitude().f;
    const list = this.weapons.targets.filter((t) => t.alive && t.team === 'enemy');
    if (this.targetCycle && list.length) {
      // manual cycling: prefer the n-th closest target in a wide cone
      const sorted = list.map((t) => ({ t, d: t.pos.distanceTo(p.fm.pos) })).filter((x) => x.d < 9000).sort((a, b) => a.d - b.d);
      if (sorted.length) {
        const pick = sorted[this.targetCycle % sorted.length].t;
        const dir = pick.pos.clone().sub(p.fm.pos).normalize();
        if (dir.dot(f) > Math.cos(0.6)) return pick;
      }
    }
    return this.weapons.findLock(p.fm.pos, f, 'player', 0.42, p.spec.id === 'specter' ? 8000 : 6500);
  }

  private updateAudio(dt: number) {
    const p = this.player!;
    const fm = p.fm;
    const camPos = this.r.camera.position;
    const toCam = camPos.clone().sub(fm.pos);
    const d = toCam.length();
    const radial = d > 1 ? fm.vel.dot(toCam) / d : 0;
    const external = !this.cam.inCockpit && (this.cam.mode === 'flyby' || this.cam.mode === 'tower' || this.cam.mode === 'cinematic' || this.cam.mode === 'orbit');
    const doppler = external ? clamp(343 / Math.max(60, 343 - radial), 0.5, 2) : 1;
    const gain = external ? clamp(60 / (d + 30), 0.03, 1) : 1;
    this.audio.engine(p.spec.engine.type, fm.crashed ? 0 : fm.rpm, fm.abOn, fm.crashed ? 0 : fm.tas, this.cam.inCockpit, doppler, fm.crashed ? 0 : gain, this.world.sky.weather.rain);
    this.audio.stall(fm.stall > 0.25 && !fm.onGround && !fm.crashed);
    const incoming = this.weapons.incomingToPlayer();
    this.audio.tone(incoming < 4000 ? 3 : this.lockT >= 1.2 ? 2 : this.lockTarget ? 1 : 0, this.t);
    // altitude callouts during landing (radio altitude, ft)
    const raFt = fm.agl * M_TO_FT;
    if (fm.gear > 0.9 && fm.vs < -0.5 && !fm.onGround) {
      for (const a of [500, 100, 50, 40, 30, 20, 10]) {
        if (this.calloutAlt > a && raFt <= a) { this.audio.say('ra' + a, a === 500 ? 'Five hundred' : String(a), 0.5); if (a === 20 && p.spec.mass > 30000) setTimeout(() => this.audio.say('ret', 'Retard', 0.5), 400); }
      }
      this.calloutAlt = raFt;
    } else if (fm.onGround || fm.vs > 1) this.calloutAlt = 9999;
    void dt;
  }

  private warnings(): { w: string[]; c: string[] } {
    const p = this.player!;
    const fm = p.fm;
    const w: string[] = [], c: string[] = [];
    if (fm.crashed) return { w, c };
    const look = fm.pos.clone().addScaledVector(fm.vel, 6);
    const clr = look.y - Math.max(terrainHeight(look.x, look.z), 0);
    const nearRw = !!runwayAt(fm.pos.x, fm.pos.z) || onCarrierDeck(fm.pos.x, fm.pos.z);
    const landingCfg = fm.gear > 0.9 && fm.ias < p.spec.vRef * 1.5;
    if (!fm.onGround && (clr < 20 || (fm.agl < 300 && fm.vs < -12 && fm.agl / -fm.vs < 7)) && !(landingCfg && fm.vs > -6)) { w.push('PULL UP'); this.audio.say('pullup', 'Pull up', 1.6); }
    if (fm.stall > 0.3 && !fm.onGround) { w.push('STALL'); this.audio.say('stall', 'Stall', 2.5); }
    if (fm.gLoad > p.spec.gMax * 0.95) w.push('OVER-G');
    if (this.weapons.incomingToPlayer() < 4000) { w.push('MISSILE'); this.audio.say('missile', 'Missile, missile', 3); }
    if (fm.hp.engine < 30) w.push(fm.hp.engine <= 0 ? 'ENGINE FAIL' : 'ENGINE FIRE');
    if (!fm.engineRunning && fm.hp.engine > 0) c.push('ENGINE OFF — I 키로 재시동');
    if (fm.fuel / p.spec.fuel < 0.1 && !fm.infiniteFuel) { c.push('BINGO FUEL'); this.audio.say('bingo', 'Bingo fuel', 20); }
    if (p.spec.retract && fm.gear < 0.5 && fm.agl < 200 && fm.vs < -2 && fm.ias < p.spec.vRef * 1.35) { c.push('GEAR UP'); this.audio.say('gear', 'Too low, gear', 4); }
    if (!fm.onGround && fm.agl < 300 && fm.vs < -9 && fm.gear > 0.5) c.push('SINK RATE');
    if (fm.hp.wingL < 50 || fm.hp.wingR < 50) c.push('WING DAMAGE');
    if (fm.hp.tail < 50) c.push('TAIL DAMAGE');
    if (p.assist.gcasActive) c.push('AUTO GCAS');
    if (this.env.catapult && fm.onGround && !fm.catapulting) c.push('캐터펄트: 스로틀 최대 → CAT 버튼 (J)');
    if (fm.hooked) c.push('ARRESTED');
    void nearRw;
    return { w, c };
  }

  private drawHUD(dt: number) {
    const p = this.player!;
    const fm = p.fm;
    const at = fm.attitude();
    const { w, c } = this.warnings();
    const targets: HudTarget[] = [];
    for (const t of this.weapons.targets) {
      if (!t.alive || t.team !== 'enemy') continue;
      const d = t.pos.distanceTo(fm.pos);
      if (d > 20000) continue;
      targets.push({ pos: t.pos, kind: t.kind, label: t.name, dist: d, locked: t === this.lockTarget && this.lockT >= 1.2, locking: t === this.lockTarget ? clamp(this.lockT / 1.2, 0, 1) : 0 });
    }
    if (this.rings) {
      const n = this.rings.next;
      if (n) targets.push({ pos: n.position, kind: 'ring', label: `RING ${this.rings.idx + 1}/${this.rings.meshes.length}`, dist: n.position.distanceTo(fm.pos) });
    }
    const o = this.obj;
    // nearest airfield marker for long flights
    if (o?.type !== 'land') {
      let best = RUNWAYS[0], bd = Infinity;
      for (const r of RUNWAYS) { const d = Math.hypot(r.cx - fm.pos.x, r.cz - fm.pos.z); if (d < bd) { bd = d; best = r; } }
      if (bd > 3500) targets.push({ pos: new THREE.Vector3(best.cx, best.elev, best.cz), kind: 'friend', label: best.name, dist: bd });
    }
    if (o?.type === 'reach') { const pp = new THREE.Vector3(o.x, fm.pos.y, o.z); targets.push({ pos: pp, kind: 'wp', label: 'WAYPOINT', dist: pp.distanceTo(fm.pos) }); }
    if (o?.type === 'land' && !fm.onGround) {
      const ap = nearestApproach(fm.pos);
      const tp = new THREE.Vector3(ap.tdx, ap.elev, ap.tdz);
      targets.push({ pos: tp, kind: 'wp', label: ap.carrier ? 'CARRIER' : 'RWY', dist: tp.distanceTo(fm.pos) });
    }
    let objective = '';
    if (o) {
      objective = o.label;
      if (o.type === 'aero' && this.aero) objective = o.moves.map((m) => `${this.aero!.done.has(m) ? '✔' : '○'} ${MOVE_NAMES[m]}`).join('   ');
      if (o.type === 'destroy') { const n = this.weapons.targets.filter((t) => t.alive && t.team === 'enemy').length; objective += ` — 남은 목표 ${n}`; }
    }
    // lead pip
    let leadPip: THREE.Vector3 | null = null;
    if (this.lockTarget && p.spec.gun > 0) {
      const d = this.lockTarget.pos.distanceTo(fm.pos);
      if (d < 1600) leadPip = this.lockTarget.pos.clone().addScaledVector(this.lockTarget.vel.clone().sub(fm.vel), d / 1030);
    }
    const ap = nearestApproach(fm.pos);
    const dev = ilsDeviation(fm, ap);
    const aligned = dev.dist > 0 && Math.abs(dev.loc) < dev.dist * 0.3 + 150 && dev.dist < 16000;
    const showIls = aligned && ((fm.gear > 0.5 && p.spec.retract) || p.assist.ap.app || o?.type === 'land' || (fm.gear > 0.5 && dev.dist < 6000 && fm.agl < 600));
    const data: HudData = {
      cockpit: this.cam.inCockpit, hudless: this.cam.inCockpit && (p.spec.engine.type !== 'jet' || p.spec.mass > 20000), ias: fm.ias, tas: fm.tas, alt: fm.pos.y, agl: fm.agl, vs: fm.vs, hdg: at.hdg, pitch: at.pitch, roll: at.roll, g: fm.gLoad, mach: fm.mach, aoa: fm.alpha,
      thr: fm.thr, ab: fm.abOn, fuel: fm.fuel, fuelMax: p.spec.fuel, gear: fm.gear, flaps: fm.flaps, brake: p.controls.brake > 0.5 && fm.onGround, airbrake: fm.airbrake, hook: fm.hook, retract: p.spec.retract,
      fpm: null, vel: fm.vel, pos: fm.pos, fwd: at.f, warnings: w, cautions: c, protect: this.protectMsg,
      ap: p.assist.ap,
      ils: showIls && !fm.onGround ? { dist: dev.dist, loc: dev.loc, gs: dev.gs, carrier: ap.carrier, pathAlt: dev.pathAlt, tdx: ap.tdx, tdz: ap.tdz, elev: ap.elev, hdgDeg: ap.hdg, gsDeg: ap.gs } : null,
      targets, objective, timer: this.mission ? this.missionT : null, score: this.kills ? `격추/파괴 ${this.kills}` : '',
      gun: this.infAmmo ? 999 : p.gunAmmo, missiles: this.infAmmo ? 99 : p.missiles, flares: p.flares, hasWeapons: p.spec.gun > 0, lockState: this.weapons.incomingToPlayer() < 4000 ? 3 : this.lockT >= 1.2 ? 2 : 0, leadPip,
      ccip: p.bombs > 0 && !fm.onGround && fm.agl < 5000 ? Weapons.predictImpact(fm.pos, fm.vel) : null, bombs: p.bombs,
      hp: fm.hp, mode: settings.assist, units: settings.units, vref: p.spec.vRef, vstall: p.spec.vStall, wind: this.env.wind, paused: false, camName: this.camNameT > 0 ? CAM_NAMES[this.cam.mode] : '',
    };
    this.hud.draw(data, this.r.camera, dt);
  }

  /* ================= pause / photo / replay ================= */
  private updateFrozen(dt: number) {
    const p = this.player;
    this.input.update(dt);
    const ev = this.input.consume();
    if (this.state === 'photo') {
      if (ev.has('pause') || ev.has('photo')) { this.exitPhoto(); return; }
    } else if (this.state === 'paused' && ev.has('pause')) { this.resume(); return; }
    if (p) {
      const st = this.input.state;
      if (this.state === 'results') st.lookX += dt * 0.12;
      if (p.fm.crashed && this.state === 'results') {
        // orbit the wreck
        this.cam.update(dt, p, st.lookX, st.lookY, st.zoom, true);
      } else this.cam.update(dt, p, st.lookX, st.lookY, st.zoom, st.looking || this.state === 'photo');
      st.lookX = 0; st.lookY = 0; st.zoom = 0;
      this.world.update(0, this.r.camera, p.fm.pos, new THREE.Vector3(), this.fx);
      if (this.state === 'results') {
        if (this.wreck > 0 && p.vis.root.visible) { this.wreck -= dt * 0.05; if (Math.random() < 0.5) this.fx.trailSmoke(p.fm.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(1, 3, 0), 0.8, 2); }
        this.fx.update(dt, this.world.sky.fog);
      }
    }
    this.audio.silenceEngine();
    this.audio.tone(0, 0);
  }

  pauseGame() {
    if (this.state !== 'flight') return;
    this.state = 'paused';
    this.input.show(false);
    this.hud.clear();
    this.audio.silenceEngine();
    this.menus.closeAP();
    this.menus.pause(this.obj?.label ?? (this.sandbox ? '자유 비행' : ''));
  }
  resume() {
    if (!this.player) return;
    this.state = 'flight';
    this.menus.hideAll();
    this.input.show(true);
    this.hud.visible = true;
    this.clock.getDelta();
  }
  restart() {
    if (this.mission) this.startMission(this.mission, this.player!.spec.id, this.menus.selLiv);
    else if (this.sandbox) this.startSandbox(this.sandbox);
  }
  quit() {
    this.clearCombat();
    if (this.player) { this.r.scene.remove(this.player.group); this.player.removeTrails(); this.player = null; }
    this.state = 'menu';
    this.input.show(false);
    this.hud.visible = false; this.hud.clear();
    this.menus.closeAP(); this.menus.tip(null);
    this.r.grade.uniforms.uRedout.value = 0;
    this.audio.silenceEngine();
    this.audio.menuMusic(true);
    this.menus.main();
  }
  photo() {
    if (!this.player) return;
    this.state = 'photo';
    this.input.show(false);
    this.input.enabled = true;
    this.hud.visible = false; this.hud.clear();
    this.cam.setMode('orbit');
    this.menus.closeAP();
    this.menus.photoUI();
    // allow drag look on the canvas
    this.input.root.style.display = '';
    this.input.root.querySelectorAll<HTMLElement>(':scope > *').forEach((e) => (e.style.visibility = 'hidden'));
  }
  exitPhoto() {
    this.input.root.querySelectorAll<HTMLElement>(':scope > *').forEach((e) => (e.style.visibility = ''));
    this.cam.setMode('chase');
    this.resume();
  }
  screenshot() {
    const url = this.r.screenshot();
    const a = document.createElement('a');
    a.href = url; a.download = `skyace-${Date.now()}.png`; a.click();
    this.menus.toast('스크린샷 저장됨', 'var(--gn)');
  }

  replay() {
    if (!this.player || this.frames.length < 2) return;
    this.state = 'replay';
    this.replayIdx = 0;
    this.menus.hideAll();
    this.player.vis.root.visible = true;
    this.cam.setMode('cinematic');
    this.input.show(false);
    this.input.enabled = true;
    this.menus.toast('▶ REPLAY — 탭/ESC로 종료 · C 시점 전환', 'var(--cy)', 3000);
    const exit = () => { removeEventListener('pointerdown', exit); if (this.state === 'replay') this.endReplay(); };
    setTimeout(() => addEventListener('pointerdown', exit), 300);
  }
  private endReplay() {
    this.state = 'results';
    this.input.enabled = false;
    if (this.outcome) this.menus.results(this.outcome);
    this.cam.setMode('orbit');
  }
  private updateReplay(dt: number) {
    const p = this.player!;
    const fm = p.fm;
    this.input.update(dt);
    const ev = this.input.consume();
    if (ev.has('pause')) { this.endReplay(); return; }
    if (ev.has('camera')) this.cam.next(1);
    this.replayIdx += dt * 30;
    const i = Math.floor(this.replayIdx);
    if (i >= this.frames.length - 1) { this.endReplay(); return; }
    const a = this.frames[i], b = this.frames[i + 1], k = this.replayIdx - i;
    const pa = new THREE.Vector3().fromArray(a.p), pb = new THREE.Vector3().fromArray(b.p);
    fm.vel.copy(pb).sub(pa).multiplyScalar(30);
    fm.pos.copy(pa.lerp(pb, k));
    fm.quat.copy(new THREE.Quaternion().fromArray(a.q).slerp(new THREE.Quaternion().fromArray(b.q), k));
    [fm.de, fm.da, fm.dr, fm.flaps, fm.gear, fm.thr, fm.abOn, fm.airbrake, fm.rpm] = a.s;
    fm.gearState.forEach((g, j) => (g.compression = a.s[9 + j] ?? 0));
    fm.tas = fm.vel.length();
    p.animate(dt, this.fx, this.world.sky.night, false);
    this.cam.update(dt, p, 0, 0, 0, false);
    this.world.update(dt, this.r.camera, fm.pos, fm.vel, this.fx);
    this.fx.update(dt, this.world.sky.fog);
    const toCam = this.r.camera.position.clone().sub(fm.pos), d = toCam.length();
    const doppler = clamp(343 / Math.max(60, 343 - fm.vel.dot(toCam) / Math.max(d, 1)), 0.5, 2);
    this.audio.engine(p.spec.engine.type, fm.rpm, fm.abOn, fm.tas, false, doppler, clamp(80 / (d + 30), 0.05, 1), 0);
  }

  /* ================= settings / AP / misc ================= */
  applySettings(graphics: boolean) {
    if (graphics) { this.r.applyQuality(); this.world.applyQuality(this.r.profile); }
    this.input.build();
    this.input.setWeapons(!!this.player && (this.player.spec.gun > 0 || this.player.spec.flares > 0));
    this.audio.setVolume();
    if (this.player) { this.player.assist.level = settings.assist; this.player.assist.autoRudder = settings.autoRudder; this.player.assist.groundAssist = settings.groundAssist; }
  }
  ap() { return this.player?.assist.ap ?? null; }
  apCmd(cmd: string, d = 0) {
    const p = this.player;
    if (!p) return;
    const a = p.assist;
    const ap = a.ap;
    switch (cmd) {
      case 'ap': if (ap.on && !ap.app) a.disengage(); else a.engageAP(p.fm); break;
      case 'app': {
        if (a.ap.app) { a.disengage(); this.menus.notice('자동 착륙 OFF'); break; }
        a.engageApproach(p.fm);
        const tgt = nearestApproach(p.fm.pos);
        if (tgt.carrier && p.spec.hook) p.controls.hook = true;
        if (p.spec.retract) p.controls.gearDown = true;
        if (p.spec.flapNotches.length > 1) { p.flapIdx = p.spec.flapNotches.length - 1; p.controls.flaps = p.spec.flapNotches[p.flapIdx]; }
        this.menus.notice(`APP · ${tgt.carrier ? '항모' : tgt.rw?.name ?? ''} 자동 접근`);
        break;
      }
      case 'off': a.disengage(); break;
      case 'alt': if (d) ap.altT = Math.max(100, ap.altT + d * (settings.units === 'aviation' ? 152.4 : 100)); else ap.alt = !ap.alt; break;
      case 'hdg': if (d) ap.hdgT = (ap.hdgT + d * 10 + 360) % 360; else ap.hdg = !ap.hdg; break;
      case 'spd': if (d) ap.spdT = Math.max(p.spec.vStall * 1.2, ap.spdT + d * 5.14); else ap.spd = !ap.spd; break;
    }
  }
  requestTilt() { this.input.requestTilt(); }
  ui() { this.audio.init(); this.audio.ui(); }
}

export { MISSIONS };
