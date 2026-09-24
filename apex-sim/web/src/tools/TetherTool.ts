// §20 sandbox tools: node grab (drag a node with the mouse — pull it along or lift it) and crane / winch (hook a node
// to a crane point above it and reel it up or down). Both are core tethers (World::addTether): the physics does the
// pulling, this only picks nodes, moves the hand and draws the lines.
import * as THREE from 'three/webgpu';
import type { PhysicsClient, RenderFrame } from '../physics/PhysicsClient';
import type { TetherState } from '../physics/messages';
import type { Viewer } from '../render/Viewer';
import { t } from '../ui/i18n';

export type TetherMode = 'off' | 'grab' | 'crane';

export const GRAB_STRENGTH = -2; // twice the grabbed body's weight: lifts it at 1 g (core: < 0 = × body weight)
export const GRAB_MAX = 25000; // [N] the colour scale's top
export const CRANE_HEIGHT = 4; // [m] hook above the picked node
export const CRANE_CAPACITY = 40000; // [N]
export const REEL_SPEED = 0.6; // [m/s]
const PICK_PX = 14;

export interface PickedNode {
  body: number;
  node: number;
  position: THREE.Vector3; // render space
}

/** The node under the pointer: the closest to the camera within PICK_PX, else the closest on screen within 2·PICK_PX. */
export function pickNode(frame: RenderFrame, camera: THREE.Camera, x: number, y: number, width: number, height: number): PickedNode | null {
  const v = new THREE.Vector3();
  let best: { i: number; score: number } | null = null;
  const total = frame.nodeOffset[frame.bodyCount - 1] + frame.nodeCount[frame.bodyCount - 1];
  for (let i = 0; i < total; i++) {
    v.set(frame.positions[i * 3], frame.positions[i * 3 + 1], frame.positions[i * 3 + 2]);
    const depth = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const px = Math.hypot(((v.x + 1) / 2) * width - x, ((1 - v.y) / 2) * height - y);
    if (px > 2 * PICK_PX) continue;
    const score = px <= PICK_PX ? depth : 1e6 + px; // near ones first, then by screen distance
    if (!best || score < best.score) best = { i, score };
  }
  if (!best) return null;
  let body = 0;
  while (body + 1 < frame.bodyCount && best.i >= frame.nodeOffset[body + 1]) body++;
  const p = frame.positions;
  return { body, node: best.i - frame.nodeOffset[body], position: new THREE.Vector3(p[best.i * 3], p[best.i * 3 + 1], p[best.i * 3 + 2]) };
}

export class TetherTool {
  mode: TetherMode = 'off';
  private frame: RenderFrame | null = null;
  private grab: { id: number | null; plane: THREE.Plane; pointer: number } | null = null;
  private readonly cranes: number[] = [];
  private reel = 0; // −1 up, +1 down, 0 hold
  private readonly lines: THREE.LineSegments;
  private readonly hooks: THREE.InstancedMesh;
  private readonly raycaster = new THREE.Raycaster();
  onChange: ((text: string) => void) | null = null;

  constructor(
    private readonly physics: PhysicsClient,
    private readonly viewer: Viewer,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.hooks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb020 }), 64);
    this.hooks.frustumCulled = false;
    this.hooks.count = 0;
    viewer.scene.add(this.lines, this.hooks);
    // Capture phase: a pointer that lands on a node is ours, not the orbit controls'.
    canvas.addEventListener('pointerdown', (e) => this.down(e), { capture: true });
    canvas.addEventListener('pointermove', (e) => this.move(e), { capture: true });
    canvas.addEventListener('pointerup', (e) => this.up(e), { capture: true });
    canvas.addEventListener('pointercancel', (e) => this.up(e), { capture: true });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    // A new scene is a new world: its tethers are gone.
    physics.onTopology(({ reset }) => {
      if (!reset) return;
      this.cranes.length = 0;
      this.grab = null;
      this.viewer.controls.enabled = true;
      this.report();
    });
  }

  setMode(mode: TetherMode): void {
    this.mode = mode;
    this.canvas.style.cursor = mode === 'off' ? '' : 'crosshair';
  }

  /** Winch control: −1 reel up, +1 pay out, 0 stop (hold the current length). */
  setReel(direction: number): void {
    this.reel = Math.sign(direction);
    if (this.reel === 0) {
      for (const id of this.cranes) {
        const t = this.state(id);
        if (t) this.physics.setTetherLength(id, t.length);
      }
    }
  }

  releaseAll(): void {
    for (const id of this.cranes) this.physics.removeTether(id);
    this.cranes.length = 0;
    if (this.grab?.id != null) this.physics.removeTether(this.grab.id);
    this.grab = null;
    this.viewer.controls.enabled = true;
    this.report();
  }

  /** Tethers created by this tool (tests). */
  get active(): { grab: number | null; cranes: number[] } {
    return { grab: this.grab?.id ?? null, cranes: [...this.cranes] };
  }

  /** Grabs the node under screen point (x, y) as a pointer would (tests and tools). */
  async grabAt(x: number, y: number): Promise<number | null> {
    if (!this.frame) return null;
    const hit = pickNode(this.frame, this.viewer.camera, x, y, this.canvas.clientWidth, this.canvas.clientHeight);
    if (!hit) return null;
    const id = await this.physics.addTether({
      body: hit.body, node: hit.node, anchorBody: -1, anchorNode: -1, anchor: hit.position.toArray() as [number, number, number],
      length: 0, rope: false, maxForce: GRAB_STRENGTH, reelSpeed: 0,
    });
    return id >= 0 ? id : null;
  }

  update(frame: RenderFrame | null): void {
    if (frame && frame.bodyCount > 0) this.frame = frame;
    // Keep each winch's target just beyond its length while reeling, so the drum runs at its own speed.
    if (this.reel !== 0) {
      for (const id of this.cranes) {
        const t = this.state(id);
        if (t) this.physics.setTetherLength(id, Math.max(0.3, t.length + this.reel * 0.5));
      }
    }
    const tethers = this.physics.tethers;
    const pos = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const n = Math.min(tethers.length, 64);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = tethers[i];
      pos.setXYZ(2 * i, ...t.nodePosition);
      pos.setXYZ(2 * i + 1, ...t.anchorPosition);
      // White when slack, amber → red toward the grip's strength / winch capacity.
      const limit = this.cranes.includes(t.id) ? CRANE_CAPACITY : GRAB_MAX;
      const s = Math.min(t.tension / limit, 1);
      const c = new THREE.Color().setRGB(1, 1 - 0.55 * s, 1 - 0.9 * Math.min(1, s * 3));
      col.setXYZ(2 * i, c.r, c.g, c.b);
      col.setXYZ(2 * i + 1, c.r, c.g, c.b);
      this.hooks.setMatrixAt(i, m.makeTranslation(...t.anchorPosition));
    }
    pos.needsUpdate = col.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, 2 * n);
    this.hooks.count = n;
    this.hooks.instanceMatrix.needsUpdate = true;
  }

  private state(id: number): TetherState | undefined {
    return this.physics.tethers.find((t) => t.id === id);
  }

  private pointerRay(e: PointerEvent): THREE.Ray {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.viewer.camera);
    return this.raycaster.ray;
  }

  private down(e: PointerEvent): void {
    if (this.mode === 'off' || e.button !== 0 || !this.frame) return;
    const r = this.canvas.getBoundingClientRect();
    const hit = pickNode(this.frame, this.viewer.camera, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (!hit) return; // empty space: let the camera orbit
    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.mode === 'grab') {
      // Drag plane through the node: vertical and facing the camera (drag up to lift), or facing the camera when
      // looking straight down.
      const dir = new THREE.Vector3();
      this.viewer.camera.getWorldDirection(dir);
      const normal = Math.abs(dir.y) > 0.9 ? dir.clone().negate() : new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
      this.grab = { id: null, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.position), pointer: e.pointerId };
      this.viewer.controls.enabled = false;
      this.canvas.setPointerCapture(e.pointerId);
      const pending = this.grab;
      void this.physics
        .addTether({ body: hit.body, node: hit.node, anchorBody: -1, anchorNode: -1, anchor: hit.position.toArray() as [number, number, number], length: 0, rope: false, maxForce: GRAB_STRENGTH, reelSpeed: 0 })
        .then((id) => {
          if (id < 0) return;
          if (this.grab === pending) pending.id = id;
          else this.physics.removeTether(id); // released before the core answered
          this.report();
        });
    } else {
      const hook = hit.position.clone().add(new THREE.Vector3(0, CRANE_HEIGHT, 0));
      void this.physics
        .addTether({ body: hit.body, node: hit.node, anchorBody: -1, anchorNode: -1, anchor: hook.toArray() as [number, number, number], length: CRANE_HEIGHT, rope: true, maxForce: CRANE_CAPACITY, reelSpeed: REEL_SPEED })
        .then((id) => {
          if (id >= 0) this.cranes.push(id);
          this.report();
        });
    }
  }

  private move(e: PointerEvent): void {
    if (!this.grab || e.pointerId !== this.grab.pointer) return;
    e.stopImmediatePropagation();
    const p = this.pointerRay(e).intersectPlane(this.grab.plane, new THREE.Vector3());
    if (p && this.grab.id != null) this.physics.moveTether(this.grab.id, p.toArray() as [number, number, number]);
  }

  private up(e: PointerEvent): void {
    if (!this.grab || e.pointerId !== this.grab.pointer) return;
    e.stopImmediatePropagation();
    if (this.grab.id != null) this.physics.removeTether(this.grab.id);
    this.grab = null;
    this.viewer.controls.enabled = true;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.report();
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (this.cranes.length === 0 || e.target instanceof HTMLInputElement) return;
    if (e.code === 'PageUp' || e.code === 'PageDown') {
      e.preventDefault();
      if (down && e.repeat) return;
      this.setReel(down ? (e.code === 'PageUp' ? -1 : 1) : 0);
    }
  }

  private report(): void {
    this.onChange?.(`${this.grab ? 1 : 0}/${this.cranes.length}`);
  }
}

/** Panel section: grab / crane toggles, winch up · stop · down, release all, and a one-line help. */
export function tetherControls(tool: TetherTool): HTMLElement {
  const button = (label: string, title = '') => Object.assign(document.createElement('button'), { textContent: label, title });
  const grab = button(t('toolGrab'), t('toolGrabHelp'));
  const crane = button(t('toolCrane'), t('toolCraneHelp'));
  const modes: [HTMLButtonElement, TetherMode][] = [[grab, 'grab'], [crane, 'crane']];
  for (const [b, mode] of modes) {
    b.onclick = () => {
      tool.setMode(tool.mode === mode ? 'off' : mode);
      for (const [o, m] of modes) o.classList.toggle('active', tool.mode === m);
    };
  }
  const up = button('▲', t('toolReelUp'));
  const stop = button('■', t('toolReelStop'));
  const down = button('▼', t('toolReelDown'));
  // Hold to reel; let go to stop.
  for (const [b, dir] of [[up, -1], [down, 1]] as const) {
    b.onpointerdown = () => tool.setReel(dir);
    b.onpointerup = b.onpointerleave = () => tool.setReel(0);
  }
  stop.onclick = () => tool.setReel(0);
  const release = button(t('toolRelease'));
  release.onclick = () => tool.releaseAll();
  const row = (...children: HTMLElement[]) => {
    const d = document.createElement('div');
    d.className = 'row';
    d.append(...children);
    return d;
  };
  const help = Object.assign(document.createElement('small'), { className: 'toolhelp', textContent: t('toolHelp') });
  const section = document.createElement('div');
  section.className = 'section tools';
  const h = Object.assign(document.createElement('h2'), { textContent: t('tools') });
  section.append(h, row(grab, crane, release), row(up, stop, down), help);
  return section;
}
