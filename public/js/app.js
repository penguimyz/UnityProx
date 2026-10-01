/* Unity — app logic for browser mode, shared state, AI chat, settings, palette.
   Desktop mode (desktop.js) builds on the API exported at the bottom as window.Unity. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ───────── event bus ───────── */
  const bus = new EventTarget();
  const on = (n, fn) => bus.addEventListener(n, (e) => fn(e.detail));
  const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));

  /* ───────── storage (safe) ───────── */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('u3.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('u3.' + k, JSON.stringify(v)); } catch {} if (store.onChange) store.onChange(k); },
    del(k) { try { localStorage.removeItem('u3.' + k); } catch {} },
    all() { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('u3.')) o[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } } catch {} return o; },
  };

  /* ───────── icons ───────── */
  const P = {
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    star: '<path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6L2 15a3 3 0 0 0 5.4 2l1.3-1.6a2 2 0 0 1 1.6-.8h3.4a2 2 0 0 1 1.6.8l1.3 1.6A3 3 0 0 0 22 15l-.7-6.4a4 4 0 0 0-4-3.6z"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 12h20M2 7.5h5M2 16.5h5M17 7.5h5M17 16.5h5"/>',
    note: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>', restore: '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    browser: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 6.5h.01M9 6.5h.01"/>',
    play: '<path d="M7 4v16l13-8z"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    drop: '<path d="M12 2.7 17.7 8.4a8 8 0 1 1-11.3 0z"/>', image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    logo: '<circle cx="12" cy="12" r="9.5"/><path d="M3.6 13.2c2.1-1.7 3.7-1.7 5.8 0s3.7 1.7 5.8 0 3.7-1.7 5.2-.4"/><path d="M6.5 16.6c1.8-1.2 3.3-1.2 5.1 0s3.3 1.2 5.1 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/>',
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((el) => { if (!el.dataset.iconDone) { el.insertAdjacentHTML('afterbegin', ic(el.dataset.icon)); el.dataset.iconDone = '1'; } });
  }

  /* ───────── themes ───────── */
  const THEMES = {
    reef: { name: 'Reef', shallow: '#2bb3c0', deep: '#03141f', sand: '#c9a96e', sun: '#fff3d6', accent: '#5fe3d0' },
    lagoon: { name: 'Lagoon', shallow: '#3fd4c6', deep: '#06465a', sand: '#ead9ab', sun: '#ffffff', accent: '#9af5e2', rays: 1.1 },
    abyss: { name: 'Abyss', shallow: '#0e3d6b', deep: '#01040b', sand: '#2b3242', sun: '#9cc8ff', accent: '#7aa2ff', bio: 1, rays: 0.35, caustics: 0.35, snow: 1.6, kelp: 0.4, jellies: 4 },
    kelp: { name: 'Kelp forest', shallow: '#3d9a72', deep: '#04170f', sand: '#7d7352', sun: '#f3ffd0', accent: '#b5e27a', kelp: 3 },
    dusk: { name: 'Dusk', shallow: '#b8716b', deep: '#140c26', sand: '#8a6a5c', sun: '#ffc58f', accent: '#ffb38a', rays: 0.85 },
    arctic: { name: 'Arctic', shallow: '#8fd0ea', deep: '#0b2238', sand: '#c8d6e0', sun: '#ffffff', accent: '#a8e6ff', kelp: 0, caustics: 0.7 },
  };
  const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  /* ───────── settings ───────── */
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || /CrOS/.test(navigator.userAgent);
  const DEF = {
    theme: 'reef', autoTheme: false, quality: lowEnd ? 'low' : 'medium', density: 'normal', ocean: true, fish: true, bubbles: true, kelp: true,
    pauseBehind: true, fps: false, startDesktop: false, clock24: false,
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    cloakTitle: 'New Tab', cloakIcon: '', blankUrl: true, adblock: true, panicKey: 'y', panicUrl: 'https://classroom.google.com',
  };
  const S = Object.assign({}, DEF, store.get('settings', {}));
  // migrate v1 cloak + shortcuts
  try {
    const t = localStorage.getItem('uc-t'); if (t && !store.get('settings')) S.cloakTitle = t;
    const i = localStorage.getItem('uc-i'); if (i && !store.get('settings')) S.cloakIcon = i;
  } catch {}

  function setSetting(k, v) { S[k] = v; store.set('settings', S); applySetting(k); emit('setting', k); }
  function applySetting(k) {
    switch (k) {
      case 'theme': case 'autoTheme': applyTheme(); break;
      case 'quality': Water.setQuality(S.quality); break;
      case 'density': Water.setDensity({ calm: 0.6, normal: 1, lively: 1.6 }[S.density] || 1); break;
      case 'ocean': Water.setEnabled(S.ocean); break;
      case 'fish': case 'bubbles': case 'kelp': Water.setLife(k, S[k]); break;
      case 'fps': $('#fps').hidden = !S.fps; Water.onFps(S.fps ? (f) => { $('#fps').textContent = f + ' fps'; } : null); break;
      case 'reduceMotion': document.body.classList.toggle('reduce-motion', S.reduceMotion); updateOcean(); break;
      case 'pauseBehind': updateOcean(); break;
      case 'cloakTitle': case 'cloakIcon': applyCloak(); break;
      case 'clock24': tickClocks(); break;
      case 'blankUrl': syncOmni(); break;
      default: break;
    }
  }
  function themeKey() {
    if (!S.autoTheme) return S.theme;
    const h = new Date().getHours();
    return h >= 6 && h < 10 ? 'lagoon' : h >= 10 && h < 17 ? 'reef' : h >= 17 && h < 20 ? 'dusk' : 'abyss';
  }
  let appliedTheme = null;
  function applyTheme() {
    const key = themeKey(); appliedTheme = key;
    const th = THEMES[key] || THEMES.reef;
    const r = document.documentElement.style, d = rgbOf(th.deep);
    r.setProperty('--accent', th.accent);
    r.setProperty('--on-accent', th.deep);
    r.setProperty('--deep', th.deep);
    r.setProperty('--glass', `rgba(${d[0]},${d[1]},${d[2]},.58)`);
    r.setProperty('--glass-strong', `rgba(${d[0]},${d[1]},${d[2]},.86)`);
    r.setProperty('--solid', `rgba(${d[0]},${d[1]},${d[2]},.95)`);
    $('meta[name="theme-color"]').content = th.deep;
    Water.setTheme(th);
  }
  function applyCloak() {
    document.title = S.cloakTitle || 'New Tab';
    let l = document.querySelector("link[rel~='icon']");
    if (S.cloakIcon) { if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); } l.href = S.cloakIcon; }
    else if (l) l.remove();
  }

  /* ───────── toast ───────── */
  function toast(msg, icon = 'check') {
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = ic(icon) + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2400);
  }

  /* ───────── games: favorites, plays ───────── */
  const GAMES = window.GAMES || [];
  let customGames = store.get('customGames', []);
  customGames.forEach((g) => GAMES.push(Object.assign({ custom: true }, g)));
  const GBY = new Map(GAMES.map((g) => [g.id, g]));
  function addCustomGame(name, url, cat) {
    const g = { id: 'my-' + uid(), name, url, cat: cat || 'My games', custom: true };
    customGames.push({ id: g.id, name, url, cat: g.cat }); store.set('customGames', customGames);
    GAMES.push(g); GBY.set(g.id, g); emit('games'); toast(`Added ${name} to your library`);
  }
  function removeCustomGame(id) {
    const g = GBY.get(id); if (!g || !g.custom) return;
    customGames = customGames.filter((c) => c.id !== id); store.set('customGames', customGames);
    GAMES.splice(GAMES.indexOf(g), 1); GBY.delete(id);
    if (isFav(id)) { favs = favs.filter((x) => x !== id); store.set('favs', favs); emit('favs'); }
    emit('games'); toast(`Removed ${g.name}`, 'trash');
  }
  let favs = store.get('favs', []).filter((id) => GBY.has(id));
  let plays = store.get('plays', {});
  const isFav = (id) => favs.includes(id);
  function toggleFav(id) {
    const g = GBY.get(id); if (!g) return;
    if (isFav(id)) { favs = favs.filter((x) => x !== id); toast(`Removed ${g.name} from favorites`, 'star'); }
    else { favs.unshift(id); toast(`Added ${g.name} to favorites`, 'star'); }
    store.set('favs', favs); emit('favs');
  }
  function recordPlay(id) { const p = plays[id] || { n: 0, t: 0 }; p.n++; p.t = Date.now(); plays[id] = p; store.set('plays', plays); emit('plays'); }
  const recentIds = () => Object.keys(plays).filter((id) => GBY.has(id) && plays[id].t).sort((a, b) => plays[b].t - plays[a].t);
  const CAT_HUE = { Action: 12, Arcade: 190, Classic: 38, Casual: 150, Horror: 285, Idle: 58, Multiplayer: 222, Music: 320, Puzzle: 258, Racing: 2, Runner: 170, Sandbox: 105, Shooter: 345, Sports: 28, Strategy: 205 };
  const hueOf = (g) => { if (CAT_HUE[g.cat] != null) return CAT_HUE[g.cat]; let h = 0; for (const c of g.cat) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const artVars = (g) => { const h = hueOf(g); return `--art-bg:linear-gradient(140deg,hsl(${h} 60% 40%),hsl(${(h + 40) % 360} 70% 15%));--art-fg:hsla(${h},95%,80%,.9)`; };
  const letters = (name) => { const s = name.replace(/[^A-Za-z0-9]/g, ''); return /^\d/.test(s) ? s.slice(0, 4) : s.slice(0, 2).replace(/^./, (c) => c.toUpperCase()); };
  const timeAgo = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
  function gameCard(g) {
    const p = plays[g.id], fav = isFav(g.id);
    const sub = p && p.n ? `Played ${p.n}× · ${timeAgo(p.t)}` : g.cat;
    return `<div class="gcard" data-play="${g.id}"${g.custom ? ' data-custom="1"' : ''} role="button" tabindex="0" aria-label="Play ${esc(g.name)}">
      <div class="gart" style="${artVars(g)}"><span class="gcat">${esc(g.cat)}</span><span class="gletter">${esc(letters(g.name))}</span>
        <div class="gplay"><span>${ic('play')}</span></div></div>
      <button class="gstar${fav ? ' on' : ''}" data-fav="${g.id}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${fav}">${ic('star')}</button>
      <div class="gmeta"><span class="gname">${esc(g.name)}</span><span class="gsub">${esc(sub)}</span></div></div>`;
  }

  /* library — can be mounted more than once (browser view + desktop window) */
  function Library(root, opts = {}) {
    const st = { c: opts.collection || 'all', q: '', sort: store.get('libSort', 'az') };
    let cats = [];
    root.innerHTML = `<div class="lib">
      <aside class="lib-side"></aside>
      <div class="lib-main">
        <div class="lib-head">
          <h2></h2>
          <label class="lib-search">${ic('search')}<input placeholder="Search games" aria-label="Search games"></label>
          <select class="lib-sort" aria-label="Sort"><option value="az">A to Z</option><option value="popular">Most played</option><option value="recent">Recently played</option></select>
          <button class="btn" data-random title="Play a random game (Alt+R)">${ic('shuffle')}Random</button>
          <button class="btn" data-add-game title="Add your own game">${ic('plus')}Add game</button>
        </div>
        <div class="lib-cats-m"></div>
        <div class="lib-grid"></div>
      </div></div>`;
    const side = $('.lib-side', root), grid = $('.lib-grid', root), title = $('.lib-head h2', root), input = $('.lib-search input', root), sortSel = $('.lib-sort', root), mcats = $('.lib-cats-m', root);
    sortSel.value = st.sort;
    const list = () => {
      let l = GAMES;
      if (st.c === 'favorites') l = favs.map((id) => GBY.get(id));
      else if (st.c === 'recent') l = recentIds().map((id) => GBY.get(id));
      else if (st.c !== 'all') l = GAMES.filter((g) => g.cat === st.c);
      if (st.q) { const q = st.q.toLowerCase(); l = l.filter((g) => g.name.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q)); }
      if (st.c !== 'recent' && st.c !== 'favorites') {
        if (st.sort === 'az') l = [...l].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (st.sort === 'popular') l = [...l].sort((a, b) => ((plays[b.id] || {}).n || 0) - ((plays[a.id] || {}).n || 0) || a.name.localeCompare(b.name));
        if (st.sort === 'recent') l = [...l].sort((a, b) => ((plays[b.id] || {}).t || 0) - ((plays[a.id] || {}).t || 0));
      }
      return l;
    };
    function renderSide() {
      cats = [...new Set(GAMES.map((g) => g.cat))].sort();
      const item = (c, label, icon, n) => `<button data-c="${esc(c)}" class="${st.c === c ? 'active' : ''}">${ic(icon)}<span>${esc(label)}</span><span class="count">${n}</span></button>`;
      side.innerHTML = item('all', 'All games', 'grid', GAMES.length) + item('favorites', 'Favorites', 'star', favs.length) + item('recent', 'Recently played', 'clock', recentIds().length)
        + '<h3>Categories</h3>' + cats.map((c) => item(c, c, 'gamepad', GAMES.filter((g) => g.cat === c).length)).join('');
      mcats.innerHTML = [['all', 'All'], ['favorites', 'Favorites'], ['recent', 'Recent'], ...cats.map((c) => [c, c])].map(([c, l]) => `<button data-c="${esc(c)}" class="${st.c === c ? 'active' : ''}">${esc(l)}</button>`).join('');
    }
    function render() {
      renderSide();
      const l = list();
      const label = st.c === 'all' ? 'All games' : st.c === 'favorites' ? 'Favorites' : st.c === 'recent' ? 'Recently played' : st.c;
      title.innerHTML = `${esc(label)}<small>${l.length}</small>`;
      if (!l.length) {
        grid.innerHTML = st.c === 'favorites' && !st.q
          ? `<div class="lib-empty"><b>No favorites yet</b>Hover a game and press the star to keep it here and on your home page.</div>`
          : st.c === 'recent' && !st.q ? `<div class="lib-empty"><b>Nothing played yet</b>Games you open will show up here.</div>`
          : `<div class="lib-empty"><b>No games match “${esc(st.q)}”</b>Try a different name or category.</div>`;
      } else grid.innerHTML = l.map(gameCard).join('');
    }
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]'); if (c) { st.c = c.dataset.c; render(); grid.scrollTop = 0; return; }
      if (e.target.closest('[data-add-game]')) { openGameDialog(); return; }
      if (e.target.closest('[data-random]')) { const l = list(); const g = (l.length ? l : GAMES)[Math.floor(Math.random() * (l.length || GAMES.length))]; if (g) play(g.id, opts.ctx); }
    });
    input.addEventListener('input', () => { st.q = input.value.trim(); render(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const g = list()[0]; if (g) play(g.id, opts.ctx); } });
    sortSel.addEventListener('change', () => { st.sort = sortSel.value; store.set('libSort', st.sort); render(); });
    on('favs', render); on('plays', render); on('games', render);
    render();
    return { setCollection(c) { st.c = c; render(); }, focus() { input.focus(); input.select(); }, el: root };
  }

  /* ───────── shortcuts ───────── */
  const fav = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
  const BUILTIN = [
    ['YouTube', 'https://youtube.com'], ['TikTok', 'https://tiktok.com'], ['ChatGPT', 'https://chatgpt.com'], ['CrazyGames', 'https://crazygames.com'],
    ['now.gg', 'https://now.gg'], ['GeForce Now', 'https://play.geforcenow.com'], ['Twitch', 'https://twitch.tv'], ['Spotify', 'https://open.spotify.com'], ['StreamEx', 'https://streamex.hn/'],
  ].map(([name, url]) => ({ name, url, builtin: true }));
  let custom = store.get('shortcuts', null);
  if (!custom) { try { custom = (JSON.parse(localStorage.getItem('uql') || '[]') || []).map((l) => ({ name: l.name, url: l.url })); } catch { custom = []; } store.set('shortcuts', custom); }
  let hiddenBuiltins = store.get('hiddenBuiltins', []);
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const shortcuts = () => [...BUILTIN.filter((b) => !hiddenBuiltins.includes(b.url)), ...custom];
  function removeShortcut(url) {
    if (BUILTIN.some((b) => b.url === url)) { hiddenBuiltins.push(url); store.set('hiddenBuiltins', hiddenBuiltins); }
    else { custom = custom.filter((c) => c.url !== url); store.set('shortcuts', custom); }
    emit('shortcuts'); toast('Shortcut removed', 'trash');
  }
  function addShortcut(name, url) { custom.push({ name, url }); store.set('shortcuts', custom); emit('shortcuts'); toast(`Added ${name}`); }

  /* ───────── url helpers ───────── */
  const ADS = ['doubleclick.net', 'googlesyndication.com', 'googletagmanager.com', 'adnxs.com', 'outbrain.com', 'taboola.com', 'amazon-adsystem.com', 'criteo.com', 'rubiconproject.com', 'openx.net', 'pubmatic.com', 'hotjar.com', 'connect.facebook.net'];
  const isAd = (u) => { if (!S.adblock) return false; try { const h = new URL(u).hostname; return ADS.some((d) => h === d || h.endsWith('.' + d)); } catch { return false; } };
  function resolveInput(raw) {
    raw = (raw || '').trim(); if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(raw)) return 'http://' + raw;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(raw) && !raw.includes(' ')) return 'https://' + raw;
    return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
  }
  let hist = store.get('history', []);
  function addHistory(url, title) {
    if (!url || url === 'about:blank') return;
    hist = [{ url, title: title || hostOf(url), t: Date.now() }, ...hist.filter((h) => h.url !== url)].slice(0, 80);
    store.set('history', hist);
  }

  /* ───────── suggestions ───────── */
  function suggest(q) {
    q = q.trim(); if (!q) return [];
    const ql = q.toLowerCase(), out = [];
    const target = resolveInput(q), isSearch = target.includes('google.com/search?q=');
    out.push({ type: 'url', url: target, label: q, sub: isSearch ? 'Search Google' : 'Open', icon: isSearch ? 'search' : 'globe' });
    GAMES.filter((g) => g.name.toLowerCase().includes(ql)).sort((a, b) => a.name.toLowerCase().indexOf(ql) - b.name.toLowerCase().indexOf(ql)).slice(0, 4)
      .forEach((g) => out.push({ type: 'game', id: g.id, label: g.name, sub: isFav(g.id) ? 'Favorite game' : 'Play game', g }));
    shortcuts().filter((s) => s.name.toLowerCase().includes(ql) || s.url.includes(ql)).slice(0, 2).forEach((s) => out.push({ type: 'url', url: s.url, label: s.name, sub: hostOf(s.url), fav: hostOf(s.url) }));
    hist.filter((h) => (h.title || '').toLowerCase().includes(ql) || h.url.toLowerCase().includes(ql)).slice(0, 3).forEach((h) => out.push({ type: 'url', url: h.url, label: h.title || h.url, sub: hostOf(h.url), icon: 'clock' }));
    return out.slice(0, 8);
  }
  function suggIcon(s) {
    if (s.type === 'game') return `<span class="si-ic" style="${artVars(s.g)};background:var(--art-bg);color:var(--art-fg)">${esc(letters(s.g.name).slice(0, 2))}</span>`;
    if (s.fav) return `<span class="si-ic" style="background:#fff"><img src="${fav(s.fav)}" width="16" height="16" alt=""></span>`;
    return `<span class="si-ic">${ic(s.icon || 'globe')}</span>`;
  }
  function bindSuggest(input, box, pick) {
    let items = [], sel = 0;
    const draw = () => {
      if (!items.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = items.map((s, i) => `<div class="sugg-item${i === sel ? ' sel' : ''}" data-i="${i}" role="option">${suggIcon(s)}<span class="si-t">${esc(s.label)}</span><span class="si-k">${esc(s.sub)}</span></div>`).join('');
    };
    input.addEventListener('input', () => { items = suggest(input.value); sel = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Escape') { items = []; draw(); input.blur(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[sel] || suggest(input.value)[0];
        items = []; draw();
        if (it) { pick(it); input.blur(); }
      }
    });
    box.addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-i]'); if (!el) return; e.preventDefault(); const it = items[+el.dataset.i]; items = []; draw(); pick(it); input.blur(); });
    input.addEventListener('blur', () => setTimeout(() => { items = []; draw(); }, 120));
  }
  function pickSuggestion(it) { if (!it) return; if (it.type === 'game') play(it.id); else navigate(it.url); }

  /* ───────── mode ───────── */
  let mode = 'browser';
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    document.body.classList.toggle('desktop', m === 'desktop');
    $('#desktop').hidden = m !== 'desktop';
    if (m === 'desktop') window.Desktop && Desktop.enter(); else window.Desktop && Desktop.exit();
    updateOcean();
  }
  function navigate(url) {
    if (!url) return;
    if (isAd(url)) { toast('Blocked an ad domain', 'x'); return; }
    if (mode === 'desktop' && window.Desktop) Desktop.openBrowser(url); else openUrl(url);
  }
  function play(id, ctx) {
    const g = GBY.get(id); if (!g) return;
    recordPlay(id);
    if ((ctx || mode) === 'desktop' && window.Desktop) Desktop.openGame(g); else openGameTab(g);
  }

  /* ───────── browser mode: tabs & views ───────── */
  let tabs = [], active = 'home', tid = 0;
  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation';
  function makeFrame(src, game) {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', SANDBOX);
    f.setAttribute('allow', 'autoplay; fullscreen; gamepad; clipboard-write; clipboard-read');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.setAttribute('allowfullscreen', '');
    if (game) f.dataset.game = '1';
    f.src = src;
    return f;
  }
  function newTab(url) {
    const t = { id: ++tid, kind: 'web', url: url || '', title: url ? hostOf(url) : 'New tab', bk: [], fw: [], frame: null, loading: !!url };
    tabs.push(t);
    if (url) attachFrame(t, url);
    switchTab(t.id);
    if (!url) setTimeout(() => $('#omni').focus(), 30);
    return t;
  }
  function attachFrame(t, url) {
    if (t.frame) t.frame.remove();
    t.frame = makeFrame(url, t.kind === 'game');
    t.loading = true; startProgress();
    t.frame.addEventListener('load', () => {
      t.loading = false; stopProgress();
      try { const tt = t.frame.contentDocument && t.frame.contentDocument.title; if (tt && t.kind === 'web') t.title = tt.slice(0, 60); } catch {}
      hookConsole(t.frame); renderTabs();
    });
    $('#frame-host').appendChild(t.frame);
  }
  function openUrl(url) {
    let t = tabs.find((x) => x.id === active);
    if (!t || t.kind === 'game') { newTab(url); addHistory(url); return; }
    if (t.url) t.bk.push(t.url);
    t.fw = []; t.url = url; t.title = hostOf(url);
    if (t.frame) { t.loading = true; startProgress(); t.frame.src = url; } else attachFrame(t, url);
    addHistory(url);
    switchTab(t.id);
  }
  function openGameTab(g) {
    let t = tabs.find((x) => x.gameId === g.id);
    if (!t) {
      t = { id: ++tid, kind: 'game', gameId: g.id, url: g.url, title: g.name, bk: [], fw: [], frame: null };
      tabs.push(t); attachFrame(t, g.url);
    }
    switchTab(t.id);
  }
  function switchTab(id) {
    active = id;
    const t = tabs.find((x) => x.id === id);
    showViewEl('web');
    $$('#frame-host iframe').forEach((f) => f.classList.toggle('active', !!t && f === t.frame));
    $('#frame-host').classList.toggle('game', !!t && t.kind === 'game');
    renderTabs(); syncOmni(); updateOcean();
  }
  function closeTab(id) {
    const i = tabs.findIndex((x) => x.id === id); if (i < 0) return;
    const t = tabs[i]; if (t.frame) { t.frame.src = 'about:blank'; t.frame.remove(); }
    tabs.splice(i, 1);
    if (active === id) { if (tabs.length) switchTab(tabs[Math.max(0, i - 1)].id); else showView('home'); }
    else renderTabs();
  }
  function showViewEl(name) {
    $$('#stage .view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.sections [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    $('.brand').classList.toggle('active', name === 'home');
  }
  let libBrowser = null;
  function showView(name, opts = {}) {
    if (mode === 'desktop' && window.Desktop) { Desktop.openApp(name === 'home' ? 'browser' : name, opts); return; }
    active = name;
    showViewEl(name);
    if (name === 'games') { if (!libBrowser) libBrowser = Library($('#games-browser')); if (opts.collection) libBrowser.setCollection(opts.collection); }
    if (name === 'ai') mountAI($('#ai-home'));
    if (name === 'movies') mountMovies($('#movies-home'));
    if (name === 'home') renderHome();
    renderTabs(); syncOmni(); updateOcean();
  }
  function renderTabs() {
    const el = $('#tabs');
    el.innerHTML = tabs.map((t) => {
      const g = t.gameId && GBY.get(t.gameId);
      const icon = g ? `<span class="tab-ic" style="${artVars(g)};background:var(--art-bg);color:var(--art-fg);font:800 9px var(--display)">${esc(letters(g.name).slice(0, 2))}</span>`
        : t.url ? `<span class="tab-ic"><img src="${fav(hostOf(t.url))}" alt="" onerror="this.remove()"></span>` : `<span class="tab-ic">${ic('globe')}</span>`;
      return `<div class="tab${t.id === active ? ' active' : ''}${t.loading ? ' loading' : ''}" data-tab="${t.id}" role="tab" aria-selected="${t.id === active}" title="${esc(t.title)}">${icon}<span class="tab-t">${esc(t.title)}</span><button class="tab-x" data-close-tab="${t.id}" title="Close tab (Alt+W)">${ic('x')}</button></div>`;
    }).join('');
    const at = el.querySelector('.tab.active'); if (at) at.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  $('#tabs').addEventListener('click', (e) => {
    const x = e.target.closest('[data-close-tab]'); if (x) { e.stopPropagation(); closeTab(+x.dataset.closeTab); return; }
    const t = e.target.closest('[data-tab]'); if (t) switchTab(+t.dataset.tab);
  });
  $('#tabs').addEventListener('auxclick', (e) => { const t = e.target.closest('[data-tab]'); if (t && e.button === 1) closeTab(+t.dataset.tab); });

  function curTab() { return tabs.find((x) => x.id === active); }
  function syncOmni() {
    const t = curTab(), o = $('#omni'), star = $('#omni-star');
    if (document.activeElement === o) return;
    if (!t) { o.value = ''; star.hidden = true; return; }
    if (t.kind === 'game') { o.value = GBY.get(t.gameId).name; star.hidden = false; star.classList.toggle('on', isFav(t.gameId)); star.title = isFav(t.gameId) ? 'Remove from favorites' : 'Add to favorites'; return; }
    star.hidden = true;
    o.value = !t.url ? '' : S.blankUrl ? 'about:blank' : t.url;
  }
  $('#omni').addEventListener('focus', () => { const t = curTab(); if (t && t.kind === 'web' && t.url) $('#omni').value = t.url; $('#omni').select(); });
  $('#omni').addEventListener('blur', () => setTimeout(syncOmni, 150));
  $('#omni-star').addEventListener('click', () => { const t = curTab(); if (t && t.gameId) toggleFav(t.gameId); });
  on('favs', syncOmni);

  /* progress bar */
  let pT;
  function startProgress() { const p = $('#progress'); clearTimeout(pT); p.style.transition = 'none'; p.style.opacity = '1'; p.style.width = '0'; requestAnimationFrame(() => { p.style.transition = 'width 3s cubic-bezier(.1,.7,.2,1)'; p.style.width = '80%'; }); }
  function stopProgress() { const p = $('#progress'); p.style.transition = 'width .2s'; p.style.width = '100%'; pT = setTimeout(() => { p.style.opacity = '0'; p.style.width = '0'; }, 300); }

  /* ───────── home ───────── */
  function greetingText() {
    const d = new Date(), h = d.getHours();
    const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late';
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !S.clock24 });
    const day = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    return `${part}. It's ${time} on ${day}.`;
  }
  function tickClocks() {
    const g = $('#greeting'); if (g) g.textContent = greetingText();
    emit('clock');
  }
  function renderHome() {
    const fr = $('#home-favs-row');
    fr.classList.toggle('is-empty', !favs.length);
    fr.innerHTML = favs.length ? favs.slice(0, 14).map((id) => gameCard(GBY.get(id))).join('')
      : `<div class="empty">${ic('star')}<span>Star any game in the library and it lands here. Try <button class="link" data-view="games">the games library</button>.</span></div>`;
    const r = recentIds().slice(0, 14);
    $('#home-recent').hidden = !r.length;
    $('#home-recent-row').innerHTML = r.map((id) => gameCard(GBY.get(id))).join('');
    $('#home-shortcuts').innerHTML = shortcuts().map((s) => `<a class="sc" href="${esc(s.url)}" data-nav="${esc(s.url)}" title="${esc(s.url)}"><span class="sc-ic"><img src="${fav(hostOf(s.url))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span><span class="sc-l">${esc(s.name)}</span><button class="sc-x" data-rm-sc="${esc(s.url)}" title="Remove shortcut">${ic('x')}</button></a>`).join('');
  }
  on('favs', () => { if (active === 'home') renderHome(); });
  on('plays', () => { if (active === 'home') renderHome(); });
  on('shortcuts', renderHome);
  bindSuggest($('#hero-input'), $('#hero-sugg'), (it) => { $('#hero-input').value = ''; pickSuggestion(it); });
  $('#hero-search').addEventListener('submit', (e) => e.preventDefault());
  bindSuggest($('#omni'), $('#omni-sugg'), pickSuggestion);

  /* ───────── movies ───────── */
  let moviesRoot = null;
  function mountMovies(host) {
    if (!moviesRoot) {
      moviesRoot = document.createElement('div'); moviesRoot.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;height:100%';
      const f = makeFrame('https://streamex.hn/'); f.className = 'movies-frame';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-presentation');
      moviesRoot.appendChild(f);
    }
    if (moviesRoot.parentNode !== host) host.appendChild(moviesRoot);
  }

  /* ───────── AI chat (deepseek-r1:7b on the owner's PC via Ollama) ───────── */
  const SYSTEM = 'You are Unity AI, a helpful assistant built into an ocean-themed start page. Be concise and direct.';
  let chats = store.get('chats', []), curChat = null;
  let aiStatus = { configured: false, online: false, model: 'deepseek-r1:7b' }, aiBusy = null, aiRoot = null;
  const saveChats = () => store.set('chats', chats.slice(0, 40));

  async function refreshAIStatus() {
    try { const r = await fetch('/ai/status', { signal: AbortSignal.timeout(8000) }); aiStatus = await r.json(); }
    catch { aiStatus = { configured: false, online: false, model: 'deepseek-r1:7b', unreachable: true }; }
    renderAITop(); return aiStatus;
  }
  function renderAITop() {
    if (!aiRoot) return;
    const st = aiStatus.online ? ['ok', 'Online'] : aiStatus.missingModel ? ['bad', 'Model not installed'] : ['bad', 'Offline'];
    $('.ai-top', aiRoot).innerHTML = `<b class="ai-title">Unity AI</b><span class="ai-badge" title="${esc(aiStatus.online ? 'Ready' : 'The AI computer is off or unreachable')}"><span class="dot ${st[0]}"></span>${esc(aiStatus.model || 'deepseek-r1:7b')}<span class="ai-state">${st[1]}</span></span>`;
  }
  function mountAI(host) {
    if (!aiRoot) buildAI();
    if (aiRoot.parentNode !== host) host.appendChild(aiRoot);
    refreshAIStatus();
    setTimeout(() => $('textarea', aiRoot).focus(), 50);
  }
  function buildAI() {
    aiRoot = document.createElement('div'); aiRoot.className = 'ai';
    aiRoot.innerHTML = `
      <aside class="ai-side"><button class="btn" data-ai-new>${ic('plus')}New chat</button><div class="ai-chats"></div></aside>
      <div class="ai-main">
        <div class="ai-top"></div>
        <div class="ai-msgs" aria-live="polite"></div>
        <form class="ai-input"><textarea rows="1" placeholder="Message Unity AI" aria-label="Message"></textarea><button class="btn primary" type="submit" title="Send (Enter)">${ic('send')}</button></form>
      </div>`;
    const ta = $('textarea', aiRoot), form = $('form', aiRoot);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', (e) => { e.preventDefault(); if (aiBusy) { aiBusy.abort(); return; } const v = ta.value.trim(); if (!v) return; ta.value = ''; ta.style.height = 'auto'; aiSend(v); });
    aiRoot.addEventListener('click', (e) => {
      if (e.target.closest('[data-ai-new]')) { curChat = null; renderChat(); ta.focus(); return; }
      const del = e.target.closest('[data-del-chat]'); if (del) { e.stopPropagation(); chats = chats.filter((c) => c.id !== del.dataset.delChat); if (curChat && curChat.id === del.dataset.delChat) curChat = null; saveChats(); renderChat(); return; }
      const c = e.target.closest('[data-chat]'); if (c) { curChat = chats.find((x) => x.id === c.dataset.chat) || null; renderChat(); return; }
      const p = e.target.closest('[data-prompt]'); if (p) { aiSend(p.dataset.prompt); return; }
      const cp = e.target.closest('[data-copy]'); if (cp) { const msg = curChat && curChat.msgs[+cp.dataset.copy]; if (msg) navigator.clipboard?.writeText(msg.content).then(() => toast('Copied'), () => toast('Copy blocked by the browser', 'x')); }
      const rg = e.target.closest('[data-regen]'); if (rg && curChat && !aiBusy) { const lastUser = [...curChat.msgs].reverse().find((m) => m.role === 'user'); curChat.msgs = curChat.msgs.slice(0, curChat.msgs.lastIndexOf(lastUser)); if (lastUser) aiSend(lastUser.content); }
    });
    renderChat(); renderAITop();
  }
  function md(src) {
    let s = esc(src);
    const blocks = [];
    s = s.replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_, code) => { blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const out = []; let list = null;
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of s.split('\n')) {
      let m;
      if ((m = line.match(/^\s*[-*•] (.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${m[1]}</li>`); continue; }
      if ((m = line.match(/^\s*\d+[.)] (.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${m[1]}</li>`); continue; }
      closeList();
      if ((m = line.match(/^#{1,4} (.*)/))) { out.push(`<h3>${m[1]}</h3>`); continue; }
      if (/^\u0000\d+\u0000$/.test(line.trim())) { out.push(line.trim()); continue; }
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
    closeList();
    return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
  }
  function splitThink(raw) {
    const open = raw.indexOf('<think>');
    if (open < 0) return { think: '', answer: raw, thinking: false };
    const close = raw.indexOf('</think>', open);
    if (close < 0) return { think: raw.slice(open + 7), answer: raw.slice(0, open), thinking: true };
    return { think: raw.slice(open + 7, close).trim(), answer: (raw.slice(0, open) + raw.slice(close + 8)).trim(), thinking: false };
  }
  function msgHTML(m, i, streaming) {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${md(m.content)}</div></div>`;
    const think = m.think ? `<details class="think"${streaming && m.thinking ? ' open' : ''}><summary>${streaming && m.thinking ? 'Thinking…' : 'Thought process'}</summary><div>${esc(m.think)}</div></details>` : '';
    const body = m.error ? `<span style="color:var(--danger)">${esc(m.error)}</span>` : md(m.content || '');
    const waiting = streaming && !m.think && !m.content ? '<span class="ai-wait">Waking up the model…</span>' : '';
    const caret = streaming && !m.thinking ? '<span class="caret"></span>' : '';
    const meta = !streaming ? `<div class="meta">${!m.error ? `<button class="icon-btn" data-copy="${i}" title="Copy">${ic('copy')}</button>` : ''}<button class="icon-btn" data-regen title="Try again">${ic('refresh')}</button><span>${m.stats && m.stats.tokens ? `${m.stats.tokens} tokens in ${(m.stats.ms / 1000).toFixed(1)}s` : ''}</span></div>` : '';
    return `<div class="msg bot"><div class="bubble">${think}${waiting}${body}${caret}</div>${meta}</div>`;
  }
  function renderChat(streamIdx) {
    if (!aiRoot) return;
    const list = $('.ai-chats', aiRoot), box = $('.ai-msgs', aiRoot);
    list.innerHTML = chats.map((c) => `<div class="ai-chat-item${curChat && c.id === curChat.id ? ' active' : ''}" data-chat="${c.id}"><span>${esc(c.title)}</span><button class="icon-btn" data-del-chat="${c.id}" title="Delete chat">${ic('trash')}</button></div>`).join('');
    if (!curChat || !curChat.msgs.length) {
      box.innerHTML = `<div class="ai-welcome"><h2>Ask anything.</h2><p>Unity AI thinks before it answers, so the first reply can take a few seconds.</p>
        <div class="ai-prompts">${['Explain how ocean caustics form', 'Help me study for a biology quiz', 'Write a short story about a lighthouse', 'Give me 5 tips for Retro Bowl'].map((p) => `<button data-prompt="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`;
      return;
    }
    box.innerHTML = curChat.msgs.map((m, i) => msgHTML(m, i, i === streamIdx)).join('');
    box.scrollTop = box.scrollHeight;
  }
  async function aiSend(text) {
    if (aiBusy) return;
    if (!curChat) { curChat = { id: uid(), title: text.slice(0, 48), msgs: [], t: Date.now() }; chats.unshift(curChat); }
    curChat.msgs.push({ role: 'user', content: text });
    const bot = { role: 'assistant', content: '', think: '', raw: '' };
    curChat.msgs.push(bot);
    const idx = curChat.msgs.length - 1;
    renderChat(idx);
    const msgs = [{ role: 'system', content: SYSTEM }, ...curChat.msgs.slice(0, -1).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))];
    const ctrl = new AbortController(); aiBusy = ctrl;
    const btn = $('form .btn.primary', aiRoot); btn.innerHTML = ic('stop'); btn.title = 'Stop';
    let thinkStream = '', finished = false, rafPending = false;
    const update = (force) => {
      if (finished && !force) return;
      const sp = splitThink(bot.raw || '');
      bot.think = (thinkStream + (sp.think ? (thinkStream ? '\n' : '') + sp.think : '')).trim();
      bot.content = sp.answer; bot.thinking = sp.thinking || (!!thinkStream && !sp.answer);
      const box = $('.ai-msgs', aiRoot), last = box.lastElementChild;
      if (last) { const tmp = document.createElement('div'); tmp.innerHTML = msgHTML(bot, idx, true); last.replaceWith(tmp.firstElementChild); }
      box.scrollTop = box.scrollHeight;
    };
    const schedule = () => { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; update(); }); } };
    try {
      const res = await fetch('/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }), signal: ctrl.signal });
      if (!res.body) throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.error) bot.error = j.error;
          if (j.k === 'think') thinkStream += j.d; else if (j.d) bot.raw += j.d;
          if (j.done && j.stats) bot.stats = j.stats;
          schedule();
        }
      }
      if (!bot.raw && !bot.error && !thinkStream) bot.error = 'No response. Try again.';
    } catch (e) {
      if (e.name === 'AbortError') { if (!bot.raw) bot.error = 'Stopped.'; }
      else bot.error = 'Network error. Check your connection and try again.';
    }
    update(true); finished = true;
    bot.thinking = false; delete bot.raw;
    if (bot.error) refreshAIStatus();
    aiBusy = null; btn.innerHTML = ic('send'); btn.title = 'Send (Enter)';
    curChat.t = Date.now(); saveChats(); renderChat();
  }

  /* ───────── settings dialog ───────── */
  const CLOAKS = [
    ['Google Classroom', 'Home', 'classroom.google.com'], ['Google Docs', 'Untitled document - Google Docs', 'docs.google.com'],
    ['Google Drive', 'My Drive - Google Drive', 'drive.google.com'], ['Canvas', 'Dashboard', 'instructure.com'],
    ['Khan Academy', 'Dashboard | Khan Academy', 'khanacademy.org'], ['Default', 'New Tab', ''],
  ];
  function openSettings(pane) {
    const dlg = $('#settings'); dlg.hidden = false;
    $('#theme-grid').innerHTML = Object.entries(THEMES).map(([k, t]) => `<button class="theme-card${S.theme === k ? ' on' : ''}" data-theme="${k}"><div class="sw" style="background:linear-gradient(180deg,${t.shallow},${t.deep} 75%,${t.sand})"><i style="background:${t.accent}"></i></div><b>${esc(t.name)}</b></button>`).join('');
    $('#cloak-presets').innerHTML = CLOAKS.map(([n, t, d]) => `<button data-cloak="${esc(t)}" data-cloak-icon="${d ? fav(d) : ''}">${d ? `<img src="${fav(d)}" alt="">` : ''}${esc(n)}</button>`).join('');
    $('#keys-list').innerHTML = KEYS.map(([k, d]) => `<dt>${k.split('+').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</dt><dd>${esc(d)}</dd>`).join('');
    $$('[data-setting]', dlg).forEach((el) => {
      const k = el.dataset.setting;
      if (el.classList.contains('switch')) el.classList.toggle('on', !!S[k]);
      else if (el.classList.contains('seg')) $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === S[k]));
      else el.value = S[k] || '';
    });
    if (pane) switchPane(pane);
  }
  function switchPane(p) { $$('.set-nav [data-pane]').forEach((b) => b.classList.toggle('active', b.dataset.pane === p)); $$('.set-body .pane').forEach((b) => b.classList.toggle('active', b.dataset.pane === p)); }
  $('#settings').addEventListener('click', (e) => {
    if (e.target.id === 'settings' || e.target.closest('[data-close]')) { $('#settings').hidden = true; return; }
    const nav = e.target.closest('.set-nav [data-pane]'); if (nav) { switchPane(nav.dataset.pane); return; }
    const sw = e.target.closest('.switch[data-setting]'); if (sw) { const k = sw.dataset.setting; setSetting(k, !S[k]); sw.classList.toggle('on', !!S[k]); return; }
    const seg = e.target.closest('.seg button'); if (seg) { const k = seg.parentNode.dataset.setting; setSetting(k, seg.dataset.v); $$('button', seg.parentNode).forEach((b) => b.classList.toggle('on', b === seg)); return; }
    const th = e.target.closest('[data-theme]'); if (th) { if (S.autoTheme) { setSetting('autoTheme', false); $('[data-setting="autoTheme"]').classList.remove('on'); } setSetting('theme', th.dataset.theme); $$('.theme-card').forEach((c) => c.classList.toggle('on', c === th)); return; }
    const ck = e.target.closest('[data-cloak]'); if (ck) { setSetting('cloakTitle', ck.dataset.cloak); setSetting('cloakIcon', ck.dataset.cloakIcon); $('[data-setting="cloakTitle"]').value = S.cloakTitle; $('[data-setting="cloakIcon"]').value = S.cloakIcon; toast('Tab disguise applied'); return; }
  });
  $$('#settings input[data-setting]').forEach((el) => el.addEventListener('change', () => {
    let v = el.value.trim(); if (el.dataset.setting === 'panicKey') v = (v || 'y').toLowerCase();
    setSetting(el.dataset.setting, v);
  }));

  /* data actions */
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'unity', v: 3, data: store.all() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'unity-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded', 'download');
  }
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); Object.entries(j.data || {}).forEach(([k, v]) => store.set(k, v)); toast('Backup restored. Reloading…'); setTimeout(() => location.reload(), 700); }
    catch { toast('That file is not a Unity backup', 'x'); }
  });

  /* ───────── command palette ───────── */
  let palItems = [], palSel = 0;
  function paletteSource() {
    const acts = [
      ['New tab', 'plus', () => mode === 'desktop' ? Desktop.openApp('browser') : newTab()],
      ['Home', 'home', () => showView('home')],
      ['Games library', 'gamepad', () => showView('games')],
      ['Favorite games', 'star', () => showView('games', { collection: 'favorites' })],
      ['Unity AI', 'sparkles', () => showView('ai')],
      ['Movies', 'film', () => showView('movies')],
      ['Play a random game', 'shuffle', randomGame],
      [mode === 'desktop' ? 'Switch to browser mode' : 'Switch to desktop mode', 'monitor', () => setMode(mode === 'desktop' ? 'browser' : 'desktop')],
      ['Settings', 'sliders', () => openSettings()],
      ['Toggle fullscreen', 'expand', toggleFullscreen],
      ['Console', 'terminal', toggleConsole],
      ['Panic', 'zap', panic],
    ];
    if (mode === 'desktop') acts.push(['Notes', 'note', () => Desktop.openApp('notes')], ['Calculator', 'calc', () => Desktop.openApp('calc')], ['Terminal', 'terminal', () => Desktop.openApp('terminal')]);
    const items = acts.map(([label, icon, run]) => ({ group: 'Actions', label, icon, run }));
    GAMES.forEach((g) => items.push({ group: 'Games', label: g.name, g, sub: isFav(g.id) ? '★ ' + g.cat : g.cat, run: () => play(g.id) }));
    Object.entries(THEMES).forEach(([k, t]) => items.push({ group: 'Themes', label: `Theme: ${t.name}`, icon: 'drop', run: () => { setSetting('theme', k); toast(`${t.name} theme`); } }));
    ['low', 'medium', 'high', 'ultra'].forEach((q) => items.push({ group: 'Ocean', label: `Water quality: ${q}`, icon: 'drop', run: () => { setSetting('quality', q); toast(`Water quality set to ${q}`); } }));
    shortcuts().forEach((s) => items.push({ group: 'Shortcuts', label: s.name, fav: hostOf(s.url), sub: hostOf(s.url), run: () => navigate(s.url) }));
    return items;
  }
  function fuzzy(q, s) {
    q = q.toLowerCase(); s = s.toLowerCase();
    if (!q) return 1; const i = s.indexOf(q); if (i >= 0) return 100 - i;
    let j = 0, score = 0; for (const c of s) { if (c === q[j]) { j++; score += 2; } if (j === q.length) return score; } return 0;
  }
  function renderPalette() {
    const q = $('#pal-input').value.trim();
    const src = paletteSource();
    let list = src.map((it) => ({ it, s: fuzzy(q, it.label) })).filter((x) => x.s > 0);
    if (q) list.sort((a, b) => b.s - a.s); else list = list.filter((x) => x.it.group === 'Actions' || (x.it.g && isFav(x.it.g.id)));
    palItems = list.slice(0, 40).map((x) => x.it);
    if (q && resolveInput(q)) palItems.push({ group: 'Web', label: `Go to “${q}”`, icon: 'globe', run: () => navigate(resolveInput(q)) });
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    let lastG = '';
    $('#pal-list').innerHTML = palItems.map((it, i) => {
      const head = it.group !== lastG ? `<div class="pal-group">${esc(it.group)}</div>` : ''; lastG = it.group;
      const icon = it.g ? `<span class="si-ic" style="${artVars(it.g)};background:var(--art-bg);color:var(--art-fg)">${esc(letters(it.g.name).slice(0, 2))}</span>` : it.fav ? `<span class="si-ic" style="background:#fff"><img src="${fav(it.fav)}" width="16" height="16" alt=""></span>` : `<span class="si-ic">${ic(it.icon || 'right')}</span>`;
      return `${head}<div class="sugg-item${i === palSel ? ' sel' : ''}" data-i="${i}" role="option">${icon}<span class="si-t">${esc(it.label)}</span><span class="si-k">${esc(it.sub || '')}</span></div>`;
    }).join('') || `<div class="pal-group">Nothing found</div>`;
    const sel = $('#pal-list .sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() { $('#palette').hidden = false; $('#pal-input').value = ''; palSel = 0; renderPalette(); $('#pal-input').focus(); }
  function closePalette() { $('#palette').hidden = true; }
  $('#pal-input').addEventListener('input', () => { palSel = 0; renderPalette(); });
  $('#pal-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palSel]; closePalette(); if (it) it.run(); }
    else if (e.key === 'Escape') closePalette();
  });
  $('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') return closePalette(); const el = e.target.closest('[data-i]'); if (el) { const it = palItems[+el.dataset.i]; closePalette(); it && it.run(); } });

  /* ───────── console ───────── */
  function conLog(type, msg) { const out = $('#con-out'), el = document.createElement('div'); el.className = type; el.textContent = msg; out.appendChild(el); out.scrollTop = out.scrollHeight; }
  function hookConsole(frame) {
    try {
      const cw = frame.contentWindow; if (!cw || cw.__uh) return; cw.__uh = true;
      ['log', 'warn', 'error', 'info'].forEach((m) => { const o = cw.console[m].bind(cw.console); cw.console[m] = (...a) => { o(...a); conLog(m === 'error' ? 'err' : m === 'warn' ? 'warn' : '', a.map((x) => { try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch { return String(x); } }).join(' ')); }; });
    } catch {}
  }
  function toggleConsole() { const c = $('#console'); c.hidden = !c.hidden; if (!c.hidden) $('#con-input').focus(); }
  $('#con-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return; const cmd = e.target.value.trim(); if (!cmd) return;
    conLog('cmd', '› ' + cmd); e.target.value = '';
    try {
      let r, t = curTab();
      try { if (t && t.frame) r = t.frame.contentWindow.eval(cmd); else throw 0; } catch { r = (0, eval)(cmd); }
      if (r !== undefined) conLog('', typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r));
    } catch (err) { conLog('err', err.message); }
  });
  conLog('sys', 'Unity console ready.');

  /* ───────── panic, fullscreen, random ───────── */
  function panic() {
    $('#panic-frame').src = S.panicUrl || 'https://classroom.google.com';
    $('#panic-screen').hidden = false;
    try { history.replaceState(null, '', '/'); } catch {}
    applyCloak();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const t = mode === 'browser' && curTab();
    const el = t && t.frame ? $('#frame-host') : document.documentElement;
    el.requestFullscreen && el.requestFullscreen().catch(() => toast('Fullscreen was blocked', 'x'));
  }
  function randomGame() { const g = GAMES[Math.floor(Math.random() * GAMES.length)]; if (g) { toast(`Rolling the dice: ${g.name}`, 'shuffle'); play(g.id); } }

  /* ───────── add-a-game dialog + card menu ───────── */
  function openGameDialog() {
    const sel = $('#game-form [name=cat]');
    const cats = [...new Set(['My games', ...GAMES.map((g) => g.cat)])];
    sel.innerHTML = cats.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#game-dlg').hidden = false; setTimeout(() => $('#game-form [name=name]').focus(), 20);
  }
  $('#game-dlg').addEventListener('click', (e) => { if (e.target.id === 'game-dlg' || e.target.closest('[data-close]')) $('#game-dlg').hidden = true; });
  $('#game-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target, n = f.name.value.trim(), u = resolveInput(f.url.value);
    if (!n || !u) return; addCustomGame(n, u, f.cat.value); f.reset(); $('#game-dlg').hidden = true;
  });
  function showMenu(x, y, items) {
    const m = $('#ctx-menu');
    m.innerHTML = items.map((it, i) => (it ? `<button data-mi="${i}">${ic(it[1])}${esc(it[0])}</button>` : '<hr>')).join('');
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    m.onclick = (e) => { const b = e.target.closest('[data-mi]'); if (!b) return; m.hidden = true; items[+b.dataset.mi][2](); };
  }
  document.addEventListener('pointerdown', (e) => { if (!$('#ctx-menu').hidden && !e.target.closest('#ctx-menu')) $('#ctx-menu').hidden = true; });
  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.gcard[data-play]'); if (!card) return;
    e.preventDefault();
    const id = card.dataset.play, g = GBY.get(id); if (!g) return;
    const items = [['Play', 'play', () => play(id, card.closest('#desktop') ? 'desktop' : null)], [isFav(id) ? 'Remove from favorites' : 'Add to favorites', 'star', () => toggleFav(id)], ['Copy link', 'copy', () => navigator.clipboard?.writeText(g.url).then(() => toast('Link copied'))]];
    if (g.custom) items.push(null, ['Remove from library', 'trash', () => removeCustomGame(id)]);
    showMenu(e.clientX, e.clientY, items);
  });

  /* ───────── accounts + sync ───────── */
  const SYNC_KEYS = ['settings', 'favs', 'plays', 'shortcuts', 'hiddenBuiltins', 'notes', 'chats', 'libSort', 'customGames'];
  let acct = store.get('account', null), syncT = null, syncing = false, syncErr = '', lastSync = store.get('syncAt', 0), acctMode = 'login';
  async function api(path, opts = {}) {
    const r = await fetch('/api/account' + path, { method: opts.method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, acct ? { Authorization: 'Bearer ' + acct.token } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { if (r.status === 401 && acct && !/login|signup/.test(path)) signedOut(); throw new Error(j.error || 'Something went wrong (' + r.status + ').'); }
    return j;
  }
  const collect = () => { const d = {}; SYNC_KEYS.forEach((k) => { const v = store.get(k); if (v !== undefined) d[k] = v; }); return d; };
  async function pushSync() {
    if (!acct) return; syncing = true; renderAcct();
    try { const r = await api('/data', { method: 'PUT', body: { data: collect() } }); lastSync = r.updatedAt; localStorage.setItem('u3.syncAt', JSON.stringify(lastSync)); syncErr = ''; }
    catch (e) { syncErr = e.message; }
    syncing = false; renderAcct();
  }
  store.onChange = (k) => { if (acct && SYNC_KEYS.includes(k)) { clearTimeout(syncT); syncT = setTimeout(pushSync, 1500); } };
  function applyRemote(r) {
    SYNC_KEYS.forEach((k) => { try { if (r.data[k] !== undefined) localStorage.setItem('u3.' + k, JSON.stringify(r.data[k])); } catch {} });
    localStorage.setItem('u3.syncAt', JSON.stringify(r.updatedAt));
    try { sessionStorage.setItem('u3.synced', String(r.updatedAt)); } catch {}
    location.reload();
  }
  async function pullSync() {
    if (!acct) return;
    try {
      const r = await api('/data');
      let guard = ''; try { guard = sessionStorage.getItem('u3.synced'); } catch {}
      if (r.data && r.updatedAt > lastSync && guard !== String(r.updatedAt)) return applyRemote(r);
      if (!r.data) pushSync();
      renderAcct();
    } catch (e) { syncErr = e.message; renderAcct(); }
  }
  function signedOut() { acct = null; store.del('account'); renderAcct(); toast('You were signed out. Sign in again to keep syncing.', 'user'); }
  const avatarHTML = (name) => { if (!name) return ic('user'); let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `<span style="background:hsl(${h} 55% 45%)">${esc(name[0].toUpperCase())}</span>`; };
  function renderAcct() {
    const name = acct && acct.username;
    $('#acct-btn').innerHTML = avatarHTML(name); $('#acct-btn').title = name ? `Signed in as ${name}` : 'Sign in';
    $('#acct-btn').classList.toggle('in', !!name);
    $('#sm-avatar').innerHTML = avatarHTML(name); $('#sm-username').textContent = name || 'Sign in';
    $('#acct-out').hidden = !!name; $('#acct-in').hidden = !name;
    if (name) {
      $('#acct-avatar-big').innerHTML = avatarHTML(name); $('#acct-name').textContent = name;
      $('#acct-sync').textContent = syncing ? 'Syncing…' : syncErr ? syncErr : lastSync ? `Synced ${timeAgo(lastSync)}` : 'Not synced yet';
    }
    const hint = $('#data-acct-hint'), b = $('#data-acct-btn');
    if (hint) { hint.textContent = name ? `Signed in as ${name}. Changes sync automatically.` : 'Sign in to keep your favorites, settings, shortcuts, notes, chats and added games on every device.'; b.textContent = name ? 'Manage account' : 'Sign in or create an account'; }
  }
  function openAccount() {
    $('#account-dlg').hidden = false; $('#acct-err').hidden = $('#acct-err2').hidden = true; $('#pw-form').hidden = true; renderAcct();
    if (!acct) setTimeout(() => $('#acct-form [name=username]').focus(), 20);
  }
  function setAcctMode(m) {
    acctMode = m; $$('.acct-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#acct-title').textContent = m === 'login' ? 'Sign in to Unity' : 'Create your Unity account';
    $('#acct-submit').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('#acct-form [name=password]').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  }
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = !msg; };
  $('#account-dlg').addEventListener('click', async (e) => {
    if (e.target.id === 'account-dlg' || e.target.closest('[data-close]')) { $('#account-dlg').hidden = true; return; }
    const m = e.target.closest('[data-mode]'); if (m) { setAcctMode(m.dataset.mode); return; }
    const a = e.target.closest('[data-acct]'); if (!a) return;
    if (a.dataset.acct === 'sync') { await pushSync(); if (!syncErr) toast('Synced'); }
    if (a.dataset.acct === 'password') { $('#pw-form').hidden = !$('#pw-form').hidden; }
    if (a.dataset.acct === 'logout') { try { await api('/logout', { method: 'POST' }); } catch {} acct = null; store.del('account'); renderAcct(); toast('Signed out. Your data stays in this browser.', 'user'); }
  });
  $('#acct-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; showErr($('#acct-err'), '');
    $('#acct-submit').disabled = true;
    try {
      const r = await api('/' + acctMode, { method: 'POST', body: { username: f.username.value, password: f.password.value } });
      acct = { token: r.token, username: r.username }; store.set('account', acct); f.reset();
      const d = await api('/data');
      if (d.data && acctMode === 'login') { toast(`Welcome back, ${r.username}. Loading your stuff…`, 'user'); return applyRemote(d); }
      await pushSync(); renderAcct(); toast(acctMode === 'login' ? `Signed in as ${r.username}` : `Account created. Everything here now syncs.`, 'user');
    } catch (err) { showErr($('#acct-err'), err.message); }
    $('#acct-submit').disabled = false;
  });
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api('/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); f.reset(); f.hidden = true; toast('Password changed'); showErr($('#acct-err2'), ''); }
    catch (err) { showErr($('#acct-err2'), err.message); }
  });
  $('#del-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if (!confirm('Delete your Unity account and its synced data? This browser keeps its local copy.')) return;
    try { await api('/delete', { method: 'POST', body: { password: e.target.password.value } }); acct = null; store.del('account'); renderAcct(); $('#account-dlg').hidden = true; toast('Account deleted', 'trash'); }
    catch (err) { showErr($('#acct-err2'), err.message); }
  });
  setInterval(() => { if (acct && !$('#account-dlg').hidden) renderAcct(); }, 30000);

  /* ───────── ocean visibility ───────── */
  let oceanCovered = false;
  function updateOcean() {
    if (mode === 'browser') oceanCovered = active !== 'home';
    else oceanCovered = window.Desktop ? Desktop.covered() : false;
    Water.setPaused(S.reduceMotion || (S.pauseBehind && oceanCovered));
  }

  /* ───────── global clicks / keys ───────── */
  const ACTS = {
    home: () => showView('home'), newtab: () => newTab(), account: openAccount, 'show-desktop': () => window.Desktop && Desktop.showDesktop(), back: navBack, forward: navForward, reload: navReload,
    fullscreen: toggleFullscreen, palette: openPalette, console: toggleConsole, settings: () => openSettings(), panic,
    desktop: () => setMode('desktop'), 'browser-mode': () => setMode('browser'),
    'add-shortcut': () => { $('#shortcut-dlg').hidden = false; setTimeout(() => $('#shortcut-form [name=name]').focus(), 20); },
    export: exportData, import: () => $('#import-file').click(),
    'clear-history': () => { plays = {}; store.set('plays', plays); hist = []; store.set('history', hist); emit('plays'); toast('Play history cleared', 'trash'); },
    'clear-chats': () => { chats = []; curChat = null; saveChats(); renderChat(); toast('AI chats cleared', 'trash'); },
    'reset-all': () => { if (!confirm('Reset all Unity data in this browser? Favorites, shortcuts, notes and chats will be deleted.')) return; Object.keys(store.all()).forEach((k) => store.del(k)); location.reload(); },
  };
  function navBack() { const t = curTab(); if (!t || !t.bk.length) return; t.fw.push(t.url); t.url = t.bk.pop(); t.frame.src = t.url; startProgress(); syncOmni(); }
  function navForward() { const t = curTab(); if (!t || !t.fw.length) return; t.bk.push(t.url); t.url = t.fw.pop(); t.frame.src = t.url; startProgress(); syncOmni(); }
  function navReload() { const t = curTab(); if (!t || !t.frame) return; startProgress(); try { t.frame.contentWindow.location.reload(); } catch { t.frame.src = t.frame.src; } }

  document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]'); if (favBtn) { e.preventDefault(); e.stopPropagation(); toggleFav(favBtn.dataset.fav); return; }
    const rm = e.target.closest('[data-rm-sc]'); if (rm) { e.preventDefault(); e.stopPropagation(); removeShortcut(rm.dataset.rmSc); return; }
    const pl = e.target.closest('[data-play]'); if (pl) { const ctx = pl.closest('#desktop') ? 'desktop' : null; play(pl.dataset.play, ctx); return; }
    const nv = e.target.closest('[data-nav]'); if (nv) { e.preventDefault(); navigate(nv.dataset.nav); return; }
    const v = e.target.closest('[data-view]'); if (v && !v.closest('#desktop')) { showView(v.dataset.view, { collection: v.dataset.collection }); return; }
    const a = e.target.closest('[data-act]'); if (a && ACTS[a.dataset.act]) { ACTS[a.dataset.act](); return; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.gcard')) e.target.click(); });
  $('#shortcut-dlg').addEventListener('click', (e) => { if (e.target.id === 'shortcut-dlg' || e.target.closest('[data-close]')) $('#shortcut-dlg').hidden = true; });
  $('#shortcut-form').addEventListener('submit', (e) => {
    e.preventDefault(); const f = e.target, n = f.name.value.trim(), u = resolveInput(f.url.value);
    if (!n || !u) return; addShortcut(n, u); f.reset(); $('#shortcut-dlg').hidden = true;
  });

  /* water ripples on background clicks */
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (t === document.body || t.id === 'water' || t.hasAttribute('data-bg') || t.id === 'shell' || t.id === 'stage') Water.click(e.clientX, e.clientY);
  });

  const KEYS = [
    ['Ctrl+K', 'Command palette: games, actions, themes'], ['/', 'Focus search'], ['Alt+T', 'New tab'], ['Alt+W', 'Close tab or window'],
    ['Alt+H', 'Home'], ['Alt+G', 'Games library'], ['Alt+A', 'Unity AI'], ['Alt+R', 'Random game'], ['Alt+D', 'Toggle desktop mode'],
    ['Alt+F', 'Fullscreen'], ['Alt+1…9', 'Jump to a tab'], ['Alt+S', 'Start menu (desktop)'], ['Alt+Y', 'Panic (key can be changed)'], ['Esc', 'Close dialogs and the panic page'],
  ];
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
    if (e.key === 'Escape') {
      if (!$('#panic-screen').hidden) { $('#panic-screen').hidden = true; $('#panic-frame').src = 'about:blank'; return; }
      if (!$('#palette').hidden) return closePalette();
      if (!$('#settings').hidden) { $('#settings').hidden = true; return; }
      if (!$('#shortcut-dlg').hidden) { $('#shortcut-dlg').hidden = true; return; }
      for (const id of ['#account-dlg', '#game-dlg']) if (!$(id).hidden) { $(id).hidden = true; return; }
      if (!$('#ctx-menu').hidden) { $('#ctx-menu').hidden = true; return; }
      if (!$('#console').hidden) { $('#console').hidden = true; return; }
      if (window.Desktop && mode === 'desktop') Desktop.escape();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase(), code = (e.code || '').replace(/^Key|^Digit/, '').toLowerCase();
      const key = /^[a-z0-9]$/.test(code) ? code : k;
      if (key === (S.panicKey || 'y')) { e.preventDefault(); panic(); return; }
      const map = {
        t: () => (mode === 'desktop' ? Desktop.openApp('browser') : newTab()),
        w: () => (mode === 'desktop' ? Desktop.closeFocused() : typeof active === 'number' && closeTab(active)),
        h: () => showView('home'), g: () => showView('games'), a: () => showView('ai'), r: randomGame,
        d: () => setMode(mode === 'desktop' ? 'browser' : 'desktop'), f: toggleFullscreen,
        s: () => mode === 'desktop' && Desktop.toggleStart(),
      };
      if (map[key]) { e.preventDefault(); map[key](); return; }
      if (/^[1-9]$/.test(key) && mode === 'browser') { const t = tabs[+key - 1]; if (t) { e.preventDefault(); switchTab(t.id); } return; }
    }
    if (!typing && e.key === '/' ) {
      e.preventDefault();
      if (mode === 'desktop') { Desktop.toggleStart(true); return; }
      if (active === 'home') $('#hero-input').focus();
      else if (active === 'games' && libBrowser) libBrowser.focus();
      else $('#omni').focus();
    }
  });

  /* ───────── boot ───────── */
  hydrateIcons();
  Water.init($('#water'), $('#life'));
  applyTheme();
  ['quality', 'density', 'ocean', 'fish', 'bubbles', 'kelp', 'fps', 'reduceMotion', 'cloakTitle'].forEach(applySetting);
  renderHome(); renderTabs(); tickClocks();
  setInterval(tickClocks, 15000);
  setInterval(() => { if (S.autoTheme && themeKey() !== appliedTheme) applyTheme(); }, 60000);
  renderAcct(); pullSync();

  window.Unity = {
    $, $$, esc, ic, hydrateIcons, bus, on, emit, store, S, setSetting, THEMES, toast,
    GAMES, GBY, isFav, toggleFav, recordPlay, recentIds, artVars, letters, gameCard, Library, favs: () => favs,
    shortcuts, hostOf, showMenu, openAccount, openGameDialog, removeCustomGame, favicon: fav, resolveInput, isAd, navigate, play, addHistory, suggest, suggIcon, bindSuggest, pickSuggestion,
    mountAI, mountMovies, makeFrame, openSettings, openPalette, panic, setMode, get mode() { return mode; }, updateOcean, randomGame, toggleFullscreen,
    greetingText,
  };
  if (S.startDesktop) setTimeout(() => setMode('desktop'), 0);
})();
