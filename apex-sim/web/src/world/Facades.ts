// Street-front detail on the buildings (visual only, instanced per 512 m tile): shop signs (간판) in Korean on the
// ground floors and projecting vertical signs (돌출간판) up the low-rise blocks — lit at night —, awnings over the
// shops, balconies on the villas, air-conditioner units (실외기) on the walls. What makes a street read as lived in.
import * as THREE from 'three/webgpu';
import { attribute, texture, uv } from 'three/tsl';
import type { BuildingSpec } from './builder';
import { hashSeed } from './builder';
import type { MapUniforms } from './MapView';

const SHOP = ['편의점', '카페', '치킨', '약국', '부동산', '미용실', 'PC방', '노래방', '분식', '세탁소', '정형외과', '영어학원', '베이커리', '꽃집', '안경원', '김밥',
  '국밥', '고깃집', '횟집', '떡볶이', '호프', '마트', '철물점', '수선', '문구', '치과', '한의원', '태권도', '피아노', '헬스', '네일', '반찬가게',
  '정육점', '과일', '사진관', '공인중개사', '슈퍼', '세차', '타이어', '카센터', '빵집', '중국집', '돈가스', '냉면', '족발', '삼겹살', '소아과', '독서실'];
const VERTICAL = ['학원', '병원', '치과', '노래방', '당구장', '호프', '사우나', '피아노', '태권도', '내과', '수학', '헬스', 'PC방', '안과', '요가', '미술'];
const SIGN_BG = [0xb3261e, 0x1d3f7a, 0x1f6b45, 0xe08a1e, 0xf4f1e8, 0xf2c230, 0x5b2a86, 0x0f6f84, 0x23272c, 0xd94f70];
const SIGN_FG = [0xffffff, 0xffffff, 0xffffff, 0x1a1a1a, 0xc8261d, 0x1a1a1a, 0xffffff, 0xffffff, 0xf2c230, 0xffffff];

const FONT = `'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif`;
const W = 1024, CELL_W = 256, CELL_H = 64, H_COLS = 4, H_ROWS = 12, V_W = 64, V_H = 256;

/** The sign atlas: 48 horizontal signs (256 × 64 px) over 16 vertical ones (64 × 256 px) along the bottom. */
function signAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  const tex = new THREE.CanvasTexture(canvas);
  drawSigns(canvas.getContext('2d')!);
  // The UI's web font may still be on its way: draw again once it is in.
  document.fonts?.load(`800 40px ${FONT}`, '편의점').then(() => {
    drawSigns(canvas.getContext('2d')!);
    tex.needsUpdate = true;
  }).catch(() => {});
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawSigns(g: CanvasRenderingContext2D): void {
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  for (let k = 0; k < H_COLS * H_ROWS; k++) {
    const x = (k % H_COLS) * CELL_W, y = Math.floor(k / H_COLS) * CELL_H;
    const ci = (k * 7) % SIGN_BG.length;
    g.fillStyle = hex(SIGN_BG[ci]);
    g.fillRect(x, y, CELL_W, CELL_H);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8);
    g.fillStyle = hex(SIGN_FG[ci]);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const name = SHOP[k % SHOP.length];
    g.font = `800 ${name.length > 4 ? 34 : 42}px ${FONT}`;
    g.fillText(name, x + CELL_W / 2, y + CELL_H / 2 + 2, CELL_W - 20);
  }
  for (let k = 0; k < VERTICAL.length; k++) {
    const x = k * V_W, y = H_ROWS * CELL_H;
    const ci = (k * 3 + 1) % SIGN_BG.length;
    g.fillStyle = hex(SIGN_BG[ci]);
    g.fillRect(x, y, V_W, V_H);
    g.fillStyle = hex(SIGN_FG[ci]);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 40px ${FONT}`;
    const chars = [...VERTICAL[k]];
    chars.forEach((ch, i) => g.fillText(ch, x + V_W / 2, y + V_H / 2 + (i - (chars.length - 1) / 2) * 50, V_W - 8));
  }
}

/** Atlas cell (u0, v0, du, dv) of horizontal sign `k` / vertical sign `k`. */
function hCell(k: number): [number, number, number, number] {
  const i = k % (H_COLS * H_ROWS);
  return [((i % H_COLS) * CELL_W) / W, 1 - ((Math.floor(i / H_COLS) + 1) * CELL_H) / W, CELL_W / W, CELL_H / W];
}
function vCell(k: number): [number, number, number, number] {
  const i = k % VERTICAL.length;
  return [(i * V_W) / W, 1 - (H_ROWS * CELL_H + V_H) / W, V_W / W, V_H / W];
}

interface Acc {
  signs: Array<{ m: THREE.Matrix4; cell: [number, number, number, number] }>;
  boxes: Array<{ m: THREE.Matrix4; color: number }>;
}

const AWNING = [0xb3261e, 0x1f6b45, 0x1d3f7a, 0xe08a1e, 0x5d6168, 0x8a5a3a];

/** Detail groups per 512 m tile, with their centres (MapView shows them by distance, as the other props). */
export function buildFacades(buildings: BuildingSpec[], u: MapUniforms): Array<{ cx: number; cz: number; group: THREE.Group }> {
  const TILE = 512;
  const tiles = new Map<string, Acc & { tx: number; tz: number }>();
  const acc = (x: number, z: number) => {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE), key = `${tx},${tz}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { tx, tz, signs: [], boxes: [] }));
    return t;
  };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const mat = (x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number) =>
    new THREE.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(pitch, yaw, 0, 'YXZ')), sc.set(sx, sy, sz));
  for (const b of buildings) {
    if (b.type !== 0 && b.type !== 2 && b.type !== 5 && b.type !== 8 && b.type !== 9) continue;
    const h = (k: number) => hashSeed(b.seed, 40 + k);
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const t = acc(b.x, b.z);
    // The four faces, the two long ones first: outward normal (nx, nz), along-facade direction (ax, az), span, half
    // depth behind it.
    const faces = [
      ...[1, -1].map((sg) => ({ nx: sg * s, nz: sg * c, span: b.w, off: b.d / 2 })),
      ...[1, -1].map((sg) => ({ nx: sg * c, nz: -sg * s, span: b.d, off: b.w / 2 })),
    ].map((f) => ({ ...f, ax: -f.nz, az: f.nx }));
    if (b.d > b.w) faces.push(...faces.splice(0, 2));
    const at = (f: (typeof faces)[number], along: number, out: number): [number, number] => [b.x + f.nx * (f.off + out) + f.ax * along, b.z + f.nz * (f.off + out) + f.az * along];
    const faceYaw = (f: (typeof faces)[number]) => Math.atan2(f.nx, f.nz); // a plane's +z along the normal
    if (b.type === 5 || (b.type === 2 && b.h >= 4.5) || (b.type === 0 && b.h > 40)) {
      faces.forEach((f, fi) => {
        if (f.span < 6) return;
        // The ground floor's shops, a sign over each: one per 8 m of frontage, up to four.
        const n = Math.max(1, Math.min(4, Math.floor(f.span / 8)));
        const w = Math.min((f.span / n) * 0.8, b.type === 5 ? 5.2 : 4.6);
        const y = b.type === 5 ? Math.min(3.75, b.h - w / 8 - 0.1) : b.type === 0 ? 4.6 : 3.4;
        for (let k = 0; k < n; k++) {
          if (n > 1 && h(50 + fi * 4 + k) < 0.15) continue; // an empty shop
          const along = (k + 0.5) * (f.span / n) - f.span / 2;
          const [x, z] = at(f, along, 0.14);
          t.signs.push({ m: mat(x, b.y + y, z, faceYaw(f), 0, w, w / 4, 1), cell: hCell(Math.floor(h(fi * 8 + k + 2) * 997)) });
        }
        if (b.type === 5 && h(fi + 4) < 0.65) {
          // An awning over the shop front, sloping out and down.
          const [ax, az] = at(f, 0, 0.65);
          t.boxes.push({ m: mat(ax, b.y + 2.75, az, faceYaw(f), 0.38, Math.min(f.span * 0.7, 8), 0.06, 1.4), color: AWNING[Math.floor(h(fi + 6) * AWNING.length)] });
        }
      });
      if (b.type === 2 && b.h >= 9) {
        // Projecting signs up a corner (both faces of the sign, each reading the right way round).
        const f = faces[h(8) < 0.5 ? 0 : 1];
        const n = 1 + (h(9) < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const along = (k === 0 ? 1 : -1) * (f.span / 2 - 0.9);
          const [x, z] = at(f, along, 0.55);
          const y = b.y + 4.4 + 1.6;
          const top = Math.min(3.2, b.h - 5.5);
          if (top < 1.6) continue;
          const yaw = Math.atan2(f.ax, f.az);
          const cell = Math.floor(h(10 + k) * 997);
          t.signs.push({ m: mat(x, y + (top - 3.2) / 2, z, yaw, 0, 0.8, top, 1), cell: vCell(cell) });
          t.signs.push({ m: mat(x, y + (top - 3.2) / 2, z, yaw + Math.PI, 0, 0.8, top, 1), cell: vCell(cell) });
        }
      }
    }
    if (b.type === 8) {
      // Balconies on the front: a slab and a dark glass rail on each floor above the pilotis.
      const f = faces[h(12) < 0.5 ? 0 : 1];
      const w = f.span * (0.42 + h(13) * 0.2), along = (h(14) - 0.5) * (f.span - w) * 0.5;
      for (let y = 2.7 + 2.8; y < b.h - 1; y += 2.8) {
        const [sx, sz] = at(f, along, 0.45);
        t.boxes.push({ m: mat(sx, b.y + y, sz, faceYaw(f), 0, w, 0.12, 0.9), color: 0xc9c5bc });
        const [rx, rz] = at(f, along, 0.88);
        t.boxes.push({ m: mat(rx, b.y + y + 0.5, rz, faceYaw(f), 0, w, 0.9, 0.04), color: h(15) < 0.5 ? 0x3b4652 : 0xe2e4e6 });
      }
    }
    if (b.type === 2 || b.type === 8 || b.type === 9) {
      // Air-conditioner units on a side wall, one or two a floor (fewer on houses).
      const f = faces[h(16) < 0.5 ? 1 : 0];
      const floors = Math.max(1, Math.floor((b.h - (b.type === 8 ? 2.7 : 0)) / 2.8));
      const count = b.type === 9 ? 1 : Math.min(floors + 1, 6);
      for (let k = 0; k < count; k++) {
        const along = (h(20 + k) - 0.5) * (f.span - 1.2);
        const y = (b.type === 8 ? 2.7 : 0) + (Math.floor(h(30 + k) * floors) + 0.25) * 2.8;
        if (y > b.h - 0.6) continue;
        const [x, z] = at(f, along, 0.2);
        t.boxes.push({ m: mat(x, b.y + y, z, faceYaw(f), 0, 0.85, 0.6, 0.35), color: 0xdcdcd6 });
      }
    }
  }
  // Materials: the atlas (lit at night, as the shop fronts), plain colours per instance.
  const atlas = signAtlas();
  const signMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const cell = attribute('sCell', 'vec4');
  const tex = texture(atlas, uv().mul(cell.zw).add(cell.xy));
  signMat.colorNode = tex;
  signMat.emissiveNode = tex.rgb.mul(u.night.mul(0.95));
  const boxMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  const out: Array<{ cx: number; cz: number; group: THREE.Group }> = [];
  const col = new THREE.Color();
  for (const t of tiles.values()) {
    const group = new THREE.Group();
    if (t.signs.length) {
      const g = new THREE.PlaneGeometry(1, 1);
      const cells = new Float32Array(t.signs.length * 4);
      t.signs.forEach((sg, i) => cells.set(sg.cell, i * 4));
      g.setAttribute('sCell', new THREE.InstancedBufferAttribute(cells, 4));
      const inst = new THREE.InstancedMesh(g, signMat, t.signs.length);
      t.signs.forEach((sg, i) => inst.setMatrixAt(i, sg.m));
      inst.computeBoundingSphere();
      group.add(inst);
    }
    if (t.boxes.length) {
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boxMat, t.boxes.length);
      t.boxes.forEach((bx, i) => {
        inst.setMatrixAt(i, bx.m);
        inst.setColorAt(i, col.setHex(bx.color));
      });
      inst.castShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
    group.name = 'facades';
    out.push({ cx: (t.tx + 0.5) * TILE, cz: (t.tz + 0.5) * TILE, group });
  }
  return out;
}
