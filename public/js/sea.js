/* Unity — pixel-voxel sea life.
   Every creature is a little 3D voxel model (body, fins, eyes) that gets rotated, bent, lit and
   fogged in software, then splatted into a low-resolution colour + depth buffer. The buffer is
   scaled up with nearest-neighbour filtering, so things turn and shade in 3D but stay pixel art.
   Static scenery (reef, rocks, wreck) is pre-rendered into its own buffer and copied each frame. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function vnoise(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }

  /* ---------- voxel model ---------- */
  const STRIDE = 11; // x y z r g b nx ny nz group weight
  class Model {
    constructor() { this.v = []; }
    add(x, y, z, c, n, g = 0, wt = 0) { this.v.push(x, y, z, c[0], c[1], c[2], n[0], n[1], n[2], g, wt); }
    done() { this.a = new Float32Array(this.v); this.n = this.v.length / STRIDE; this.v = null; return this; }
  }

  /* ---------- buffers ---------- */
  let cv, ctx, img, buf, dep, w = 0, h = 0, PX = 4;
  let sBuf, sDep, fog = null, fogStatic = null, theme = null, staticDirty = true;
  const LIGHT = nrm(-0.35, -0.85, -0.45);
  const T = { buf: null, dep: null }; // current render target

  const fogAmt = (z) => clamp(0.08 + 0.8 * Math.pow(clamp(z, 0, 1), 1.25), 0, 0.92);
  const scaleZ = (z) => 1.35 - 0.88 * z;
  const floorY = (z) => h * (0.655 + (1 - z) * 0.345);

  /* render options object reused to avoid garbage */
  function O() { return { x: 0, y: 0, z: 0.5, s: 1, yaw: 0, pitch: 0, roll: 0, kind: 0, ph: 0, amp: 0, k: 0.3, alpha: 1, glow: 0, fogMul: 1, bright: 1 }; }

  function render(m, o) {
    const A = m.a, n = m.n, s = o.s, B = T.buf, D = T.dep;
    const cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch), cr = Math.cos(o.roll), sr = Math.sin(o.roll);
    const size = s <= 1.12 ? 1 : Math.ceil(s);
    const fa = fogAmt(o.z) * o.fogMul, fr = fog;
    const alpha = o.alpha, translucent = alpha < 0.999, glow = o.glow, bright = o.bright;
    const ph = o.ph, amp = o.amp, kk = o.k, kind = o.kind;
    const pulse = kind === 3 ? 1 + Math.sin(ph) * 0.13 : 1;
    for (let i = 0; i < n; i++) {
      const k = i * STRIDE;
      let x = A[k], y = A[k + 1], z = A[k + 2];
      const g = A[k + 9], wt = A[k + 10];
      switch (kind) {
        case 1: z += Math.sin(ph - x * kk) * amp * wt; break;                                         // fish swim
        case 2: y += Math.sin(ph - Math.abs(z) * 0.09) * Math.abs(z) * 0.32 * wt; break;             // ray wings
        case 3:                                                                                        // jellyfish
          if (g === 1) { x *= pulse; z *= pulse; y *= 2 - pulse; }
          else { x += Math.sin(ph * 0.7 + y * 0.32) * wt * 2.2; z += Math.cos(ph * 0.55 + y * 0.27) * wt * 1.6; y *= 1.3 - pulse * 0.3; }
          break;
        case 4:                                                                                        // turtle flippers
          if (g) {
            const side = g === 1 || g === 3 ? -1 : 1, piv = g < 3 ? 7 : 5, amp2 = g < 3 ? 0.85 : 0.35;
            const r = Math.abs(z) - piv, a = Math.sin(ph + (g > 2 ? 1.6 : 0)) * amp2;
            y = y - r * Math.sin(a); z = side * (piv + r * Math.cos(a));
          } break;
        case 5: if (g) y -= Math.max(0, Math.sin(ph * 2 + g * 1.9)) * 1.4 * wt; break;                // crab legs
        case 6: if (g === 1) { const a = ph, yy = y - o.amp, zz = z; y = o.amp + yy * Math.cos(a) - zz * Math.sin(a); z = yy * Math.sin(a) + zz * Math.cos(a); } break; // propeller
        default: break;
      }
      const X = x * cyw + z * syw, Z = -x * syw + z * cyw;
      const X2 = X * cp - y * sp, Y2 = X * sp + y * cp;
      const Y3 = Y2 * cr - Z * sr, Z3 = Y2 * sr + Z * cr;
      const px = o.x + X2 * s, py = o.y + Y3 * s;
      const ix = px | 0, iy = py | 0;
      if (ix < -size || iy < -size || ix >= w || iy >= h) continue;
      const d = o.z + Z3 * s * 0.0012;
      // normal
      const nx0 = A[k + 6], ny0 = A[k + 7], nz0 = A[k + 8];
      const NX = nx0 * cyw + nz0 * syw, NZ = -nx0 * syw + nz0 * cyw;
      const NX2 = NX * cp - ny0 * sp, NY2 = NX * sp + ny0 * cp;
      const NY3 = NY2 * cr - NZ * sr, NZ3 = NY2 * sr + NZ * cr;
      const lam = NX2 * LIGHT[0] + NY3 * LIGHT[1] + NZ3 * LIGHT[2];
      let f = (0.42 + 0.72 * (lam > 0 ? lam : 0) + (NY3 < -0.6 ? 0.12 : 0)) * bright;
      let r = A[k + 3] * f + glow, gg = A[k + 4] * f + glow, b = A[k + 5] * f + glow;
      const row = (iy < 0 ? 0 : iy) * 3;
      r += (fr[row] - r) * fa; gg += (fr[row + 1] - gg) * fa; b += (fr[row + 2] - b) * fa;
      r = r > 255 ? 255 : r < 0 ? 0 : r; gg = gg > 255 ? 255 : gg < 0 ? 0 : gg; b = b > 255 ? 255 : b < 0 ? 0 : b;
      for (let dy = 0; dy < size; dy++) {
        const yy = iy + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = 0; dx < size; dx++) {
          const xx = ix + dx; if (xx < 0 || xx >= w) continue;
          const id = yy * w + xx;
          if (translucent) {
            if (d > D[id]) continue;
            const ex = B[id], ea = ex >>> 24;
            if (ea === 0) B[id] = ((alpha * 255) << 24) | (b << 16) | (gg << 8) | r;
            else {
              const er = ex & 255, eg = (ex >> 8) & 255, eb = (ex >> 16) & 255;
              B[id] = (Math.max(ea, alpha * 255) << 24) | ((eb + (b - eb) * alpha) << 16) | ((eg + (gg - eg) * alpha) << 8) | (er + (r - er) * alpha);
            }
          } else if (d < D[id]) { D[id] = d; B[id] = 0xff000000 | (b << 16) | (gg << 8) | r; }
        }
      }
    }
  }

  /* blend a single low-res pixel (bubbles, foam, sparkles) */
  function blendPx(x, y, c, a) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return;
    const id = y * w + x, ex = buf[id], ea = ex >>> 24;
    if (ea === 0) { buf[id] = ((a * 255) << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; return; }
    const er = ex & 255, eg = (ex >> 8) & 255, eb = (ex >> 16) & 255;
    buf[id] = (Math.max(ea, a * 255) << 24) | ((eb + (c[2] - eb) * a) << 16) | ((eg + (c[1] - eg) * a) << 8) | (er + (c[0] - er) * a);
  }

  /* ---------- model generators ---------- */
  function addFin(m, x0, y0, len, height, sweep, dirY, z, col, wtFn) {
    for (let k = 0; k <= height; k++) {
      const wdt = Math.max(1, len * (1 - k / (height + 1)));
      const cx = x0 - k * sweep;
      for (let dx = 0; dx < wdt; dx++) {
        const x = cx + wdt / 2 - dx;
        m.add(x, y0 + dirY * k, z, col, nrm(0, dirY * 0.3, -0.9), 0, wtFn ? wtFn(x) : 0);
      }
    }
  }

  function genFish(sp) {
    const m = new Model(), L = sp.len;
    const wtAt = (x) => { const u = 0.5 - x / L; return Math.pow(Math.max(0, u - 0.28), 1.5) * 2.3; };
    const prof = (u) => { const t = u / 0.82; return t < 0.3 ? Math.sqrt(t / 0.3) * 0.92 + 0.08 : 1 - Math.pow((t - 0.3) / 0.7, 1.6) * 0.8; };
    for (let i = 0; i < L; i++) {
      const u = i / (L - 1), x = (0.5 - u) * L, wt = wtAt(x);
      if (u <= 0.82) {
        const p = prof(u), hh = Math.max(0.6, sp.hh * p), ww = Math.max(0.5, sp.ww * p), t = u / 0.82;
        const hy = Math.ceil(hh), hz = Math.ceil(ww);
        for (let y = -hy; y <= hy; y++) for (let z = -hz; z <= hz; z++) {
          const e = (y * y) / (hh * hh) + (z * z) / (ww * ww);
          if (e > 1.05) continue;
          if (sp.hollow && e < 0.5) continue;
          const n = nrm(t < 0.3 ? 0.6 * (1 - t / 0.3) : -0.08, y / (hh * hh), z / (ww * ww));
          m.add(x, y, z, sp.color(u, y / hh, z / ww, i, y, z), n, 0, wt);
        }
        // eye
        if (Math.abs(u - sp.eyeU) < 0.5 / L) {
          const ey = Math.round(-hh * 0.28), ez = Math.ceil(ww) + 0.2;
          for (const s of [-1, 1]) {
            m.add(x, ey, s * ez, [12, 14, 18], [0, 0, s], 0, 0);
            if (L > 9) m.add(x + 0.6, ey - 0.6, s * (ez + 0.1), [240, 250, 255], [0, -0.5, s], 0, 0);
            if (sp.eyeRing) m.add(x, ey + 1, s * ez, sp.eyeRing, [0, 0, s], 0, 0);
          }
        }
      } else {
        // tail fin
        const tu = (u - 0.82) / 0.18;
        if (sp.crescent) {
          const up = Math.round(sp.tail * (0.35 + tu * 1.25)), dn = Math.round(sp.tail * 0.55 * (0.35 + tu));
          for (let y = -up; y <= dn; y++) { if (tu > 0.5 && Math.abs(y) < (tu - 0.5) * sp.tail * 0.9) continue; m.add(x, y, 0, sp.fin(u, y), [0, 0, -1], 0, wt); }
        } else {
          const span = sp.tail * (0.3 + tu * 0.95);
          for (let y = -Math.ceil(span); y <= Math.ceil(span); y++) {
            if (sp.fork && Math.abs(y) < span * 0.5 * tu) continue;
            m.add(x, y, 0, sp.fin(u, y), [0, 0, -1], 0, wt);
          }
        }
      }
    }
    // fins
    const atU = (u) => (0.5 - u) * L;
    if (sp.dorsal) {
      const [a, b] = sp.dorsalAt, hh = sp.hh * prof((a + b) / 2);
      addFin(m, atU((a + b) / 2), -Math.round(hh) - 1, (b - a) * L, sp.dorsal, sp.sweep || 0.4, -1, 0, sp.fin(0.5, -9), wtAt);
    }
    if (sp.anal) {
      const [a, b] = sp.analAt, hh = sp.hh * prof((a + b) / 2);
      addFin(m, atU((a + b) / 2), Math.round(hh) + 1, (b - a) * L, sp.anal, sp.sweep || 0.4, 1, 0, sp.fin(0.5, 9), wtAt);
    }
    if (sp.pect) {
      const u = sp.pectU || 0.26, hh = sp.hh * prof(u), ww = sp.ww * prof(u);
      for (const s of [-1, 1]) for (let k = 0; k < sp.pect; k++) {
        m.add(atU(u) - k * 0.7, hh * 0.35 + k * 0.45, s * (ww + 0.6 + k * 0.6), sp.fin(u, 3), nrm(0, 0.3, s), 0, 0);
        if (sp.pectWide) m.add(atU(u) - k * 0.7 - 1, hh * 0.35 + k * 0.45, s * (ww + 0.6 + k * 0.6), sp.fin(u, 3), nrm(0, 0.3, s), 0, 0);
      }
    }
    return m.done();
  }

  const C = (h) => hex(h);
  const SPECIES = {
    sardine: {
      len: 15, hh: 2.4, ww: 1.5, tail: 3.2, fork: true, eyeU: 0.09, dorsal: 2, dorsalAt: [0.35, 0.5], pect: 2,
      color: (u, v, s, i) => v < -0.4 ? C('#2b4d69') : v < -0.05 ? (i % 3 === 0 && v > -0.25 ? C('#5d7f99') : C('#9fb9c8')) : C('#e6eff2'),
      fin: () => C('#8aa3b3'), school: [9, 18], speed: 1.25, amp: 0.9, weight: 4,
    },
    tang: {
      len: 13, hh: 4.4, ww: 1.4, tail: 3.6, eyeU: 0.12, dorsal: 2, dorsalAt: [0.12, 0.78], anal: 2, analAt: [0.35, 0.78], pect: 2,
      color: (u, v) => u > 0.74 ? C('#f6c42c') : (v < -0.15 && v > -0.75 && u > 0.18 && u < 0.72) ? C('#141a33') : C('#2f63d8'),
      fin: (u, y) => (y < -7 || y > 7) ? C('#1a2b6b') : C('#f6c42c'), school: [3, 7], speed: 0.9, amp: 0.7, weight: 2,
    },
    yellow: {
      len: 11, hh: 4.8, ww: 1.3, tail: 3, eyeU: 0.13, dorsal: 2, dorsalAt: [0.1, 0.78], anal: 2, analAt: [0.3, 0.78], pect: 2,
      color: (u, v) => v < -0.6 ? C('#e5b21d') : C('#f8d93c'), fin: () => C('#f2c92a'), school: [3, 8], speed: 0.9, amp: 0.7, weight: 2,
    },
    clown: {
      len: 10, hh: 3.1, ww: 1.8, tail: 2.6, eyeU: 0.12, dorsal: 2, dorsalAt: [0.18, 0.72], pect: 2,
      color: (u) => {
        const bands = [[0.17, 0.27], [0.45, 0.56], [0.76, 0.82]];
        for (const [a, b] of bands) { if (u > a && u < b) return (u < a + 0.025 || u > b - 0.025) ? C('#191513') : C('#f7f4ee'); }
        return C('#f2731a');
      },
      fin: (u, y) => C('#f2731a'), school: [2, 3], speed: 0.6, amp: 0.8, weight: 0,
    },
    angel: {
      len: 11, hh: 6.2, ww: 1.2, tail: 3.2, eyeU: 0.13, dorsal: 6, dorsalAt: [0.22, 0.5], anal: 6, analAt: [0.24, 0.52], sweep: 0.9, pect: 2,
      color: (u) => (Math.abs(u - 0.18) < 0.03 || Math.abs(u - 0.44) < 0.04 || Math.abs(u - 0.7) < 0.03) ? C('#1c1d26') : C('#e2e4da'),
      fin: () => C('#c8ccc0'), school: [2, 5], speed: 0.7, amp: 0.6, weight: 1.4,
    },
    snapper: {
      len: 16, hh: 3.6, ww: 1.9, tail: 3.6, fork: true, eyeU: 0.1, dorsal: 2, dorsalAt: [0.2, 0.68], anal: 1, analAt: [0.5, 0.7], pect: 2, eyeRing: [200, 60, 50],
      color: (u, v) => v < -0.3 ? C('#b8323a') : v < 0.25 ? C('#e0565a') : C('#f3b3a8'), fin: () => C('#d64c4f'), school: [4, 8], speed: 1.05, amp: 0.8, weight: 1,
    },
    shark: {
      len: 66, hh: 7.2, ww: 5.8, tail: 13, crescent: true, eyeU: 0.08, hollow: true,
      dorsal: 10, dorsalAt: [0.3, 0.46], sweep: 0.85, anal: 0, pect: 11, pectU: 0.24, pectWide: true,
      color: (u, v, s) => {
        if (u > 0.15 && u < 0.23 && Math.abs(s) > 0.55 && v > -0.4 && v < 0.35 && Math.round(u * 66) % 2 === 0) return C('#3b4750');
        return v < 0.1 ? (v < -0.55 ? C('#56656f') : C('#6c7c87')) : C('#dfe5e7');
      },
      fin: () => C('#5b6a74'), speed: 0.75, amp: 2.6,
    },
  };

  function genTurtle() {
    const m = new Model();
    for (let x = -11; x <= 11; x++) for (let z = -8; z <= 8; z++) {
      const e = (x * x) / 121 + (z * z) / 64; if (e > 1) continue;
      const top = -Math.round(6 * Math.sqrt(1 - e));
      // scutes
      const cx = Math.floor((x + 22) / 5.5), cz = Math.floor((z + 22 + (cx % 2) * 2.5) / 5);
      const fx = ((x + 22) / 5.5) % 1, fz = ((z + 22 + (cx % 2) * 2.5) / 5) % 1;
      const edge = fx < 0.16 || fz < 0.18;
      const shell = edge ? C('#3a3920') : ((cx + cz) % 2 ? C('#6f7a39') : C('#82784a'));
      for (let y = top; y <= 1; y++) {
        const inner = y > top + 1 && y < 1 && e < 0.8; if (inner) continue;
        const isTop = y === top || y === top + 1;
        m.add(x, y, z, y >= 1 ? C('#d9c48c') : isTop ? shell : C('#5e5a34'), nrm(x / 121, y < 1 ? -1 : 1, z / 64), 0, 0);
      }
    }
    for (let x = 11; x <= 16; x++) for (let y = -3; y <= 1; y++) for (let z = -2; z <= 2; z++) {
      if ((x - 14) ** 2 / 9 + (y + 1) ** 2 / 5 + z * z / 5 > 1.1) continue;
      m.add(x, y, z, (x + y + z) % 3 === 0 ? C('#5c6b3e') : C('#93a36c'), nrm(x - 13, y + 1, z), 0, 0);
    }
    for (const s of [-1, 1]) { m.add(16, -2, s * 1.6, [10, 10, 10], [0.3, 0, s]); }
    for (const [g, s, x0, len, piv] of [[1, -1, 6, 11, 7], [2, 1, 6, 11, 7], [3, -1, -8, 5, 5], [4, 1, -8, 5, 5]]) {
      for (let k = 0; k <= len; k++) for (let dx = 0; dx < (g < 3 ? 3 : 2); dx++) {
        m.add(x0 - k * 0.55 - dx, 0.5, s * (piv + k * 0.9), (k + dx) % 4 === 0 ? C('#5c6b3e') : C('#8b9a62'), nrm(0, -0.6, s * 0.4), g, 0);
      }
    }
    return m.done();
  }

  function genManta() {
    const m = new Model();
    for (let x = -13; x <= 13; x++) for (let z = -27; z <= 27; z++) {
      const az = Math.abs(z) / 27, lim = 13 * Math.pow(1 - az, 0.7) - (x < 0 ? az * 4 : 0);
      if (Math.abs(x + az * 5) > lim) continue;
      const th = Math.max(1, Math.round(2.6 * (1 - az)));
      for (let y = -th + 1; y <= 0; y++) {
        const top = y === -th + 1;
        m.add(x + az * 5, y, z, top ? (vnoise(x, z) > 0.86 ? C('#3d4f5a') : C('#1f2c35')) : C('#e7ecee'), nrm(0, top ? -1 : 1, 0), 0, az);
      }
    }
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) m.add(13 + k, 0, s * (4 - k * 0.3), C('#1f2c35'), [0, -1, 0], 0, 0);
    for (let k = 0; k < 22; k++) m.add(-13 - k, 0, 0, C('#1f2c35'), [0, -1, 0], 0, 0);
    return m.done();
  }

  function genJelly(colA, colB) {
    const m = new Model(), R = 6.5;
    for (let x = -7; x <= 7; x++) for (let y = -7; y <= 0; y++) for (let z = -7; z <= 7; z++) {
      const d = Math.sqrt(x * x + y * y * 1.3 + z * z);
      if (d > R || d < R - 1.4) continue;
      m.add(x, y, z, y > -1.5 ? colB : colA, nrm(x, y, z), 1, 0);
    }
    for (let a = 0; a < 10; a++) {
      const an = (a / 10) * TAU, len = 14 + (a % 3) * 4;
      for (let y = 1; y < len; y++) m.add(Math.cos(an) * R * 0.85, y, Math.sin(an) * R * 0.85, colB, [0, 0, -1], 2, y / len);
    }
    for (let a = 0; a < 4; a++) {
      const an = (a / 4) * TAU + 0.4;
      for (let y = 0; y < 11; y++) for (let k = 0; k < 2; k++) m.add(Math.cos(an) * (1.5 + k), y, Math.sin(an) * (1.5 + k), colA, [0, 0, -1], 2, y / 11);
    }
    return m.done();
  }

  function genCrab() {
    const m = new Model();
    for (let x = -5; x <= 5; x++) for (let y = -3; y <= 1; y++) for (let z = -4; z <= 4; z++) {
      const e = x * x / 25 + (y + 1) ** 2 / 4 + z * z / 16; if (e > 1) continue;
      m.add(x, y, z, y < -1 ? ((x + z) % 3 === 0 ? C('#b8331f') : C('#d9452a')) : C('#f0905e'), nrm(x / 25, (y + 1) / 4, z / 16));
    }
    for (const s of [-1, 1]) {
      m.add(s * 1.6, -4, -3, C('#d9452a'), [0, -1, -1]); m.add(s * 1.6, -5, -3, [15, 15, 15], [0, -1, -1]);
      for (let leg = 0; leg < 3; leg++) {
        const g = (s < 0 ? 1 : 4) + leg, zz = -1.5 + leg * 2;
        for (let k = 0; k < 5; k++) m.add(s * (5 + k), k < 2 ? -1 + k * 0.5 : k - 1.5, zz, C('#c9402a'), [0, -1, 0], g, k / 4);
      }
      for (let k = 0; k < 3; k++) m.add(s * (3 + k), -1, -4 - k * 0.6, C('#d9452a'), [0, -1, -1], 0, 0);
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) m.add(s * (5 + dx), -2 + dy, -6, dy === 1 && dx === 2 ? C('#7a1f12') : C('#e2553a'), [0, -1, -1], 0, 0);
    }
    return m.done();
  }

  function genBoat(hullCol) {
    const m = new Model();
    for (let x = -26; x <= 26; x++) {
      const u = (x + 26) / 52;
      const beam = 7.5 * (u < 0.68 ? 0.88 + u * 0.18 : Math.sqrt(Math.max(0, 1 - ((u - 0.68) / 0.32) ** 2)));
      const draft = 5.2 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
      if (beam < 0.5) continue;
      for (let z = -Math.ceil(beam); z <= Math.ceil(beam); z++) {
        const az = Math.abs(z) / beam; if (az > 1) continue;
        const bottom = draft * (1 - az * az * 0.85);
        for (let y = -2; y <= bottom; y++) {
          const surf = y > bottom - 1.3 || az > 0.82 || y < -1;
          if (!surf) continue;
          const col = y < -0.5 ? C('#1d2c4d') : y < 1 ? C('#f2f2ee') : hullCol;
          m.add(x, y, z, col, nrm(0, y > 0 ? 1 : -1, z / beam), 0, 0);
        }
      }
      if (u > 0.08 && u < 0.92) m.add(x, draft + 1, 0, C('#2b2b2b'), [0, 1, 0]);
    }
    for (let y = 0; y < 6; y++) for (let x = -28; x <= -27; x++) m.add(x, y, 0, C('#2b2b2b'), [0, 0, -1]);
    for (let k = -3; k <= 3; k++) { m.add(-26.5, 4 + k, 0, C('#c9b26a'), [0, 0, -1], 1); m.add(-26.5, 4, k, C('#c9b26a'), [0, 1, 0], 1); }
    return m.done();
  }

  /* scenery */
  function genRock(R, rng, algae) {
    const m = new Model(), rx = R * (1 + rng() * 0.6), ry = R * (0.6 + rng() * 0.4), rz = R * (0.8 + rng() * 0.4);
    for (let x = -Math.ceil(rx); x <= rx; x++) for (let y = -Math.ceil(ry); y <= 0; y++) for (let z = -Math.ceil(rz); z <= rz; z++) {
      const nz = vnoise(x * 0.4, y * 0.4 + z * 0.3) * 0.35;
      const e = x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz);
      if (e > 1 - nz || e < 0.45) continue;
      const top = y < -ry * 0.5;
      const c = top && algae && vnoise(x, z) > 0.35 ? C('#4d6b3a') : (vnoise(x * 2, y * 3) > 0.7 ? C('#5d6266') : C('#767b7c'));
      m.add(x, y, z, c, nrm(x / rx, y / ry, z / rz));
    }
    return m.done();
  }
  function genBrain(R, col1, col2) {
    const m = new Model();
    for (let x = -R; x <= R; x++) for (let y = -R; y <= 0; y++) for (let z = -R; z <= R; z++) {
      const d = Math.sqrt(x * x + y * y * 1.4 + z * z); if (d > R || d < R - 1.6) continue;
      const ridge = Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2.2) > 0.2;
      m.add(x, y, z, ridge ? col1 : col2, nrm(x, y, z));
    }
    return m.done();
  }
  function genBranch(rng, col, tip) {
    const m = new Model();
    const grow = (x, y, z, ax, ay, az, len, depth) => {
      for (let i = 0; i < len; i++) {
        x += ax; y += ay; z += az;
        m.add(Math.round(x), Math.round(y), Math.round(z), i > len - 2 ? tip : col, nrm(ax, -0.5, az));
        if (depth < 2) m.add(Math.round(x) + 1, Math.round(y), Math.round(z), col, nrm(1, 0, 0));
      }
      if (depth < 3) {
        const kids = 2 + (rng() < 0.4 ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const a = rng() * TAU;
          grow(x, y, z, ax * 0.4 + Math.cos(a) * 0.6, -0.9, az * 0.4 + Math.sin(a) * 0.6, Math.round(len * (0.6 + rng() * 0.25)), depth + 1);
        }
      }
    };
    grow(0, 0, 0, 0, -1, 0, 6 + Math.round(rng() * 4), 0);
    return m.done();
  }
  function genFan(rng, col) {
    const m = new Model(), R = 13 + rng() * 5;
    for (let x = -R; x <= R; x++) for (let y = -R; y <= 0; y++) {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (r > R) continue;
      const vein = Math.abs(Math.sin(a * 9 + r * 0.12)) < 0.22 || Math.abs(Math.sin(r * 0.9)) < 0.18;
      if (!vein && r > 3) continue;
      m.add(x, y, Math.round(Math.sin(x * 0.3) * 1.2), col, [0, -0.3, -1]);
    }
    for (let y = 0; y < 3; y++) m.add(0, y, 0, col, [0, 0, -1]);
    return m.done();
  }
  function genTubes(rng, col, inner) {
    const m = new Model(), n = 2 + Math.floor(rng() * 3);
    for (let t = 0; t < n; t++) {
      const ox = (t - n / 2) * 4 + rng() * 2, oz = rng() * 4 - 2, hgt = 7 + Math.floor(rng() * 10), r = 1.8 + rng();
      for (let y = 0; y < hgt; y++) for (let a = 0; a < 14; a++) {
        const an = a / 14 * TAU;
        m.add(ox + Math.cos(an) * r, -y, oz + Math.sin(an) * r, y === hgt - 1 ? inner : col, [Math.cos(an), 0, Math.sin(an)]);
      }
    }
    return m.done();
  }
  function genStar(col, dot) {
    const m = new Model();
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x), arm = Math.max(0, Math.cos(2.5 * a));
      if (r > 1.8 + 6.5 * Math.pow(arm, 3)) continue;
      m.add(x, 0, z, (x * 3 + z * 5) % 7 === 0 ? dot : col, [0, -1, 0]); m.add(x, -1, z, col, [0, -1, 0]);
    }
    return m.done();
  }
  function genUrchin() {
    const m = new Model();
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) { const d = Math.hypot(x, y, z); if (d <= 3 && d > 1.8) m.add(x, y - 2, z, C('#3b1f4d'), nrm(x, y, z)); }
    for (let i = 0; i < 26; i++) {
      const th = Math.acos(1 - 2 * (i + 0.5) / 26), ph = i * 2.4;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      if (dy > 0.5) continue;
      for (let k = 3; k < 7; k++) m.add(dx * k, dy * k - 2, dz * k, C('#2a1636'), nrm(dx, dy, dz));
    }
    return m.done();
  }
  function genWreck(rng) {
    const m = new Model(), wood = C('#4a3727'), dark = C('#2e231a'), moss = C('#3f5a35');
    for (let x = -50; x <= 50; x++) {
      const u = (x + 50) / 100, beam = 13 * (u < 0.7 ? 0.9 : Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)));
      for (let z = -Math.ceil(beam); z <= beam; z++) {
        const az = Math.abs(z) / beam; if (az > 1) continue;
        const depth = 12 * (1 - az * az * 0.8);
        for (let y = -depth; y <= 4; y++) {
          const shell = y < -depth + 1.5 || az > 0.85; if (!shell) continue;
          if (u > 0.35 && u < 0.52 && y > -depth * 0.6 && vnoise(x * 0.3, y * 0.3) > 0.35) continue; // hole
          m.add(x, y, z, vnoise(x * 0.5, y * 0.7 + z) > 0.78 ? moss : (x % 4 === 0 ? dark : wood), nrm(0, 0, z / beam));
        }
      }
    }
    for (let y = 0; y < 55; y++) for (let k = 0; k < 2; k++) m.add(6 + y * 0.35 + k, -12 - y, 0, dark, [-1, 0, -0.5]);
    for (let k = -14; k <= 14; k++) m.add(6 + 34 * 0.35 + k * 0.3, -12 - 34, k * 0.2, dark, [0, -1, 0]);
    return m.done();
  }
  function genChest() {
    const m = new Model(), wood = C('#6b4426'), band = C('#d4a63a');
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 0; y++) for (let z = -3; z <= 3; z++) {
      if (Math.abs(x) < 5 && y > -5 && y < 0 && Math.abs(z) < 3) continue;
      m.add(x, y, z, (Math.abs(x) === 3 || y === -3) ? band : wood, nrm(x / 5, y + 2.5, z / 3));
    }
    for (let x = -5; x <= 5; x++) for (let k = 0; k < 4; k++) m.add(x, -6 - k * 0.9, -3 + k * 0.4, x % 3 === 0 ? band : wood, [0, -1, 0]);
    for (let i = 0; i < 9; i++) m.add(-3 + i * 0.8, -5.5, (i % 3) - 1, C('#ffd75a'), [0, -1, 0]);
    return m.done();
  }

  /* ---------- world ---------- */
  const MODELS = {};
  function buildModels() {
    for (const k in SPECIES) MODELS[k] = genFish(SPECIES[k]);
    MODELS.turtle = genTurtle();
    MODELS.manta = genManta();
    MODELS.jellyPink = genJelly(C('#f29fd9'), C('#ffd6f1'));
    MODELS.jellyBlue = genJelly(C('#8fd8ff'), C('#d9f4ff'));
    MODELS.crab = genCrab();
    MODELS.boatRed = genBoat(C('#9b2f25'));
    MODELS.boatBlue = genBoat(C('#24527a'));
  }

  let schools = [], jellies = [], crabs = [], kelp = [], anemones = [], bubbles = [], foam = [], pops = [];
  let shark = null, turtle = null, manta = null, boat = null, sched = {};
  let mouse = { x: -999, y: -999 };
  let life = { fish: true, bubbles: true, kelp: true };
  let lifeMul = 1, sceneMul = 1;
  const bigActive = () => !!(shark || turtle || manta);

  const pickSpecies = () => {
    const keys = Object.keys(SPECIES).filter((k) => SPECIES[k].weight);
    let tot = keys.reduce((a, k) => a + SPECIES[k].weight, 0), r = Math.random() * tot;
    for (const k of keys) { r -= SPECIES[k].weight; if (r <= 0) return k; } return keys[0];
  };

  class School {
    constructor(initial) { this.reset(initial); }
    reset(initial) {
      this.sp = pickSpecies(); const S = SPECIES[this.sp];
      this.z = rnd(0.05, 0.85); this.s = scaleZ(this.z) * 0.72;
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.y = rnd(h * 0.12, h * 0.6);
      this.x = initial ? rnd(0, w) : (this.dir === 1 ? -40 : w + 40);
      this.vy = 0; this.wander = Math.random() * 100; this.boost = 0; this.turnCool = 4;
      const n = Math.round(rnd(S.school[0], S.school[1]));
      const spread = S.len * this.s * (this.sp === 'sardine' ? 1.6 : 2.2);
      this.fish = Array.from({ length: n }, () => ({
        ox: rnd(-spread, spread) * 1.3, oy: rnd(-spread, spread) * 0.55, oz: rnd(-0.02, 0.02),
        vx: 0, vy: 0, ph: Math.random() * TAU, f: rnd(0.85, 1.2), sj: rnd(0.88, 1.1),
        yaw: this.dir === 1 ? 0 : Math.PI, tr: rnd(1.6, 3),
      }));
    }
    tick(dt) {
      const S = SPECIES[this.sp];
      this.wander += dt * 0.25; this.turnCool -= dt;
      const target = Math.sin(this.wander) * 0.05 + Math.sin(this.wander * 0.37 + this.z * 9) * 0.035;
      this.vy += (target - this.vy) * 0.02;
      this.boost *= Math.pow(0.35, dt);
      if (this.turnCool < 0 && this.x > w * 0.15 && this.x < w * 0.85 && Math.random() < dt * 0.025) { this.dir *= -1; this.turnCool = 8; }
      const sp = S.speed * 0.22 * (0.55 + this.s * 0.45) * (1 + this.boost * 2.5) * dt * 60;
      this.x += sp * this.dir; this.y += this.vy * dt * 60;
      if (this.y < h * 0.08) this.vy += 0.01; if (this.y > h * 0.62) this.vy -= 0.01;
      const tyaw = this.dir === 1 ? 0 : Math.PI;
      for (const f of this.fish) {
        const fx = this.x + f.ox, fy = this.y + f.oy;
        const flee = (px, py, R, str) => {
          const dx = fx - px, dy = fy - py, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1, p = (1 - d / R) * str; f.vx += (dx / d) * p; f.vy += (dy / d) * p; this.boost = Math.min(1, this.boost + 0.03); }
        };
        flee(mouse.x, mouse.y, 34 * this.s, 0.5 * this.s);
        if (shark && Math.abs(shark.z - this.z) < 0.35) flee(shark.x, shark.y, 60 * shark.s, 0.6);
        f.vx += -f.ox * 0.0009; f.vy += -f.oy * 0.0016;
        f.vx *= Math.pow(0.06, dt); f.vy *= Math.pow(0.06, dt);
        f.ox += f.vx + (Math.cos(f.yaw) - this.dir) * sp * 0.9; f.oy += f.vy;
        f.yaw += (tyaw - f.yaw) * Math.min(1, dt * f.tr);
        f.ph += dt * (6 + this.boost * 12) * f.f * S.speed;
      }
      if ((this.dir === 1 && this.x > w + 60) || (this.dir === -1 && this.x < -60)) this.reset(false);
    }
    draw(o) {
      const S = SPECIES[this.sp], m = MODELS[this.sp];
      for (const f of this.fish) {
        o.x = this.x + f.ox; o.y = this.y + f.oy; o.z = this.z + f.oz; o.s = this.s * f.sj;
        o.yaw = f.yaw; o.pitch = clamp((this.vy + f.vy * 0.4) * 3, -0.5, 0.5) * Math.cos(f.yaw); o.roll = 0;
        o.kind = 1; o.ph = f.ph; o.amp = S.amp; o.k = TAU / (S.len * 1.15); o.alpha = 1; o.glow = 0; o.fogMul = 1; o.bright = 1;
        render(m, o);
      }
    }
  }

  function spawnShark() {
    const dir = Math.random() < 0.5 ? 1 : -1, z = rnd(0.25, 0.6);
    shark = { x: dir === 1 ? -120 : w + 120, y: rnd(h * 0.22, h * 0.5), z, s: scaleZ(z) * 0.8, dir, ph: 0, by: 0 };
    shark.by = shark.y;
  }
  function spawnTurtle() {
    const dir = Math.random() < 0.5 ? 1 : -1, z = rnd(0.15, 0.55);
    turtle = { x: dir === 1 ? -60 : w + 60, y: rnd(h * 0.15, h * 0.5), z, s: scaleZ(z) * 0.9, dir, ph: 0, by: 0 };
    turtle.by = turtle.y;
  }
  function spawnManta() {
    const dir = Math.random() < 0.5 ? 1 : -1, z = rnd(0.45, 0.8);
    manta = { x: dir === 1 ? -90 : w + 90, y: rnd(h * 0.18, h * 0.42), z, s: scaleZ(z) * 0.9, dir, ph: 0, by: 0 };
    manta.by = manta.y;
  }
  function spawnBoat() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    boat = { x: dir === 1 ? -90 : w + 90, y: h * 0.15, z: 0.38, s: scaleZ(0.38) * 0.95, dir, ph: 0, model: Math.random() < 0.5 ? 'boatRed' : 'boatBlue' };
  }

  class Jelly {
    constructor(initial) { this.reset(initial); }
    reset(initial) {
      this.z = rnd(0.15, 0.8); this.s = scaleZ(this.z) * rnd(0.7, 1.05);
      this.x = rnd(0, w); this.y = initial ? rnd(h * 0.1, h * 0.7) : h * 0.75 + 30; this.ph = Math.random() * TAU;
      this.model = Math.random() < 0.6 ? 'jellyPink' : 'jellyBlue'; this.drift = rnd(-0.06, 0.06);
    }
    tick(dt) {
      this.ph += dt * 2.2;
      const push = Math.max(0, Math.sin(this.ph)) * 0.16 + 0.02;
      this.y -= push * dt * 60 * this.s; this.x += this.drift * dt * 60;
      if (this.y < -20 * this.s) this.reset(false);
    }
    draw(o) {
      o.x = this.x; o.y = this.y; o.z = this.z; o.s = this.s; o.yaw = this.ph * 0.05; o.pitch = 0; o.roll = -0.35;
      o.kind = 3; o.ph = this.ph; o.alpha = 0.55; o.glow = (theme && theme.bio ? 40 : 8); o.fogMul = 0.7; o.bright = 1.1;
      render(MODELS[this.model], o);
    }
  }

  class Crab {
    constructor() {
      this.z = rnd(0.05, 0.35); this.s = scaleZ(this.z) * 0.8;
      this.x = Math.random() < 0.5 ? rnd(w * 0.03, w * 0.3) : rnd(w * 0.7, w * 0.97); this.ph = 0; this.dir = 1; this.walk = 0; this.next = 0;
    }
    tick(dt, t) {
      if (t > this.next) { this.walk = Math.random() < 0.55 ? (Math.random() < 0.5 ? -1 : 1) : 0; this.next = t + rnd(1.5, 4.5); }
      if (this.walk) { this.x += this.walk * 0.12 * this.s * dt * 60; this.ph += dt * 6; }
      if (this.x < 4 || this.x > w - 4) { this.walk *= -1; this.x = clamp(this.x, 4, w - 4); }
    }
    draw(o) {
      o.x = this.x; o.y = floorY(this.z) - 1.5 * this.s; o.z = this.z; o.s = this.s; o.yaw = 0; o.pitch = 0; o.roll = -0.55;
      o.kind = 5; o.ph = this.ph; o.alpha = 1; o.glow = 0; o.fogMul = 1; o.bright = 1;
      render(MODELS.crab, o);
    }
  }

  function makeKelp(x, z) {
    return { x, z, s: scaleZ(z), len: Math.round(rnd(h * 0.3, h * 0.55)), ph: Math.random() * TAU, sp: rnd(0.4, 0.75) };
  }
  const KELP_A = hex('#2f6b3a'), KELP_B = hex('#4b8f46'), KELP_C = hex('#6b8a2e');
  function drawKelp(k, t) {
    const base = floorY(k.z), fa = fogAmt(k.z), s = k.s, size = s <= 1.12 ? 1 : Math.ceil(s);
    const L = k.len * s * 0.85, step = 1 / s;
    let px = k.x, py = base;
    for (let i = 0; i < L; i += 1) {
      const p = i / L;
      const sway = Math.sin(t * k.sp + k.ph + p * 2.6) * 10 * s * p * p + Math.sin(t * 0.3 + k.ph) * 5 * s * p;
      const x = k.x + sway, y = base - i;
      const c = (i % 7 < 1) ? KELP_C : KELP_A;
      putSolid(x, y, k.z - p * 0.0001, c, fa, size, 0.95);
      if (i % Math.max(2, Math.round(4 * s)) === 0 && i > 4) {
        const side = (i / Math.max(2, Math.round(4 * s))) % 2 ? 1 : -1;
        const bl = (7 + 4 * Math.sin(i)) * s;
        const curl = Math.sin(t * 1.3 + i * 0.2 + k.ph) * 0.3;
        for (let j = 1; j < bl; j++) {
          const bx = x + side * j * 0.9, by = y - j * (0.55 + curl) + (j * j) / (bl * 3);
          putSolid(bx, by, k.z, j < bl * 0.3 ? KELP_A : KELP_B, fa, size, 0.85 + 0.25 * (side > 0 ? 1 : 0.6));
        }
      }
    }
    // bladders
    void step; void px; void py;
  }
  function putSolid(x, y, z, c, fa, size, light) {
    const ix = x | 0, iy = y | 0; if (iy < 0 || iy >= h) return;
    const row = iy * 3;
    const r = clamp(c[0] * light + (fog[row] - c[0] * light) * fa, 0, 255) | 0;
    const g = clamp(c[1] * light + (fog[row + 1] - c[1] * light) * fa, 0, 255) | 0;
    const b = clamp(c[2] * light + (fog[row + 2] - c[2] * light) * fa, 0, 255) | 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const xx = ix + dx, yy = iy + dy; if (xx < 0 || xx >= w || yy >= h) continue;
      const id = yy * w + xx; if (z < dep[id]) { dep[id] = z; buf[id] = 0xff000000 | (b << 16) | (g << 8) | r; }
    }
  }

  function makeAnemone(x, z) { return { x, z, s: scaleZ(z), n: 16, ph: Math.random() * TAU, col: Math.random() < 0.5 ? hex('#c45bd6') : hex('#e8708a'), tip: hex('#ffd6f0'), clown: [0, 1].map((i) => ({ a: i * Math.PI, r: rnd(10, 16), sp: rnd(0.5, 0.9) * (i ? 1 : -1), ph: Math.random() * TAU })) }; }
  function drawAnemone(a, t, o) {
    const base = floorY(a.z), fa = fogAmt(a.z), s = a.s, size = s <= 1.12 ? 1 : Math.ceil(s);
    for (let i = 0; i < a.n; i++) {
      const an = (i / a.n) * Math.PI - Math.PI, len = (8 + (i % 3) * 2) * s;
      for (let j = 0; j < len; j++) {
        const p = j / len, sway = Math.sin(t * 1.5 + a.ph + i * 0.7 + p * 2) * 3 * s * p;
        const x = a.x + Math.cos(an) * (3 * s + j * 0.6) + sway, y = base - 2 * s + Math.sin(an) * j * 0.9;
        putSolid(x, y, a.z - 0.002, p > 0.8 ? a.tip : a.col, fa, size, 0.9 + p * 0.3);
      }
    }
    for (let dx = -4; dx <= 4; dx++) for (let dy = 0; dy < 3; dy++) putSolid(a.x + dx * s, base - dy * s, a.z, hex('#8a3f6a'), fa, size, 0.8);
    for (const c of a.clown) {
      c.a += c.sp * 0.016; c.ph += 0.12;
      o.x = a.x + Math.cos(c.a) * c.r * s; o.y = base - 14 * s + Math.sin(c.a * 2) * 4 * s; o.z = a.z + Math.sin(c.a) * 0.03; o.s = s * 0.95;
      o.yaw = (c.sp > 0 ? -1 : 1) * (c.a + Math.PI / 2); o.pitch = 0; o.roll = 0; o.kind = 1; o.ph = c.ph; o.amp = 0.8; o.k = TAU / 11; o.alpha = 1; o.glow = 0; o.fogMul = 1; o.bright = 1;
      render(MODELS.clown, o);
    }
  }

  class Bubble {
    constructor(x, y, r, vy) { this.x = x; this.y = y; this.r = r; this.vy = vy != null ? vy : -(0.12 + Math.sqrt(r) * 0.16); this.ph = Math.random() * TAU; this.dead = false; }
    tick(dt) {
      this.ph += dt * 3; this.vy += (-(0.12 + Math.sqrt(this.r) * 0.16) - this.vy) * dt * 1.5;
      this.y += this.vy * dt * 60; this.x += Math.sin(this.ph) * 0.12 * Math.min(1, this.r);
      this.r *= 1 + 0.0004 * dt * 60; if (this.y < -4) this.dead = true;
    }
    draw() {
      const r = this.r;
      if (r < 1.1) { blendPx(this.x, this.y, BUB_HI, 0.75); return; }
      const steps = Math.max(8, Math.round(r * 7));
      for (let i = 0; i < steps; i++) { const a = (i / steps) * TAU; blendPx(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * (1 + Math.sin(this.ph * 1.7) * 0.08), BUB_RIM, 0.62); }
      blendPx(this.x - r * 0.4, this.y - r * 0.45, BUB_HI, 0.95);
      if (r > 2.2) blendPx(this.x - r * 0.4 + 1, this.y - r * 0.45, BUB_HI, 0.6);
    }
  }
  const BUB_RIM = [205, 245, 255], BUB_HI = [255, 255, 255];
  let vents = [], chestPos = null;

  /* ---------- static scenery ---------- */
  function buildStatic() {
    sBuf.fill(0); sDep.fill(1e9);
    T.buf = sBuf; T.dep = sDep;
    const saveFog = fog; fog = fogStatic || fog;
    const rng = mulberry(1337 + w);
    const o = O();
    const place = (m, xf, z, opts = {}) => {
      o.x = xf * w; o.z = z; o.s = scaleZ(z) * (opts.scale || 1) * 1.6; o.y = floorY(z) + (opts.dy || 0) * o.s;
      o.yaw = opts.yaw || 0; o.pitch = 0; o.roll = opts.roll || 0; o.kind = 0; o.alpha = 1; o.glow = 0; o.fogMul = opts.fog || 1; o.bright = opts.bright || 1;
      render(m, o);
    };
    const wreckLeft = rng() < 0.5;
    place(genWreck(rng), wreckLeft ? 0.17 : 0.83, 0.86, { scale: 0.85, roll: -0.2, yaw: wreckLeft ? 0.5 : -0.5, fog: 0.95 });
    chestPos = { x: (wreckLeft ? 0.29 : 0.71) * w, z: 0.6 };
    place(genChest(), wreckLeft ? 0.29 : 0.71, 0.6, { roll: -0.35, yaw: wreckLeft ? 0.4 : -0.4 });
    const corals = [
      () => genBrain(6 + Math.round(rng() * 4), C('#d9c27a'), C('#a5874a')),
      () => genBrain(5 + Math.round(rng() * 3), C('#9ed39a'), C('#5f9a63')),
      () => genBranch(rng, C('#e88aa8'), C('#ffd1df')),
      () => genBranch(rng, C('#f08a4b'), C('#ffd2a8')),
      () => genBranch(rng, C('#b9a2ff'), C('#efe6ff')),
      () => genFan(rng, C('#b0479c')),
      () => genFan(rng, C('#e2604a')),
      () => genTubes(rng, C('#8a5ad1'), C('#2a1640')),
      () => genTubes(rng, C('#f0a040'), C('#5a2c10')),
    ];
    const reef = Math.round(5 * sceneMul);
    for (const side of [0, 1]) {
      const cx = side ? 0.92 : 0.08;
      place(genRock(9, rng, true), cx + (side ? 0.02 : -0.02), 0.35, { roll: -0.3 });
      for (let i = 0; i < reef; i++) {
        const z = 0.04 + rng() * 0.4, xf = cx + (rng() - 0.5) * 0.16;
        const m = corals[Math.floor(rng() * corals.length)]();
        place(m, clamp(xf, 0.01, 0.99), z, { roll: -0.25, yaw: rng() * TAU });
      }
    }
    const edge = () => (rng() < 0.5 ? 0.03 + rng() * 0.2 : 0.77 + rng() * 0.2);
    place(genStar(C('#e8743b'), C('#ffd0a0')), edge(), 0.05 + rng() * 0.2, { roll: -0.9, yaw: rng() * TAU });
    place(genUrchin(), edge(), 0.1 + rng() * 0.25, { roll: -0.2 });
    place(genRock(4, rng, false), 0.35 + rng() * 0.3, 0.55 + rng() * 0.2, { roll: -0.3 });
    fog = saveFog;
    T.buf = buf; T.dep = dep;
    staticDirty = false;
  }

  /* ---------- fog ---------- */
  function themeFog() {
    const rows = new Float32Array(h * 3);
    const sh = hex(theme.shallow), dp = hex(theme.deep);
    for (let y = 0; y < h; y++) {
      const t = y / h, c = mix(mix(sh, [255, 255, 255], 0.15), mix(dp, sh, 0.5), Math.pow(t, 0.8));
      rows[y * 3] = c[0]; rows[y * 3 + 1] = c[1]; rows[y * 3 + 2] = c[2];
    }
    return rows;
  }

  /* ---------- public ---------- */
  let lastT = 0, built = false, W = 0, H = 0;
  const Sea = {
    init(canvas) { cv = canvas; ctx = cv.getContext('2d'); buildModels(); built = true; },
    resize(cssW, cssH, quality) {
      W = cssW; H = cssH;
      PX = quality === 'low' ? 5 : quality === 'ultra' ? 3 : 4;
      w = Math.max(16, Math.round(cssW / PX)); h = Math.max(16, Math.round(cssH / PX));
      cv.width = w; cv.height = h;
      img = ctx.createImageData(w, h); buf = new Uint32Array(img.data.buffer); dep = new Float32Array(w * h);
      sBuf = new Uint32Array(w * h); sDep = new Float32Array(w * h);
      T.buf = buf; T.dep = dep;
      if (theme) { fog = themeFog(); fogStatic = fog; }
      this.populate();
    },
    populate() {
      if (!theme || !w) return;
      const mul = lifeMul * (theme.lifeMul || 1);
      schools = Array.from({ length: Math.max(2, Math.round((2 + w / 200) * mul)) }, () => new School(true));
      jellies = Array.from({ length: Math.round((theme.jellies != null ? theme.jellies : 1) * (0.5 + mul * 0.5)) }, () => new Jelly(true));
      crabs = Array.from({ length: mul > 1 ? 2 : 1 }, () => new Crab());
      kelp = [];
      const kn = Math.round((2 + w / 120) * (theme.kelp != null ? theme.kelp : 1) * mul);
      for (let i = 0; i < kn; i++) { const e = Math.random() < 0.5 ? rnd(0, 0.16) : rnd(0.84, 1); kelp.push(makeKelp(e * w, rnd(0.1, 0.75))); }
      anemones = [makeAnemone((Math.random() < 0.5 ? rnd(0.14, 0.2) : rnd(0.8, 0.86)) * w, rnd(0.1, 0.2))];
      vents = Array.from({ length: 2 }, () => ({ x: rnd(w * 0.05, w * 0.95), next: 0 }));
      bubbles = Array.from({ length: Math.round(10 * mul) }, () => new Bubble(rnd(0, w), rnd(0, h), rnd(0.6, 2.4)));
      shark = turtle = manta = boat = null;
      const t = lastT;
      sched = { shark: t + rnd(10, 25), turtle: t + rnd(40, 70), manta: t + rnd(80, 120), boat: t + rnd(6, 15) };
      staticDirty = true;
    },
    setTheme(th) { theme = th; if (w) { fog = themeFog(); fogStatic = fog; this.populate(); } },
    setFogRows(rows) { // rows: Uint8Array RGB for each low-res row sampled from the water shader
      if (!rows || rows.length !== h * 3) return;
      fog = rows; if (!fogStatic || staticDirty || this._refog) { fogStatic = rows; staticDirty = true; this._refog = false; }
    },
    refog() { this._refog = true; },
    get lowH() { return h; },
    setLife(k, v) { life[k] = v; },
    setDensity(m) { lifeMul = m; sceneMul = m; this.populate(); },
    click(x, y) {
      const lx = x / PX, ly = y / PX;
      for (const b of bubbles) { if ((b.x - lx) ** 2 + (b.y - ly) ** 2 < (b.r + 4) ** 2) { pops.push({ x: b.x, y: b.y, r: b.r, life: 1 }); b.dead = true; } }
      for (let i = 0; i < 8; i++) bubbles.push(new Bubble(lx + rnd(-3, 3), ly + rnd(-2, 2), rnd(0.6, 1.8)));
      schools.forEach((s) => { if ((s.x - lx) ** 2 + (s.y - ly) ** 2 < 70 * 70) s.boost = 1; });
    },
    pointer(x, y) { mouse.x = x / PX; mouse.y = y / PX; },
    tick(dt, t) {
      if (!built || !theme || !w) return;
      lastT = t;
      if (staticDirty) buildStatic();
      buf.set(sBuf); dep.set(sDep);
      T.buf = buf; T.dep = dep;
      const o = O();

      if (life.kelp) { kelp.forEach((k) => drawKelp(k, t)); anemones.forEach((a) => drawAnemone(a, t, o)); }

      if (life.fish) {
        schools.forEach((s) => { s.tick(dt); s.draw(o); });
        crabs.forEach((c) => { c.tick(dt, t); c.draw(o); });

        if (!shark && t > sched.shark) { if (bigActive()) sched.shark = t + 15; else spawnShark(); }
        if (shark) {
          const S = SPECIES.shark;
          shark.ph += dt * 2.2; shark.x += shark.dir * 0.32 * shark.s * dt * 60; shark.y = shark.by + Math.sin(shark.ph * 0.25) * 6;
          Object.assign(o, { x: shark.x, y: shark.y, z: shark.z, s: shark.s, yaw: shark.dir === 1 ? 0 : Math.PI, pitch: Math.cos(shark.ph * 0.25) * 0.06 * shark.dir, roll: 0, kind: 1, ph: shark.ph, amp: S.amp, k: TAU / (S.len * 1.1), alpha: 1, glow: 0, fogMul: 1, bright: 1 });
          render(MODELS.shark, o);
          if (shark.x < -160 || shark.x > w + 160) { shark = null; sched.shark = t + rnd(35, 80); }
        }
        if (!turtle && t > sched.turtle) { if (bigActive()) sched.turtle = t + 15; else spawnTurtle(); }
        if (turtle) {
          turtle.ph += dt * 1.6; turtle.x += turtle.dir * 0.16 * turtle.s * dt * 60 * (0.6 + Math.max(0, Math.sin(turtle.ph)) * 0.8); turtle.y = turtle.by + Math.sin(turtle.ph * 0.3) * 5;
          Object.assign(o, { x: turtle.x, y: turtle.y, z: turtle.z, s: turtle.s, yaw: turtle.dir === 1 ? 0 : Math.PI, pitch: 0, roll: -0.45, kind: 4, ph: turtle.ph, alpha: 1, glow: 0, fogMul: 1, bright: 1 });
          render(MODELS.turtle, o);
          if (turtle.x < -100 || turtle.x > w + 100) { turtle = null; sched.turtle = t + rnd(50, 110); }
        }
        if (!manta && t > sched.manta) { if (bigActive()) sched.manta = t + 15; else spawnManta(); }
        if (manta) {
          manta.ph += dt * 1.3; manta.x += manta.dir * 0.22 * manta.s * dt * 60; manta.y = manta.by + Math.sin(manta.ph * 0.4) * 8;
          Object.assign(o, { x: manta.x, y: manta.y, z: manta.z, s: manta.s, yaw: manta.dir === 1 ? 0 : Math.PI, pitch: 0, roll: -0.75, kind: 2, ph: manta.ph, alpha: 1, glow: 0, fogMul: 1, bright: 1 });
          render(MODELS.manta, o);
          if (manta.x < -140 || manta.x > w + 140) { manta = null; sched.manta = t + rnd(60, 130); }
        }
        if (!boat && t > sched.boat) spawnBoat();
        if (boat) {
          boat.ph += dt * 18; boat.x += boat.dir * 0.42 * dt * 60;
          Object.assign(o, { x: boat.x, y: boat.y + Math.sin(t * 1.4) * 0.6, z: boat.z, s: boat.s, yaw: boat.dir === 1 ? 0 : Math.PI, pitch: Math.sin(t * 1.1) * 0.02, roll: -1.05, kind: 6, ph: boat.ph, amp: 4, alpha: 1, glow: 0, fogMul: 0.85, bright: 0.85 });
          render(MODELS[boat.model], o);
          const stern = boat.x - boat.dir * 27 * boat.s;
          if (life.bubbles && Math.random() < 0.9) for (let i = 0; i < 2; i++) bubbles.push(new Bubble(stern + rnd(-2, 2), boat.y + rnd(1, 4) * boat.s, rnd(0.5, 1.6), rnd(0.05, 0.35)));
          for (let i = 0; i < 3; i++) foam.push({ x: stern + rnd(-3, 3) - boat.dir * rnd(0, 6), y: boat.y - 4 * boat.s + rnd(-1.5, 1.5), life: 1, sp: rnd(-0.15, 0.15) });
          if (boat.x < -140 || boat.x > w + 140) { boat = null; sched.boat = t + rnd(30, 70); }
        }
      }

      // translucent pass
      if (life.fish) jellies.forEach((j) => { j.tick(dt); j.draw(o); });

      if (life.bubbles) {
        for (const v of vents) if (t > v.next) {
          const n = Math.round(rnd(3, 8));
          for (let i = 0; i < n; i++) bubbles.push(new Bubble(v.x + rnd(-1.5, 1.5), floorY(0.3) + rnd(0, 12), rnd(0.6, 2.3)));
          v.next = t + rnd(2.5, 7); if (Math.random() < 0.2) v.x = rnd(w * 0.05, w * 0.95);
        }
        if (chestPos && Math.random() < dt * 0.6) bubbles.push(new Bubble(chestPos.x + rnd(-2, 2), floorY(chestPos.z) - 4, rnd(0.6, 1.4)));
        for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.tick(dt); if (b.dead) bubbles.splice(i, 1); else b.draw(); }
        if (bubbles.length > 500) bubbles.splice(0, bubbles.length - 500);
      }
      for (let i = foam.length - 1; i >= 0; i--) { const f = foam[i]; f.life -= dt * 0.35; f.x += f.sp; if (f.life <= 0) foam.splice(i, 1); else blendPx(f.x, f.y, BUB_HI, f.life * 0.55); }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]; p.life -= dt * 2.5; if (p.life <= 0) { pops.splice(i, 1); continue; }
        const r = p.r + (1 - p.life) * 4;
        for (let a = 0; a < 8; a++) blendPx(p.x + Math.cos(a * 0.785) * r, p.y + Math.sin(a * 0.785) * r, BUB_HI, p.life * 0.8);
      }

      ctx.putImageData(img, 0, 0);
    },
    clear() { if (ctx) ctx.clearRect(0, 0, w, h); },
    get debug() { return JSON.stringify({ w, h, shark, boat, turtle, manta, sched, t: lastT }); },
    spawn(what) { ({ shark: spawnShark, turtle: spawnTurtle, manta: spawnManta, boat: spawnBoat })[what]?.(); },
  };
  window.Sea = Sea;
})();
