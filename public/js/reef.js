/* Unity — voxel reef.
   Creatures and scenery are real 3D cube meshes (Minecraft / MagicaVoxel style) drawn with WebGL
   in the same camera and fog as the water shader, so they sit inside the ocean. Swimming, fin
   flutter, wing flaps, jelly pulses and kelp sway all happen in the vertex shader. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lin = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)); };
  const LIN = new Map(); const L_ = (h) => { let v = LIN.get(h); if (!v) { v = lin(h); LIN.set(h, v); } return v; };
  function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const h3 = (x, y, z) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  /* ───────── voxel builder ───────── */
  class VB {
    constructor() { this.v = new Map(); }
    key(x, y, z) { return x + ',' + y + ',' + z; }
    set(x, y, z, c, g = 0, w = 0) { this.v.set(this.key(x, y, z), { x, y, z, c, g, w }); return this; }
    has(x, y, z) { return this.v.has(this.key(x, y, z)); }
    del(x, y, z) { this.v.delete(this.key(x, y, z)); }
    box(x0, y0, z0, x1, y1, z1, c, g = 0, w = 0) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, g, w); return this; }
    bounds() { let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (const v of this.v.values()) { a = [Math.min(a[0], v.x), Math.min(a[1], v.y), Math.min(a[2], v.z)]; b = [Math.max(b[0], v.x + 1), Math.max(b[1], v.y + 1), Math.max(b[2], v.z + 1)]; } return { min: a, max: b }; }
  }
  const STRIDE = 13; // pos3 nor3 col3 uv2 group weight
  /* emit only exposed faces. opts: origin (voxel units), scale, rotY, offset (world), wfn(v, p) -> weight, emissive */
  function emit(vb, out, o = {}) {
    const org = o.origin || [0, 0, 0], s = o.scale || 1, off = o.offset || [0, 0, 0];
    const cr = Math.cos(o.rotY || 0), sr = Math.sin(o.rotY || 0);
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]], TRI = [0, 1, 2, 0, 2, 3];
    for (const v of vb.v.values()) {
      const base = [v.x, v.y, v.z];
      const c = L_(v.c), j = 1 + (h3(v.x * 7 + 3, v.y * 13 + 5, v.z * 11 + 1) - 0.5) * 0.06;
      const em = v.c[0] === '!' ? 1 : 0; // never used; emissive handled via colour > 1
      for (let a = 0; a < 3; a++) for (const sg of [1, -1]) {
        const nb = base.slice(); nb[a] += sg;
        if (vb.has(nb[0], nb[1], nb[2])) continue;
        const b1 = (a + 1) % 3, b2 = (a + 2) % 3;
        const nl = [0, 0, 0]; nl[a] = sg;
        const nx = nl[0] * cr + nl[2] * sr, nz = -nl[0] * sr + nl[2] * cr;
        const corners = UV.map(([u, w]) => { const p = base.slice(); p[a] = sg > 0 ? base[a] + 1 : base[a]; p[b1] = base[b1] + u; p[b2] = base[b2] + w; return p; });
        for (const k of TRI) {
          const p = corners[k];
          const lx = (p[0] - org[0]) * s, ly = (p[1] - org[1]) * s, lz = (p[2] - org[2]) * s;
          const wx = lx * cr + lz * sr + off[0], wy = ly + off[1], wz = -lx * sr + lz * cr + off[2];
          const wgt = o.wfn ? o.wfn(v, lx, ly, lz) : v.w;
          const mul = (o.emissive && o.emissive(v)) || 1;
          out.push(wx, wy, wz, nx, nl[1], nz, c[0] * j * mul, c[1] * j * mul, c[2] * j * mul, UV[k][0], UV[k][1], v.g, wgt);
        }
      }
      void em;
    }
    return out;
  }
  function centered(vb, wfnFactory) {
    const b = vb.bounds(), org = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const arr = emit(vb, [], { origin: org, wfn: wfnFactory ? wfnFactory(ext) : null });
    return { data: new Float32Array(arr), len: ext[0], ext };
  }

  /* ───────── creature models ───────── */
  const swimW = (ext) => (v, x) => (v.g === 3 ? 0 : Math.pow(clamp((ext[0] / 2 - x) / ext[0], 0, 1), 1.7) * 1.35);

  function fishVB(o) {
    const vb = new VB(), L = o.L;
    const prof = (t) => (t < 0.2 ? 0.5 + t * 2.5 : t < 0.72 ? 1 : 1 - (t - 0.72) * 1.5);
    const hh = (i) => Math.max(1, Math.round(o.H * prof(i / (L - 1))));
    const ww = (i) => Math.max(1, Math.round(o.W * (i / (L - 1) < 0.15 ? 0.6 : 1)));
    for (let i = 0; i < L; i++) { const t = i / (L - 1), h = hh(i), w = ww(i); for (let y = -h; y < h; y++) for (let z = -w; z < w; z++) vb.set(i, y, z, o.body(t, (y + 0.5) / h, i, y, z, w)); }
    // peduncle + tail
    const tc = o.tailCol || o.fin;
    vb.box(-1, -1, -1, -1, 0, 0, o.body(0, 0, -1, 0, 0, 1));
    if (o.tail === 'crescent') {
      vb.box(-2, -1, -1, -2, 0, 0, tc);
      for (let k = 1; k <= o.up; k++) vb.box(-2 - Math.floor(k / 2), k, -1, -2 - Math.floor(k / 2), k, 0, tc);
      for (let k = 1; k <= o.dn; k++) vb.box(-2 - Math.floor(k / 2), -1 - k, -1, -2 - Math.floor(k / 2), -1 - k, 0, tc);
    } else {
      const big = o.tailSize || 2;
      vb.box(-2, -big, -1, -2, big - 1, 0, tc);
      vb.box(-3, -big - 1, -1, -3, big, 0, tc);
      if (o.fork) { vb.del(-3, -1, -1); vb.del(-3, -1, 0); vb.del(-3, 0, -1); vb.del(-3, 0, 0); }
    }
    // lips
    if (o.lips) { vb.box(L, -1, -1, L, 0, 0, o.lips); if (o.W >= 2) { vb.set(L, -1, -2, o.lips); vb.set(L, -1, 1, o.lips); } }
    // eyes
    const ei = L - 3, ew = ww(ei);
    if (o.H >= 3) {
      for (const [z, s] of [[ew, 1], [-ew - 1, -1]]) {
        vb.box(ei - 1, 0, z, ei, 1, z, '#f4f6f8');
        vb.set(ei, 0, z, '#0d0f14');
        void s;
      }
    } else {
      vb.set(ei, 0, ew - 1, '#0d0f14'); vb.set(ei, 0, -ew, '#0d0f14');
    }
    // dorsal fins — swept back like the reference
    for (const [t0, t1, ht] of o.dorsal || []) {
      const i0 = Math.round(t0 * (L - 1)), i1 = Math.round(t1 * (L - 1));
      for (let i = i0; i <= i1; i++) {
        const top = hh(i), hgt = Math.max(1, ht - Math.floor(((i1 - i) * ht) / (i1 - i0 + 1)));
        for (let k = 0; k < hgt; k++) { const x = i - Math.floor(k * 0.7); vb.box(x, top + k, -1, x, top + k, 0, o.finFn ? o.finFn(x, k) : o.fin); }
      }
    }
    // ventral "legs" and pectorals
    if (o.ventral !== false && o.H >= 2) {
      const m = Math.round(L * 0.45), m2 = Math.round(L * 0.78);
      for (const mi of [m, m2]) { const b = -hh(mi); vb.box(mi, b - 1, -1, mi, b - 1, 0, o.fin2 || o.fin); vb.box(mi - 1, b - 2, -1, mi, b - 2, 0, o.fin2 || o.fin); }
    }
    if (o.pect !== false) {
      const pi = L - 4, py = -Math.max(1, hh(pi) - 1), pw = ww(pi);
      for (const s of [1, -1]) { const z = s > 0 ? pw : -pw - 1, z2 = s > 0 ? pw + 1 : -pw - 2; vb.set(pi, py, z, o.fin, 2); vb.set(pi - 1, py, z, o.fin, 2); vb.set(pi - 1, py, z2, o.fin2 || o.fin, 2); }
    }
    return vb;
  }

  const SPECIES = {
    rose: {
      vs: 0.074, speed: 0.32, amp: 0.9, school: [3, 6], weight: 1.6, spread: 0.45,
      vb: () => fishVB({ L: 10, H: 3, W: 2, lips: '#e012d0', dorsal: [[0.25, 0.5, 3], [0.6, 0.82, 2]],
        body: (t, yn) => (yn > 0.55 ? '#cf1218' : yn < -0.55 ? '#f0262a' : '#e5161b'),
        fin: '#ff4fa3', fin2: '#e2297f', finFn: (x, k) => ((x + k) % 2 ? '#ff5aa8' : '#e3267f') }),
    },
    clown: {
      vs: 0.067, speed: 0.26, amp: 1, school: [2, 3], weight: 0.6, spread: 0.3,
      vb: () => fishVB({ L: 9, H: 2, W: 1, dorsal: [[0.3, 0.8, 2]], tailSize: 2,
        body: (t, yn, i) => (i === 2 || i === 5 ? '#f6f6f0' : i === 1 || i === 6 ? '#1c1a19' : '#f36b12'),
        fin: '#f36b12', fin2: '#1c1a19', tailCol: '#f36b12', finFn: (x, k) => (k === 1 ? '#1c1a19' : '#f36b12') }),
    },
    tang: {
      vs: 0.070, speed: 0.34, amp: 0.8, school: [3, 6], weight: 1.4, spread: 0.5,
      vb: () => fishVB({ L: 9, H: 3, W: 1, dorsal: [[0.1, 0.85, 1]], tailCol: '#f5c52b', fork: false,
        body: (t, yn) => (yn > 0.25 && t > 0.15 && t < 0.75 ? '#151a33' : '#2b5bd6'), fin: '#1d3f9e', fin2: '#151a33' }),
    },
    yellow: {
      vs: 0.067, speed: 0.3, amp: 0.7, school: [3, 7], weight: 1.4, spread: 0.5,
      vb: () => fishVB({ L: 8, H: 4, W: 1, dorsal: [[0.1, 0.8, 2]], tailSize: 3, lips: '#f8e8a0',
        body: (t, yn) => (yn > 0.6 ? '#e6b51e' : '#f6d232'), fin: '#f2c52b', fin2: '#e6b51e' }),
    },
    cod: {
      vs: 0.070, speed: 0.38, amp: 1, school: [5, 9], weight: 1.8, spread: 0.6,
      vb: () => fishVB({ L: 12, H: 2, W: 1, dorsal: [[0.3, 0.5, 1], [0.6, 0.75, 1]], fork: true, ventral: false,
        body: (t, yn, i, y, z) => (yn < -0.4 ? '#e7dcc4' : h3(i, y, z) > 0.72 ? '#87694a' : '#b99c72'), fin: '#a88b62' }),
    },
    salmon: {
      vs: 0.074, speed: 0.42, amp: 1.1, school: [3, 6], weight: 1.2, spread: 0.6,
      vb: () => fishVB({ L: 13, H: 2, W: 1, dorsal: [[0.4, 0.6, 2]], fork: true, ventral: false,
        body: (t, yn, i, y, z) => (yn > 0.4 ? (h3(i, y, z) > 0.6 ? '#4f5f3a' : '#6e3a30') : yn < -0.4 ? '#efa088' : '#c8523e'), fin: '#9c3c30' }),
    },
    sardine: {
      vs: 0.060, speed: 0.5, amp: 1, school: [10, 18], weight: 2.4, spread: 0.7,
      vb: () => fishVB({ L: 9, H: 1, W: 1, dorsal: [[0.4, 0.6, 1]], fork: true, ventral: false, pect: false, tailSize: 1,
        body: (t, yn) => (yn > 0 ? '#3c6a88' : '#d9e6ec'), fin: '#88a6b8' }),
    },
  };

  function sharkVB() {
    const vb = fishVB({
      L: 30, H: 4, W: 3, tail: 'crescent', up: 9, dn: 5, pect: false, ventral: false,
      dorsal: [[0.48, 0.66, 7], [0.18, 0.24, 2]],
      body: (t, yn, i, y, z, w) => {
        if (i >= 22 && i <= 26 && i % 2 === 0 && (z === w - 1 || z === -w) && yn > -0.5 && yn < 0.6) return '#3d4952';
        return yn > -0.05 ? (yn > 0.6 ? '#556672' : '#667886') : '#e3e7ea';
      },
      fin: '#5a6b77', tailCol: '#5a6b77',
    });
    for (const s of [1, -1]) for (let k = 0; k < 6; k++) { const z = s > 0 ? 3 + k : -4 - k, x0 = 20 - Math.floor(k * 0.8); vb.box(x0 - 3, -2 - Math.floor(k / 2), z, x0, -2 - Math.floor(k / 2), z, '#5a6b77', 2); }
    for (const x of [26, 27, 28]) vb.set(x, -3, -1, '#2a3036'), vb.set(x, -3, 0, '#2a3036');
    return vb;
  }
  function pufferVB() {
    const vb = new VB();
    vb.box(0, 0, 0, 5, 5, 5, (x, y, z) => (y === 0 ? '#f6e7a8' : h3(x, y, z) > 0.75 ? '#c79423' : '#ecc53b'));
    const spike = '#f8eec0';
    for (let a = 0; a <= 5; a += 2) for (let b = 1; b <= 5; b += 2) { vb.set(a, 6, b, spike); vb.set(a, b, 6, spike); vb.set(a, b, -1, spike); vb.set(-1, a, b, spike); }
    for (const z of [1, 4]) { vb.set(6, 3, z, '#f4f6f8'); vb.set(6, 4, z, '#f4f6f8'); vb.set(7, 3, z, '#0d0f14'); }
    vb.box(-2, 2, 2, -2, 3, 3, '#e39a2a'); vb.box(-3, 1, 2, -3, 4, 3, '#e39a2a');
    vb.set(3, 2, 6, '#e39a2a', 2); vb.set(3, 2, -1, '#e39a2a', 2);
    return vb;
  }
  function turtleVB() {
    const vb = new VB();
    for (let x = -7; x <= 6; x++) for (let z = -5; z <= 4; z++) {
      const e = ((x + 0.5) / 7.5) ** 2 + ((z + 0.5) / 5.5) ** 2; if (e > 1) continue;
      const top = Math.round(3.4 * Math.sqrt(1 - e));
      for (let y = 0; y <= top; y++) {
        const edge = ((x + 20) % 4 === 0) || ((z + 20) % 4 === 0);
        vb.set(x, y, z, y === 0 ? '#d7c38a' : y === top ? (edge ? '#334d1f' : (((x + 20) >> 2) + ((z + 20) >> 2)) % 2 ? '#5e8a30' : '#79a63c') : '#4b6b27');
      }
      vb.set(x, -1, z, '#d7c38a');
    }
    vb.box(7, -1, -2, 10, 1, 1, (x, y, z) => (h3(x, y, z) > 0.7 ? '#6f8f45' : '#9cbf6a'));
    vb.set(9, 1, 1, '#0d0f14'); vb.set(9, 1, -2, '#0d0f14');
    for (const s of [1, -1]) {
      for (let k = 0; k < 6; k++) { const z = s > 0 ? 5 + k : -6 - k; vb.box(2 - Math.floor(k * 0.6), -1, z, 4 - Math.floor(k * 0.6), -1, z, '#8aaa58', s > 0 ? 2 : 1, k + 1); }
      for (let k = 0; k < 3; k++) { const z = s > 0 ? 4 + k : -5 - k; vb.box(-6, -1, z, -5, -1, z, '#8aaa58', s > 0 ? 4 : 3, k + 1); }
    }
    vb.box(-9, -1, -1, -8, -1, 0, '#8aaa58');
    return vb;
  }
  function mantaVB() {
    const vb = new VB();
    for (let x = -7; x <= 7; x++) for (let z = -15; z <= 14; z++) {
      const az = Math.abs(z + 0.5) / 15, lim = 7.5 * Math.pow(1 - az, 0.75);
      const cx = x + az * 4;
      if (Math.abs(cx) > lim) continue;
      vb.set(x, 0, z, (h3(x, 0, z) > 0.85 ? '#3d505c' : '#22313b'), 0, az);
      if (az < 0.5) vb.set(x, -1, z, '#e5ecef', 0, az);
    }
    for (const z of [-3, 2]) vb.box(8, 0, z, 9, 0, z, '#22313b');
    for (let k = 0; k < 12; k++) vb.set(-8 - k, 0, 0, '#22313b');
    return vb;
  }
  function jellyVB(c1, c2) {
    const vb = new VB();
    for (let x = -4; x <= 4; x++) for (let y = 0; y <= 4; y++) for (let z = -4; z <= 4; z++) {
      const d = Math.sqrt(x * x + y * y * 1.5 + z * z); if (d > 4.6 || d < 3.2) continue;
      vb.set(x, y, z, y === 0 ? c2 : c1, 1);
    }
    for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU, x = Math.round(Math.cos(an) * 3.5), z = Math.round(Math.sin(an) * 3.5), n = 9 + (a % 3) * 3; for (let y = 1; y <= n; y++) vb.set(x, -y, z, c2, 2, y / n); }
    for (let y = 1; y <= 6; y++) vb.box(-1, -y, -1, 0, -y, 0, c1, 2, y / 8);
    return vb;
  }
  function crabVB() {
    const vb = new VB();
    vb.box(-3, 0, -2, 2, 1, 1, (x, y) => (y === 1 ? '#e4512f' : '#c43a24'));
    vb.box(-2, 2, -1, 1, 2, 0, '#e86a42');
    for (const x of [-2, 1]) { vb.set(x, 2, -3, '#c43a24'); vb.set(x, 3, -3, '#0d0f14'); }
    for (const s of [1, -1]) {
      for (let l = 0; l < 3; l++) { const z = -1 + l, x1 = s > 0 ? 3 : -4, x2 = s > 0 ? 4 : -5; vb.set(x1, 0, z, '#b83422', 1, 1); vb.set(x2, -1, z, '#b83422', 1, 1); }
      const cx = s > 0 ? 3 : -5; vb.box(cx, 0, -4, cx + 1, 1, -3, '#ef6a46'); vb.set(cx + (s > 0 ? 1 : 0), 2, -4, '#ef6a46');
    }
    return vb;
  }
  function boatVB(hull) {
    const vb = new VB();
    for (let x = -20; x <= 19; x++) {
      const u = (x + 20) / 39, B = u > 0.72 ? Math.max(1, Math.round(6 * Math.pow(1 - (u - 0.72) / 0.28, 0.7))) : 6;
      const D = Math.round(4 * (0.65 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.1))));
      for (let z = -B; z < B; z++) {
        const zz = (z + 0.5) / B, bot = -Math.max(1, Math.round(D * (1 - zz * zz * 0.7)));
        for (let y = bot; y <= 2; y++) vb.set(x, y, z, y <= -2 ? hull : y === -1 ? '#f2f2ee' : '#1d3a6b');
      }
      if (u > 0.08 && u < 0.9) vb.box(x, -6, -1, x, -6, 0, '#2a2a2a'), vb.box(x, -5, -1, x, -5, 0, '#2a2a2a');
    }
    vb.box(-10, 3, -4, 2, 6, 3, '#eeeeea'); vb.box(-9, 7, -3, 1, 7, 2, '#b8b8b2');
    vb.box(-22, -4, 0, -22, -2, 0, '#d4b04a', 3); vb.box(-22, -3, -1, -22, -3, 1, '#d4b04a', 3);
    vb.box(-21, -5, -1, -21, 0, 0, '#2a2a2a');
    return vb;
  }

  /* ───────── scenery (baked into one static mesh) ───────── */
  function rockVB(rng, r) {
    const vb = new VB(), rx = r * (1 + rng() * 0.5), ry = r * (0.55 + rng() * 0.3), rz = r * (0.8 + rng() * 0.4);
    for (let x = -Math.ceil(rx); x <= rx; x++) for (let y = 0; y <= ry; y++) for (let z = -Math.ceil(rz); z <= rz; z++) {
      const e = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz);
      if (e > 1 - h3(x, y, z) * 0.25) continue;
      const top = y >= ry * 0.6 || e > 0.75 && y > 0;
      vb.set(x, y, z, top && h3(x + 9, y, z) > 0.45 ? '#557535' : h3(x, y + 3, z) > 0.6 ? '#6c7073' : '#83878a');
    }
    return vb;
  }
  function tubeVB(rng, c, tip) { const vb = new VB(), n = 3 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) { const x = Math.floor(rng() * 4) - 2, z = Math.floor(rng() * 4) - 2, h = 2 + Math.floor(rng() * 4); for (let y = 0; y < h; y++) vb.set(x, y, z, y === h - 1 ? tip : c); } return vb; }
  function brainVB(rng, c1, c2) { const vb = new VB(), r = 2 + Math.floor(rng() * 2); for (let x = -r - 1; x <= r; x++) for (let y = 0; y <= r; y++) for (let z = -r - 1; z <= r; z++) { if ((x + 0.5) ** 2 + (y * 1.3) ** 2 + (z + 0.5) ** 2 > (r + 0.6) ** 2) continue; vb.set(x, y, z, (x + z * 2 + y) % 3 === 0 ? c2 : c1); } return vb; }
  function branchVB(rng, c, tip) {
    const vb = new VB();
    const grow = (x, y, z, n, d) => { for (let i = 0; i < n; i++) { y++; if (rng() < 0.35) x += rng() < 0.5 ? 1 : -1; if (rng() < 0.35) z += rng() < 0.5 ? 1 : -1; vb.set(x, y, z, i === n - 1 ? tip : c); } if (d < 2) for (let k = 0; k < 2; k++) grow(x, y, z, 2 + Math.floor(rng() * 3), d + 1); };
    vb.set(0, 0, 0, c); grow(0, 0, 0, 2 + Math.floor(rng() * 2), 0); return vb;
  }
  function fanVB(rng, c, c2) { const vb = new VB(), r = 3 + Math.floor(rng() * 2); for (let x = -r; x <= r; x++) for (let y = 0; y <= r + 1; y++) { const d = Math.hypot(x, y * 0.9); if (d > r + 0.5) continue; if ((x + y) % 2 === 0 || y === 0 || d > r - 0.6) vb.set(x, y, 0, d > r - 0.6 ? c2 : c); } return vb; }
  function bubbleCoralVB(rng, c, c2) { const vb = new VB(); for (let i = 0; i < 4; i++) { const cx = Math.floor(rng() * 4) - 2, cy = Math.floor(rng() * 3), cz = Math.floor(rng() * 4) - 2, r = 1 + rng(); for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) if (x * x + y * y + z * z <= r * r + 0.5 && cy + y >= 0) vb.set(cx + x, cy + y, cz + z, (x + y + z) % 2 ? c : c2); } return vb; }
  function grassVB(rng) { const vb = new VB(), n = 3 + Math.floor(rng() * 4); for (let i = 0; i < n; i++) { const x = Math.floor(rng() * 5) - 2, z = Math.floor(rng() * 5) - 2, h = 3 + Math.floor(rng() * 5); for (let y = 0; y < h; y++) vb.set(x, y, z, y % 3 === 2 ? '#62b04f' : '#3f8a3a', 0, 0); } return vb; }
  function kelpVB(rng, h) {
    const vb = new VB();
    for (let y = 0; y < h; y++) {
      vb.set(0, y, 0, y % 5 === 4 ? '#7fbf4f' : '#3d7a2e');
      if (y > 1 && y % 2 === 0) { const s = (y / 2) % 2 ? 1 : -1; vb.set(s, y, 0, '#58a043'); if (y % 4 === 0) vb.set(s, y + 1, 0, '#4a9038'); }
      if (y > 2 && y % 3 === 0) vb.set(0, y, (y / 3) % 2 ? 1 : -1, '#58a043');
    }
    return vb;
  }
  function pickleVB(rng) { const vb = new VB(), n = 1 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) { const x = i * 2 - n + 1, h = 1 + Math.floor(rng() * 2); for (let y = 0; y < h; y++) vb.set(x, y, 0, '#5f8f2f'); vb.set(x, h, 0, '#d8ff8a'); } return vb; }
  function anemoneVB(rng, c, tip) {
    const vb = new VB();
    vb.box(-2, 0, -2, 1, 0, 1, '#7a3a63');
    for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU, x = Math.round(Math.cos(an) * 2) - (Math.cos(an) < 0 ? 1 : 0), z = Math.round(Math.sin(an) * 2) - (Math.sin(an) < 0 ? 1 : 0), h = 2 + (a % 3); for (let y = 1; y <= h; y++) vb.set(x + (y > 2 ? Math.sign(x || 1) : 0), y, z, y === h ? tip : c); }
    vb.box(-1, 1, -1, 0, 1, 0, '#e8a0c8');
    return vb;
  }
  function starVB(c) { const vb = new VB(); vb.box(-1, 0, -1, 0, 0, 0, c); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 2; k++) vb.set(dx > 0 ? k : dx < 0 ? -1 - k : (k % 2 ? 0 : -1), 0, dz > 0 ? k : dz < 0 ? -1 - k : (k % 2 ? -1 : 0), c); return vb; }
  function wreckVB(rng) {
    const vb = new VB(), plank = (x, y) => (y % 2 ? '#6b4a2e' : '#5a3d26');
    for (let x = -20; x <= 19; x++) {
      const u = (x + 20) / 39, B = u > 0.75 ? Math.max(1, Math.round(6 * Math.pow(1 - (u - 0.75) / 0.25, 0.7))) : 6;
      for (let z = -B; z < B; z++) for (let y = 0; y <= 8; y++) {
        const zz = Math.abs((z + 0.5) / B); if (y < 3 * zz * zz * 2) continue;
        const shell = zz > 0.75 || y <= 3 * zz * zz * 2 + 1 || y === 8;
        if (!shell) continue;
        if (u > 0.35 && u < 0.55 && y > 2 && h3(x, y, z) > 0.35) continue;
        vb.set(x, y, z, h3(x, y + 1, z) > 0.86 ? '#4f6b3a' : plank(x, y));
      }
    }
    for (let y = 9; y < 26; y++) vb.set(4 + Math.floor((y - 9) * 0.25), y, -1, '#3e2b1c');
    for (let k = -6; k <= 6; k++) vb.set(8, 21, k, '#3e2b1c');
    return vb;
  }
  function chestVB() { const vb = new VB(); vb.box(-3, 0, -2, 2, 3, 1, (x, y) => (y === 2 ? '#2e2216' : '#7a5230')); vb.box(-1, 1, -3, 0, 2, -3, '#d9b44a'); vb.box(-2, 4, -1, 1, 4, 0, '#ffd75a'); return vb; }

  /* ───────── GL ───────── */
  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUv; attribute vec2 aGW;
uniform mat4 uModel; uniform mat3 uNorm; uniform mat3 uView; uniform vec3 uCam; uniform vec4 uProj;
uniform float uKind; uniform float uPh; uniform float uAmp; uniform float uK; uniform float uT;
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec3 p=aPos; float g=aGW.x, w=aGW.y;
  if(uKind==1.){ p.z+=sin(uPh-p.x*uK)*uAmp*w; if(g==2.) p.y+=sin(uPh*1.7+p.z)*0.4; }
  else if(uKind==2.){ p.y+=sin(uPh-abs(p.z)*0.13)*abs(p.z)*0.3*w; }
  else if(uKind==3.){ if(g==1.){ float pl=1.+sin(uPh)*0.13; p.x*=pl; p.z*=pl; p.y*=1.12-0.12*pl; } else { p.x+=sin(uPh*0.7+p.y*0.35)*w*1.8; p.z+=cos(uPh*0.55+p.y*0.3)*w*1.3; } }
  else if(uKind==4.){ if(g>0.){ float a=sin(uPh+(g>2.?1.6:0.))*(g>2.?0.4:0.85); float sd=(g==1.||g==3.)?-1.:1.; p.y-=w*sin(a); p.z-=sd*w*(1.-cos(a)); } }
  else if(uKind==5.){ if(g==1.) p.y+=max(0.,sin(uPh*2.+p.x*0.9+p.z*2.))*0.9; }
  else if(uKind==7.){ if(g==3.){ float a=uPh*4.; float yy=p.y+3.; float zz=p.z; p.y=yy*cos(a)-zz*sin(a)-3.; p.z=yy*sin(a)+zz*cos(a);} }
  vec4 wp=uModel*vec4(p,1.);
  if(uKind==6.){ wp.x+=sin(uT*0.9+wp.x*2.1+wp.z*1.3)*w; wp.z+=cos(uT*0.7+wp.x*1.7)*w*0.5; }
  vW=wp.xyz; vN=uNorm*aNor; vCol=aCol; vUv=aUv;
  vec3 c=uView*(wp.xyz-uCam);
  gl_Position=vec4(c.x*uProj.x,c.y*uProj.y,c.z*uProj.z+uProj.w,c.z);
}`;
  const FS = `
precision highp float;
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSun; uniform vec3 uCam; uniform vec2 uRes;
uniform float uT; uniform float uCaus; uniform float uFog; uniform float uAlpha; uniform float uGlow; uniform float uBright; uniform float uCausOn;
#define TAU 6.2831853
float caustic(vec2 uv,float t){
  vec2 p=mod(uv*TAU,TAU)-250.; vec2 i=p; float c=1.; float inten=.005;
  for(int n=0;n<4;n++){ float tt=t*(1.-(3.5/float(n+1))); i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten))); }
  c/=4.; c=1.17-pow(c,1.4); return pow(abs(c),8.);
}
void main(){
  vec3 n=normalize(vN);
  vec3 sunDir=normalize(vec3(.3,1.,.65));
  float face=n.y>0.5?1.0:(n.y<-0.5?0.48:(abs(n.x)>abs(n.z)?0.78:0.66));
  float ndl=max(dot(n,sunDir),0.);
  float e=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
  float edge=mix(0.9,1.,smoothstep(0.,0.1,e));
  vec3 lit=vCol*(0.3+0.62*face+0.28*ndl)*edge*uBright;
  lit*=mix(0.6,1.12,smoothstep(-1.6,5.,vW.y));
  if(uCausOn>0.5&&n.y>0.3){ lit+=uSun*caustic(vW.xz*0.3,uT*0.42)*0.6*uCaus*n.y*vCol*1.4; }
  lit+=vCol*uGlow;
  vec3 rd=vW-uCam; float dist=length(rd); rd/=dist;
  float scat=pow(max(dot(rd,sunDir),0.),5.);
  vec3 water=mix(uDeep,uShallow,smoothstep(-.55,.85,rd.y)); water+=uSun*uShallow*scat*.9; water+=uShallow*pow(max(rd.y,0.),2.)*.35;
  vec3 col=mix(water,lit,exp(-dist*0.085*uFog));
  vec2 vv=gl_FragCoord.xy/uRes-.5;
  col*=1.-.55*pow(length(vv*vec2(1.,1.15))*1.2,2.4);
  col=1.-exp(-col*1.3); col=pow(max(col,0.),vec3(1./2.2));
  gl_FragColor=vec4(col*uAlpha,uAlpha);
}`;

  let cv, gl, prog, A = {}, U = {}, W = 0, H = 0, aspect = 1.6, quality = 'medium', autoScale = 1;
  let theme = null, life = { fish: true, bubbles: true, kelp: true }, lifeMul = 1;
  const MESH = {};
  let staticMesh = null, dyn = null, dynCap = 0;

  function compile() {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; } return o; };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS); if (!v || !f) return false;
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);
    ['aPos', 'aNor', 'aCol', 'aUv', 'aGW'].forEach((n) => { A[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(A[n]); });
    ['uModel', 'uNorm', 'uView', 'uCam', 'uProj', 'uKind', 'uPh', 'uAmp', 'uK', 'uT', 'uShallow', 'uDeep', 'uSun', 'uRes', 'uCaus', 'uFog', 'uAlpha', 'uGlow', 'uBright', 'uCausOn']
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    return true;
  }
  function upload(data, dynamic) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); return { b, n: data.length / STRIDE }; }
  let bound = null;
  function bindMesh(m) {
    if (bound === m.b) return; bound = m.b;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
    const S = STRIDE * 4;
    gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, S, 0);
    gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, S, 12);
    gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, S, 24);
    gl.vertexAttribPointer(A.aUv, 2, gl.FLOAT, false, S, 36);
    gl.vertexAttribPointer(A.aGW, 2, gl.FLOAT, false, S, 44);
  }
  function buildModels() {
    for (const k in SPECIES) { const r = centered(SPECIES[k].vb(), swimW); MESH[k] = Object.assign(upload(r.data), { len: r.len }); }
    const add = (name, vb, wf) => { const r = centered(vb, wf); MESH[name] = Object.assign(upload(r.data), { len: r.len }); };
    add('shark', sharkVB(), swimW); add('puffer', pufferVB(), swimW); add('turtle', turtleVB(), null); add('manta', mantaVB(), null);
    add('jellyPink', jellyVB('#f59ad8', '#ffd2f0'), null); add('jellyBlue', jellyVB('#8ad6ff', '#d6f3ff'), null);
    add('crab', crabVB(), null); add('boatRed', boatVB('#9b2f25'), null); add('boatGreen', boatVB('#2f6b4a'), null);
    // a unit cube for bubbles / food
    const cube = new VB().set(0, 0, 0, '#ffffff'); MESH.cube = centered(cube).data;
  }

  /* ───────── camera ───────── */
  const FLOOR = -1.35, SURF = 7, TANH = 0.725;
  let look = [0, 0], camR = new Float32Array(9);
  function camera() {
    const pitch = 0.18 + look[1] * 0.045, yaw = look[0] * 0.07;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // R = Yaw * Pitch (row-major), maps camera dir -> world dir
    const P = [[1, 0, 0], [0, cp, sp], [0, -sp, cp]], Y = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) camR[r * 3 + c] = Y[r][0] * P[0][c] + Y[r][1] * P[1][c] + Y[r][2] * P[2][c];
  }
  function rayAt(px, py) { // screen px -> world dir
    const qx = (px - W / 2) / H * 1.45, qy = -(py - H / 2) / H * 1.45;
    const l = Math.hypot(qx, qy, 1), d = [qx / l, qy / l, 1 / l];
    return [camR[0] * d[0] + camR[1] * d[1] + camR[2] * d[2], camR[3] * d[0] + camR[4] * d[1] + camR[5] * d[2], camR[6] * d[0] + camR[7] * d[1] + camR[8] * d[2]];
  }
  const halfW = (z) => z * TANH * aspect;

  const MM = new Float32Array(16), NM = new Float32Array(9);
  function model(x, y, z, s, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Ry * Rz * Rx
    const a = [[cy * cp, -cy * sp, sy], [sp, cp, 0], [-sy * cp, sy * sp, cy]];
    const R = [[a[0][0], a[0][1] * cr + a[0][2] * sr, -a[0][1] * sr + a[0][2] * cr], [a[1][0], a[1][1] * cr + a[1][2] * sr, -a[1][1] * sr + a[1][2] * cr], [a[2][0], a[2][1] * cr + a[2][2] * sr, -a[2][1] * sr + a[2][2] * cr]];
    MM[0] = R[0][0] * s; MM[1] = R[1][0] * s; MM[2] = R[2][0] * s; MM[3] = 0;
    MM[4] = R[0][1] * s; MM[5] = R[1][1] * s; MM[6] = R[2][1] * s; MM[7] = 0;
    MM[8] = R[0][2] * s; MM[9] = R[1][2] * s; MM[10] = R[2][2] * s; MM[11] = 0;
    MM[12] = x; MM[13] = y; MM[14] = z; MM[15] = 1;
    NM[0] = R[0][0]; NM[1] = R[1][0]; NM[2] = R[2][0]; NM[3] = R[0][1]; NM[4] = R[1][1]; NM[5] = R[2][1]; NM[6] = R[0][2]; NM[7] = R[1][2]; NM[8] = R[2][2];
  }
  const ID4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), ID3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  function draw(mesh, o) {
    bindMesh(mesh);
    if (o.static) { gl.uniformMatrix4fv(U.uModel, false, ID4); gl.uniformMatrix3fv(U.uNorm, false, ID3); }
    else { model(o.x, o.y, o.z, o.s, o.yaw || 0, o.pitch || 0, o.roll || 0); gl.uniformMatrix4fv(U.uModel, false, MM); gl.uniformMatrix3fv(U.uNorm, false, NM); }
    gl.uniform1f(U.uKind, o.kind || 0); gl.uniform1f(U.uPh, o.ph || 0); gl.uniform1f(U.uAmp, o.amp || 0); gl.uniform1f(U.uK, o.k || 0);
    gl.uniform1f(U.uFog, o.fog || 1); gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha); gl.uniform1f(U.uGlow, o.glow || 0); gl.uniform1f(U.uBright, o.bright || 1);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  }

  /* ───────── world ───────── */
  let schools = [], jellies = [], crabs = [], puffers = [], bubbles = [], food = [], clowns = [];
  let shark = null, turtle = null, manta = null, boat = null, sched = {}, vents = [], chest = null, anemone = null;
  let simT = 0;
  const mouse = { x: -1, y: -1, speed: 0, lx: 0, ly: 0, has: false };

  const pick = () => { const ks = Object.keys(SPECIES).filter((k) => SPECIES[k].weight); let t = ks.reduce((a, k) => a + SPECIES[k].weight, 0) * Math.random(); for (const k of ks) { t -= SPECIES[k].weight; if (t <= 0) return k; } return ks[0]; };

  class School {
    constructor(init) { this.reset(init); }
    reset(init) {
      this.sp = pick(); const S = SPECIES[this.sp];
      this.z = rnd(2.6, 9.5); this.dir = Math.random() < 0.5 ? 1 : -1;
      this.y = rnd(-0.85, Math.min(3.2, -0.6 + this.z * 0.42));
      this.x = init ? rnd(-halfW(this.z), halfW(this.z)) : -this.dir * (halfW(this.z) + 1.2);
      this.vy = 0; this.vz = 0; this.w = Math.random() * 100; this.boost = 0; this.cool = 6;
      const n = Math.round(rnd(S.school[0], S.school[1]) * (0.7 + lifeMul * 0.3));
      this.f = Array.from({ length: n }, () => ({ ox: rnd(-1, 1) * S.spread, oy: rnd(-1, 1) * S.spread * 0.45, oz: rnd(-1, 1) * S.spread * 0.5, vx: 0, vy: 0, vz: 0, ph: Math.random() * TAU, sj: rnd(0.88, 1.12), yaw: this.dir > 0 ? 0 : Math.PI, tr: rnd(1.6, 3), fr: rnd(0.85, 1.2) }));
    }
    tick(dt) {
      const S = SPECIES[this.sp];
      this.w += dt * 0.3; this.cool -= dt; this.boost *= Math.pow(0.3, dt);
      // food
      let tgt = null, best = 3.2;
      for (const p of food) { const d = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z); if (d < best) { best = d; tgt = p; } }
      if (tgt) {
        this.dir = tgt.x > this.x ? 1 : -1;
        this.vy += clamp((tgt.y - this.y) * 0.8 - this.vy, -0.6, 0.6) * dt * 2; this.vz += clamp((tgt.z - this.z) * 0.5 - this.vz, -0.4, 0.4) * dt * 2;
      } else {
        this.vy += ((Math.sin(this.w) * 0.12 + Math.sin(this.w * 0.37) * 0.08) - this.vy) * dt;
        this.vz += (Math.sin(this.w * 0.23) * 0.08 - this.vz) * dt;
        if (this.cool < 0 && Math.abs(this.x) < halfW(this.z) * 0.6 && Math.random() < dt * 0.03) { this.dir *= -1; this.cool = 9; }
      }
      const sp = S.speed * (1 + this.boost * 2.2) * (tgt && best < 0.8 ? 0.5 : 1);
      this.x += sp * this.dir * dt; this.y += this.vy * dt; this.z += this.vz * dt;
      this.y = clamp(this.y, FLOOR + 0.45, Math.min(5.5, -0.4 + this.z * 0.5)); this.z = clamp(this.z, 2.5, 10);
      const ty = this.dir > 0 ? 0 : Math.PI;
      for (const f of this.f) {
        const fx = this.x + f.ox, fy = this.y + f.oy, fz = this.z + f.oz;
        const flee = (px, py, pz, R, str) => { const dx = fx - px, dy = fy - py, dz = fz - pz, d = Math.hypot(dx, dy, dz); if (d < R && d > 1e-4) { const k = (1 - d / R) * str * dt; f.vx += (dx / d) * k; f.vy += (dy / d) * k; f.vz += (dz / d) * k; this.boost = Math.min(1, this.boost + dt * 2); } };
        if (mouse.has && mouse.speed > 900) { const d = mouse.ray; const v = [fx - CAM[0], fy - CAM[1], fz - CAM[2]], t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; if (t > 0) flee(CAM[0] + d[0] * t, CAM[1] + d[1] * t, CAM[2] + d[2] * t, 0.9, 4); }
        if (shark) flee(shark.x, shark.y, shark.z, 2.2, 5);
        for (let i = food.length - 1; i >= 0; i--) { const p = food[i]; if (Math.hypot(p.x - fx, p.y - fy, p.z - fz) < 0.14) { food.splice(i, 1); bubbles.push(newBubble(fx, fy + 0.05, fz, 0.02)); } }
        f.vx += -f.ox * 0.4 * dt; f.vy += -f.oy * 0.8 * dt; f.vz += -f.oz * 0.6 * dt;
        const damp = Math.pow(0.15, dt); f.vx *= damp; f.vy *= damp; f.vz *= damp;
        f.ox += f.vx * dt + (Math.cos(f.yaw) - this.dir) * sp * dt * 0.8; f.oy += f.vy * dt; f.oz += f.vz * dt;
        let dy = ty - f.yaw; f.yaw += dy * Math.min(1, dt * f.tr);
        f.ph += dt * (7 + this.boost * 10) * f.fr * (S.speed / 0.35);
      }
      if ((this.dir > 0 && this.x > halfW(this.z) + 1.5) || (this.dir < 0 && this.x < -halfW(this.z) - 1.5)) this.reset(false);
    }
    draw() {
      const S = SPECIES[this.sp], m = MESH[this.sp];
      for (const f of this.f) draw(m, { x: this.x + f.ox, y: this.y + f.oy, z: this.z + f.oz, s: S.vs * f.sj, yaw: f.yaw, pitch: clamp((this.vy + f.vy) * 0.8, -0.4, 0.4), kind: 1, ph: f.ph, amp: S.amp, k: TAU / (m.len * 1.25), fog: 0.45, bright: 1.12 });
    }
  }

  const newBubble = (x, y, z, s) => ({ x, y, z, s: s || rnd(0.015, 0.045), vy: rnd(0.25, 0.4), ph: Math.random() * TAU });
  const CAM = [0, 0, 0];

  function spawn(what) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (what === 'shark') { const z = rnd(5, 9); shark = { x: -dir * (halfW(z) + 2.5), y: rnd(-0.4, 1.4), z, dir, ph: 0, by: 0 }; shark.by = shark.y; }
    if (what === 'turtle') { const z = rnd(4, 8); turtle = { x: -dir * (halfW(z) + 1.2), y: rnd(-0.3, 1.5), z, dir, ph: 0, by: 0 }; turtle.by = turtle.y; }
    if (what === 'manta') { const z = rnd(8, 12); manta = { x: -dir * (halfW(z) + 2), y: rnd(0.8, 2.6), z, dir, ph: 0, by: 0 }; manta.by = manta.y; }
    if (what === 'boat') { const z = rnd(9.5, 12); boat = { x: -dir * (halfW(z) * 1.25 + 3), y: SURF - 0.05, z, dir, ph: 0, m: Math.random() < 0.6 ? 'boatRed' : 'boatGreen' }; }
  }

  function populate() {
    if (!gl || !theme) return;
    const mul = lifeMul * (theme.lifeMul || 1);
    schools = Array.from({ length: Math.max(2, Math.round((3 + aspect) * mul)) }, () => new School(true));
    jellies = Array.from({ length: Math.round((theme.jellies != null ? theme.jellies : 1) * (0.5 + mul * 0.5)) }, () => ({ x: rnd(-3, 3), y: rnd(-0.5, 2.5), z: rnd(4, 10), ph: Math.random() * TAU, m: Math.random() < 0.6 ? 'jellyPink' : 'jellyBlue', d: rnd(-0.04, 0.04) }));
    crabs = Array.from({ length: mul > 1.2 ? 2 : 1 }, () => { const z = rnd(3.4, 5); return { z, x: (Math.random() < 0.5 ? -1 : 1) * halfW(z) * rnd(0.45, 0.85), walk: 0, next: 0, ph: 0 }; });
    puffers = Array.from({ length: mul >= 1 ? 1 : 0 }, () => ({ x: rnd(-2, 2), y: rnd(-0.3, 1.2), z: rnd(4, 7), dir: 1, ph: 0, puff: 0, t: 0, yaw: 0 }));
    vents = Array.from({ length: 2 }, () => { const z = rnd(4, 9); return { x: rnd(-halfW(z) * 0.8, halfW(z) * 0.8), z, next: 0 }; });
    bubbles = []; food = [];
    shark = turtle = manta = boat = null;
    sched = { shark: simT + rnd(12, 25), turtle: simT + rnd(35, 60), manta: simT + rnd(70, 110), boat: simT + rnd(6, 14) };
    buildStatic();
  }

  function buildStatic() {
    if (!gl) return;
    const rng = mulberry(7331), out = [];
    const place = (vb, x, z, s, opts = {}) => {
      const b = vb.bounds(), org = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
      emit(vb, out, { origin: org, scale: s, rotY: opts.rot == null ? rng() * TAU : opts.rot, offset: [x, FLOOR + (opts.dy || 0), z],
        wfn: opts.sway ? (v, lx, ly) => Math.pow(Math.max(0, ly) / ((b.max[1] - b.min[1]) * s || 1), 1.5) * opts.sway : null, emissive: opts.emissive });
    };
    const side = (z, a, b) => (rng() < 0.5 ? -1 : 1) * halfW(z) * (a + rng() * (b - a));
    const plants = life.kelp, kelpMul = theme && theme.kelp != null ? theme.kelp : 1;
    const corals = [
      () => tubeVB(rng, '#3b62e0', '#7a98ff'), () => brainVB(rng, '#e86aa8', '#c44d8a'), () => bubbleCoralVB(rng, '#a33fcf', '#c97af0'),
      () => branchVB(rng, '#d8352f', '#ff7a5f'), () => fanVB(rng, '#e6d23a', '#f6ea7a'), () => fanVB(rng, '#b04aa0', '#e07ad0'), () => branchVB(rng, '#f08a3a', '#ffcf8a'),
    ];
    // reef clusters hugging the left and right edges
    for (const sgn of [-1, 1]) {
      place(rockVB(rng, 5), sgn * halfW(7) * 0.8, 7, 0.1);
      place(rockVB(rng, 3), sgn * halfW(4.2) * 0.85, 4.2, 0.09);
      const n = Math.round(5 * Math.min(1.5, lifeMul));
      for (let i = 0; i < n; i++) { const z = rnd(3.6, 9); place(corals[Math.floor(rng() * corals.length)](), sgn * halfW(z) * (0.6 + rng() * 0.35), z, 0.09); }
      if (plants) {
        for (let i = 0; i < Math.round(2 * kelpMul); i++) { const z = rnd(4, 11); place(kelpVB(rng, 18 + Math.floor(rng() * 16)), sgn * halfW(z) * (0.55 + rng() * 0.4), z, 0.085, { sway: 0.16 }); }
        place(grassVB(rng), sgn * halfW(5) * (0.5 + rng() * 0.3), 5, 0.08, { sway: 0.05 });
        place(pickleVB(rng), sgn * halfW(4.5) * (0.65 + rng() * 0.2), 4.5, 0.08, { emissive: (v) => (v.c === '#d8ff8a' ? 3 : 1) });
      }
    }
    if (plants) {
      for (let i = 0; i < 2; i++) { const z = rnd(6, 11); place(grassVB(rng), side(z, 0.15, 0.4), z, 0.08, { sway: 0.05 }); }
      const az = 4.3, ax = (rng() < 0.5 ? -1 : 1) * halfW(az) * 0.5;
      place(anemoneVB(rng, '#c45bd6', '#ffd6f0'), ax, az, 0.09, { sway: 0.04 }); anemone = { x: ax, z: az };
    } else anemone = null;
    place(starVB('#e8743b'), side(3.6, 0.2, 0.45), 3.6, 0.08, {});
    const wz = 14.5, wx = (rng() < 0.5 ? -1 : 1) * halfW(wz) * 0.6;
    place(wreckVB(rng), wx, wz, 0.13, { rot: wx < 0 ? 0.6 : -0.6, dy: -0.3 });
    const cz = 8, cx = Math.sign(wx) * halfW(cz) * 0.42; place(chestVB(), cx, cz, 0.1, { rot: -0.4 * Math.sign(wx) }); chest = { x: cx, z: cz };
    staticMesh = upload(new Float32Array(out));
    clowns = anemone ? [0, 1].map((i) => ({ a: i * Math.PI, r: rnd(0.28, 0.38), sp: rnd(0.6, 0.9) * (i ? 1 : -1), ph: Math.random() * TAU })) : [];
  }

  /* bubbles + food → one dynamic batched mesh of cubes */
  const CUBEV = () => MESH.cube;
  function drawParticles() {
    const items = bubbles.length + food.length; if (!items) return;
    const cube = CUBEV(), per = cube.length; // floats per cube
    if (items * per > dynCap) { dynCap = Math.ceil(items * 1.5) * per; dyn = { arr: new Float32Array(dynCap), b: gl.createBuffer() }; gl.bindBuffer(gl.ARRAY_BUFFER, dyn.b); gl.bufferData(gl.ARRAY_BUFFER, dyn.arr.byteLength, gl.DYNAMIC_DRAW); }
    const a = dyn.arr; let o = 0;
    const put = (x, y, z, s, col) => {
      for (let i = 0; i < per; i += STRIDE) {
        a[o] = x + cube[i] * s; a[o + 1] = y + cube[i + 1] * s; a[o + 2] = z + cube[i + 2] * s;
        a[o + 3] = cube[i + 3]; a[o + 4] = cube[i + 4]; a[o + 5] = cube[i + 5];
        a[o + 6] = col[0]; a[o + 7] = col[1]; a[o + 8] = col[2]; a[o + 9] = cube[i + 9]; a[o + 10] = cube[i + 10]; a[o + 11] = 0; a[o + 12] = 0; o += STRIDE;
      }
    };
    const BC = [0.85, 0.95, 1.1], FC = L_('#8a5a2b');
    for (const p of food) put(p.x, p.y, p.z, 0.035, FC);
    const nFood = o / STRIDE;
    for (const b of bubbles) put(b.x, b.y, b.z, b.s, BC);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, a.subarray(0, o)); bound = null;
    const mesh = { b: dyn.b, n: nFood };
    draw(mesh, { static: true, fog: 1 }); // sets uniforms; draws the food (opaque)
    if (o / STRIDE > nFood) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1f(U.uAlpha, 0.55); gl.uniform1f(U.uGlow, 0.35);
      gl.drawArrays(gl.TRIANGLES, nFood, o / STRIDE - nFood);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }

  /* ───────── frame ───────── */
  function render(dt, t, lk) {
    if (!gl || !theme || !staticMesh) return;
    simT = t; look = lk || look; camera();
    const bw = cv.width, bh = cv.height;
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog); bound = null;
    const f = 1 / TANH, near = 0.05, far = 80;
    gl.uniform4f(U.uProj, f / aspect, f, (far + near) / (far - near), (-2 * far * near) / (far - near));
    gl.uniformMatrix3fv(U.uView, false, camR); // row-major R read as column-major = R^T
    gl.uniform3f(U.uCam, 0, 0, 0); gl.uniform1f(U.uT, t); gl.uniform2f(U.uRes, bw, bh);
    gl.uniform1f(U.uCausOn, quality === 'low' ? 0 : 1);
    if (mouse.has) mouse.ray = rayAt(mouse.x, mouse.y);
    mouse.speed *= Math.pow(0.02, dt);

    // static reef
    draw(staticMesh, { static: true, kind: 6 });

    if (life.fish) {
      for (const s of schools) { s.tick(dt); s.draw(); }
      // clownfish around the anemone
      if (anemone) for (const c of clowns) {
        c.a += c.sp * dt; c.ph += dt * 8;
        const x = anemone.x + Math.cos(c.a) * c.r, z = anemone.z + Math.sin(c.a) * c.r * 0.8, y = FLOOR + 0.5 + Math.sin(c.a * 2) * 0.06;
        draw(MESH.clown, { x, y, z, s: 0.055, yaw: Math.atan2(-Math.cos(c.a) * c.sp, -Math.sin(c.a) * c.sp * 0.8), kind: 1, ph: c.ph, amp: 1, k: TAU / 14 });
      }
      for (const p of puffers) {
        p.t += dt; p.ph += dt * 5;
        const near = mouse.has && mouse.ray && (() => { const v = [p.x - CAM[0], p.y - CAM[1], p.z - CAM[2]], d = mouse.ray, tt = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; return tt > 0 && Math.hypot(v[0] - d[0] * tt, v[1] - d[1] * tt, v[2] - d[2] * tt) < 0.5; })();
        p.puff += ((near || (p.t % 14 > 11) ? 1 : 0) - p.puff) * Math.min(1, dt * 3);
        if (Math.random() < dt * 0.15) p.dir *= -1;
        p.x += p.dir * 0.08 * dt; p.y += Math.sin(p.t * 0.4) * 0.03 * dt;
        p.yaw += ((p.dir > 0 ? 0 : Math.PI) - p.yaw) * Math.min(1, dt * 1.5);
        if (Math.abs(p.x) > halfW(p.z)) p.dir = -Math.sign(p.x);
        draw(MESH.puffer, { x: p.x, y: p.y, z: p.z, s: 0.065 * (1 + p.puff * 0.45), fog: 0.6, yaw: p.yaw, kind: 1, ph: p.ph, amp: 0.25, k: 0.5 });
      }
      for (const c of crabs) {
        if (t > c.next) { c.walk = Math.random() < 0.55 ? (Math.random() < 0.5 ? -1 : 1) : 0; c.next = t + rnd(1.5, 4.5); }
        if (c.walk) { c.x += c.walk * 0.09 * dt; c.ph += dt * 6; }
        if (Math.abs(c.x) > halfW(c.z) * 0.95) c.walk = -Math.sign(c.x);
        draw(MESH.crab, { x: c.x, y: FLOOR + 0.07, z: c.z, s: 0.05, fog: 0.7, yaw: 0, roll: -0.35, kind: 5, ph: c.ph });
      }
      const big = () => !!(shark || turtle || manta);
      for (const k of ['shark', 'turtle', 'manta']) if (t > sched[k]) { if (big()) sched[k] = t + 15; else { spawn(k); sched[k] = 1e12; } }
      if (shark) {
        shark.ph += dt * 2.6; shark.x += shark.dir * 0.55 * dt; shark.y = shark.by + Math.sin(shark.ph * 0.2) * 0.25;
        draw(MESH.shark, { x: shark.x, y: shark.y, z: shark.z, s: 0.075, fog: 0.7, yaw: shark.dir > 0 ? 0 : Math.PI, pitch: Math.cos(shark.ph * 0.2) * 0.05, kind: 1, ph: shark.ph, amp: 2.2, k: TAU / (MESH.shark.len * 1.1) });
        if (Math.abs(shark.x) > halfW(shark.z) + 3) { shark = null; sched.shark = t + rnd(40, 80); }
      }
      if (turtle) {
        turtle.ph += dt * 1.8; turtle.x += turtle.dir * (0.18 + Math.max(0, Math.sin(turtle.ph)) * 0.2) * dt; turtle.y = turtle.by + Math.sin(turtle.ph * 0.3) * 0.15;
        draw(MESH.turtle, { x: turtle.x, y: turtle.y, z: turtle.z, s: 0.075, fog: 0.65, yaw: turtle.dir > 0 ? 0 : Math.PI, roll: -0.3 * turtle.dir, kind: 4, ph: turtle.ph });
        if (Math.abs(turtle.x) > halfW(turtle.z) + 2) { turtle = null; sched.turtle = t + rnd(50, 100); }
      }
      if (manta) {
        manta.ph += dt * 1.5; manta.x += manta.dir * 0.35 * dt; manta.y = manta.by + Math.sin(manta.ph * 0.35) * 0.25;
        draw(MESH.manta, { x: manta.x, y: manta.y, z: manta.z, s: 0.085, fog: 0.75, yaw: manta.dir > 0 ? 0 : Math.PI, roll: -0.3 * manta.dir, pitch: 0, kind: 2, ph: manta.ph });
        if (Math.abs(manta.x) > halfW(manta.z) + 3) { manta = null; sched.manta = t + rnd(60, 120); }
      }
      if (!boat && t > sched.boat) spawn('boat');
      if (boat) {
        boat.ph += dt; boat.x += boat.dir * 0.7 * dt;
        draw(MESH[boat.m], { x: boat.x, y: boat.y + Math.sin(t * 1.3) * 0.03, z: boat.z, s: 0.09, yaw: boat.dir > 0 ? 0 : Math.PI, roll: Math.sin(t * 1.1) * 0.03, kind: 0, ph: boat.ph, fog: 0.55, bright: 0.8 });
        if (life.bubbles && Math.random() < dt * 30) { const sx = boat.x - boat.dir * 1.6; bubbles.push(newBubble(sx + rnd(-0.1, 0.1), SURF - rnd(0.25, 0.5), boat.z + rnd(-0.2, 0.2), rnd(0.02, 0.05))); }
        if (Math.abs(boat.x) > halfW(boat.z) * 1.3 + 4) { boat = null; sched.boat = t + rnd(30, 70); }
      }
    }

    // particles
    if (life.bubbles) {
      for (const v of vents) if (t > v.next) { for (let i = 0; i < 5; i++) bubbles.push(newBubble(v.x + rnd(-0.05, 0.05), FLOOR + rnd(0, 0.3), v.z + rnd(-0.05, 0.05))); v.next = t + rnd(2.5, 7); }
      if (chest && Math.random() < dt * 0.5) bubbles.push(newBubble(chest.x, FLOOR + 0.35, chest.z, 0.02));
    }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.ph += dt * 3; b.y += b.vy * dt; b.x += Math.sin(b.ph) * 0.05 * dt; if (b.y > SURF - 0.05) bubbles.splice(i, 1); }
    if (bubbles.length > 600) bubbles.splice(0, bubbles.length - 600);
    for (let i = food.length - 1; i >= 0; i--) { const p = food[i]; p.y = Math.max(FLOOR + 0.03, p.y - 0.12 * dt); p.x += Math.sin(t + i) * 0.01 * dt; p.life -= dt; if (p.life < 0) food.splice(i, 1); }
    drawParticles();

    // translucent jellies
    if (life.fish && jellies.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      for (const j of jellies) {
        j.ph += dt * 2.3; j.y += (Math.max(0, Math.sin(j.ph)) * 0.14 + 0.01) * dt; j.x += j.d * dt;
        if (j.y > Math.min(5.5, j.z * 0.6)) { j.y = FLOOR - 0.2; j.x = rnd(-halfW(j.z) * 0.8, halfW(j.z) * 0.8); }
        draw(MESH[j.m], { x: j.x, y: j.y, z: j.z, s: 0.06, yaw: j.ph * 0.05, kind: 3, ph: j.ph, alpha: 0.6, glow: theme.bio ? 0.9 : 0.25, fog: 0.8 });
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }

  /* ───────── public ───────── */
  const Reef = {
    init(canvas) {
      cv = canvas;
      const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS/.test(navigator.userAgent);
      try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: !lowEnd, depth: true, powerPreference: 'default' }); } catch { gl = null; }
      if (!gl || !compile()) { gl = null; return false; }
      buildModels();
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; });
      addEventListener('pointermove', (e) => {
        if (mouse.has) { const d = Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y); mouse.speed = Math.max(mouse.speed, d * 60); }
        mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
      }, { passive: true });
      return true;
    },
    resize(cssW, cssH, q) {
      W = cssW; H = cssH; aspect = W / H; quality = q || quality;
      if (!gl) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const base = { low: 0.55, medium: 0.8, high: 1, ultra: dpr }[quality] || 0.8;
      const s = Math.max(0.45, base * autoScale);
      cv.width = Math.round(W * s); cv.height = Math.round(H * s);
      if (theme) buildStatic();
    },
    setAutoScale(v) { if (Math.abs(v - autoScale) < 0.04) return; autoScale = v; this.resize(W, H, quality); },
    setTheme(th) {
      theme = th; if (!gl) return;
      gl.useProgram(prog);
      gl.uniform3fv(U.uShallow, lin(th.shallow)); gl.uniform3fv(U.uDeep, lin(th.deep)); gl.uniform3fv(U.uSun, lin(th.sun));
      gl.uniform1f(U.uCaus, th.caustics == null ? 1 : th.caustics);
      populate();
    },
    render,
    clear() { if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } },
    setLife(k, v) { life[k] = v; if (k === 'kelp') buildStatic(); if (!v && k === 'bubbles') bubbles = []; },
    setDensity(m) { lifeMul = m; populate(); },
    spawn(what) { if (what === 'boat') { spawn('boat'); } else { shark = turtle = manta = null; spawn(what); } },
    /* click on the water: drop fish food and a puff of bubbles */
    click(px, py) {
      if (!gl) return;
      camera();
      const d = rayAt(px, py), depth = 3.4 / Math.max(0.3, d[2]);
      const x = d[0] * depth, y = d[1] * depth, z = d[2] * depth;
      for (let i = 0; i < 6; i++) food.push({ x: x + rnd(-0.12, 0.12), y: y + rnd(-0.06, 0.06), z: z + rnd(-0.1, 0.1), life: 25 });
      if (life.bubbles) for (let i = 0; i < 6; i++) bubbles.push(newBubble(x + rnd(-0.08, 0.08), y, z + rnd(-0.08, 0.08), rnd(0.012, 0.03)));
    },
    get ok() { return !!gl; },
  };
  window.Reef = Reef;
})();
