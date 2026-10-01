/* Unity — desktop mode: an OS-style shell over the ocean.
   Draggable / resizable / snappable windows, taskbar with pinned apps, start menu,
   desktop icons, widgets, right-click menu, and small built-in apps. */
(function () {
  'use strict';
  const U = window.Unity; if (!U) return;
  const { $, $$, esc, ic } = U;

  const TILE = {
    browser: 'linear-gradient(140deg,#35c3d1,#1a5f8f)', games: 'linear-gradient(140deg,#f6cf7a,#d97a2b)', ai: 'linear-gradient(140deg,#a596ff,#5340d0)',
    movies: 'linear-gradient(140deg,#ff8f7e,#b8344f)', notes: 'linear-gradient(140deg,#ffe07a,#e3a52a)', calc: 'linear-gradient(140deg,#7b8fa1,#3c4c5c)',
    terminal: 'linear-gradient(140deg,#3a4a52,#0c1418)', timer: 'linear-gradient(140deg,#7ee0b0,#2a9d78)', settings: 'linear-gradient(140deg,#9fb3c2,#4d6273)',
  };
  const APPS = {
    browser: { name: 'Browser', icon: 'browser', size: [1060, 680] },
    games: { name: 'Games', icon: 'gamepad', size: [1000, 660], single: true },
    ai: { name: 'Unity AI', icon: 'sparkles', size: [880, 640], single: true },
    movies: { name: 'Movies', icon: 'film', size: [1000, 620], single: true },
    notes: { name: 'Notes', icon: 'note', size: [640, 460], single: true },
    calc: { name: 'Calculator', icon: 'calc', size: [300, 440] },
    terminal: { name: 'Terminal', icon: 'terminal', size: [660, 420] },
    timer: { name: 'Timer', icon: 'clock', size: [360, 400] },
    settings: { name: 'Settings', icon: 'sliders', launch: () => U.openSettings() },
  };
  const PINNED = ['browser', 'games', 'ai', 'notes', 'terminal'];

  let wins = [], wid = 0, zTop = 10, focused = null, entered = false;
  const host = () => $('#windows');
  const area = () => { const r = host().getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const appIcon = (key, small) => {
    const g = key.startsWith('game:') && U.GBY.get(key.slice(5));
    if (g) return `<span class="${small ? 't-ic' : 'di'}" style="${U.artVars(g)};--tile:var(--art-bg);color:var(--art-fg)"><span class="dl">${esc(U.letters(g.name).slice(0, 2))}</span>${!small && U.isFav(g.id) ? `<span class="badge">${ic('star')}</span>` : ''}</span>`;
    const a = APPS[key];
    return `<span class="${small ? 't-ic' : 'di'}" style="--tile:${TILE[key]}">${ic(a.icon)}</span>`;
  };

  /* ───────── window manager ───────── */
  function createWin({ app, title, size, gameId, cls }) {
    const A = area(), id = ++wid;
    let [w, h] = size || [800, 560];
    w = Math.min(w, A.w - 24); h = Math.min(h, A.h - 24);
    const n = wins.filter((x) => !x.min).length % 8;
    const x = Math.max(8, Math.min(A.w - w - 8, 96 + n * 30 + (A.w > 1200 ? 120 : 0)));
    const y = Math.max(8, Math.min(A.h - h - 8, 24 + n * 30));
    const el = document.createElement('div');
    el.className = 'win' + (cls ? ' ' + cls : '');
    const iconKey = gameId ? 'game:' + gameId : app;
    el.innerHTML = `<div class="titlebar">${appIcon(iconKey, true)}<span class="t-title"></span><div class="t-btns">
      ${gameId ? `<button class="fav" data-w="fav" title="Favorite">${ic('star')}</button><button data-w="full" title="Fullscreen">${ic('expand')}</button><button data-w="reload" title="Reload">${ic('reload')}</button>` : ''}
      <button data-w="min" title="Minimize">${ic('minus')}</button><button data-w="max" title="Maximize">${ic('square')}</button><button class="close" data-w="close" title="Close (Alt+W)">${ic('x')}</button></div></div>
      <div class="win-body${gameId ? ' game' : ''}"><div class="shield"></div></div>
      ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<div class="rz ${d}" data-rz="${d}"></div>`).join('')}`;
    const W = { id, app, gameId, el, body: $('.win-body', el), x, y, w, h, max: false, min: false, prev: null, onClose: null, title: '' };
    place(W); host().appendChild(el); wins.push(W);
    setTitle(W, title || APPS[app].name);
    if (gameId) syncFav(W);
    bindWin(W);
    if (A.w < 700) toggleMax(W, true);
    focusWin(W);
    return W;
  }
  function place(W) { Object.assign(W.el.style, { left: W.x + 'px', top: W.y + 'px', width: W.w + 'px', height: W.h + 'px' }); }
  function setTitle(W, t) { W.title = t; $('.t-title', W.el).textContent = t; renderTaskbar(); }
  function syncFav(W) { const b = $('[data-w="fav"]', W.el); if (b) { const on = U.isFav(W.gameId); b.classList.toggle('on', on); b.title = on ? 'Remove from favorites' : 'Add to favorites'; } }
  function focusWin(W) {
    if (!W) return;
    if (W.min) { W.min = false; W.el.classList.remove('minimized'); }
    W.el.style.zIndex = ++zTop; focused = W;
    wins.forEach((x) => x.el.classList.toggle('focused', x === W));
    renderTaskbar(); U.updateOcean();
  }
  function minimize(W) { W.min = true; W.el.classList.add('minimized'); if (focused === W) { focused = null; const next = [...wins].filter((x) => !x.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (next) focusWin(next); } renderTaskbar(); U.updateOcean(); }
  function toggleMax(W, force) {
    const to = force != null ? force : !W.max;
    if (to && !W.max) { W.prev = { x: W.x, y: W.y, w: W.w, h: W.h }; W.max = true; W.el.classList.add('max'); }
    else if (!to && W.max) { W.max = false; W.el.classList.remove('max'); Object.assign(W, W.prev || {}); place(W); }
    const b = $('[data-w="max"]', W.el); if (b) { b.innerHTML = ic(W.max ? 'restore' : 'square'); b.title = W.max ? 'Restore' : 'Maximize'; }
    U.updateOcean();
  }
  function closeWin(W) {
    if (W.onClose) try { W.onClose(); } catch {}
    W.el.classList.add('closing');
    $$('iframe', W.el).forEach((f) => { f.src = 'about:blank'; });
    setTimeout(() => W.el.remove(), 140);
    wins = wins.filter((x) => x !== W);
    if (focused === W) { focused = null; const next = [...wins].filter((x) => !x.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (next) focusWin(next); }
    renderTaskbar(); U.updateOcean();
  }
  function bindWin(W) {
    const tb = $('.titlebar', W.el), ghost = $('#snap-ghost');
    W.el.addEventListener('pointerdown', () => { if (focused !== W) focusWin(W); }, true);
    tb.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMax(W); });
    $('.t-btns', W.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      const act = b.dataset.w;
      if (act === 'close') closeWin(W); else if (act === 'min') minimize(W); else if (act === 'max') toggleMax(W);
      else if (act === 'fav') U.toggleFav(W.gameId);
      else if (act === 'full') { const f = $('iframe', W.el); (f || W.el).requestFullscreen?.().catch(() => U.toast('Fullscreen was blocked', 'x')); }
      else if (act === 'reload') { const f = $('iframe', W.el); if (f) { try { f.contentWindow.location.reload(); } catch { f.src = f.src; } } }
    });
    tb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      const A = area(), sx = e.clientX, sy = e.clientY;
      let ox = W.x, oy = W.y, snap = null, moved = false;
      const hostRect = host().getBoundingClientRect();
      document.body.classList.add('dragging');
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved && W.max) { // pull a maximized window out under the pointer
          const ratio = (sx - hostRect.left) / A.w; toggleMax(W, false);
          ox = Math.round(sx - hostRect.left - W.w * ratio); oy = 0;
        }
        moved = true;
        W.x = Math.round(Math.min(A.w - 80, Math.max(-W.w + 120, ox + dx)));
        W.y = Math.round(Math.min(A.h - 40, Math.max(0, oy + dy)));
        place(W);
        const px = ev.clientX - hostRect.left, py = ev.clientY - hostRect.top;
        snap = py <= 4 ? 'max' : px <= 4 ? 'left' : px >= A.w - 4 ? 'right' : null;
        if (snap) {
          ghost.hidden = false;
          const r = snap === 'max' ? [6, 6, A.w - 12, A.h - 12] : snap === 'left' ? [6, 6, A.w / 2 - 9, A.h - 12] : [A.w / 2 + 3, 6, A.w / 2 - 9, A.h - 12];
          Object.assign(ghost.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px', zIndex: zTop - 1 });
          ghost.style.top = (r[1] + hostRect.top) + 'px'; ghost.style.left = (r[0] + hostRect.left) + 'px'; ghost.style.position = 'fixed';
        } else ghost.hidden = true;
      };
      const up = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        document.body.classList.remove('dragging'); ghost.hidden = true;
        if (snap === 'max') toggleMax(W, true);
        else if (snap) { W.prev = W.prev || { x: W.x, y: W.y, w: W.w, h: W.h }; W.x = snap === 'left' ? 0 : Math.round(A.w / 2); W.y = 0; W.w = Math.round(A.w / 2); W.h = A.h; place(W); }
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    $$('.rz', W.el).forEach((hd) => hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const d = hd.dataset.rz, sx = e.clientX, sy = e.clientY, o = { x: W.x, y: W.y, w: W.w, h: W.h };
      const MINW = 300, MINH = 200;
      document.body.classList.add('dragging');
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (d.includes('e')) W.w = Math.max(MINW, o.w + dx);
        if (d.includes('s')) W.h = Math.max(MINH, o.h + dy);
        if (d.includes('w')) { W.w = Math.max(MINW, o.w - dx); W.x = o.x + (o.w - W.w); }
        if (d.includes('n')) { W.h = Math.max(MINH, o.h - dy); W.y = Math.max(0, o.y + (o.h - W.h)); }
        place(W);
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    }));
  }
  // clicks inside iframes don't bubble — detect focus moving into one
  window.addEventListener('blur', () => setTimeout(() => {
    const a = document.activeElement; if (!a || a.tagName !== 'IFRAME') return;
    const el = a.closest('.win'); const W = el && wins.find((x) => x.el === el); if (W && focused !== W) focusWin(W);
  }, 0));
  U.on('favs', () => { wins.forEach((W) => W.gameId && syncFav(W)); if (entered) { renderIcons(); renderWidgets(); } });

  /* ───────── apps ───────── */
  function single(app) { const W = wins.find((x) => x.app === app); if (W) { focusWin(W); return W; } return null; }
  function openApp(app, opts = {}) {
    const A = APPS[app]; if (!A) return;
    if (A.launch) { A.launch(); return; }
    if (A.single) { const W = single(app); if (W) { if (app === 'games' && opts.collection && W.lib) W.lib.setCollection(opts.collection); return W; } }
    switch (app) {
      case 'browser': return openBrowser(opts.url);
      case 'games': { const W = createWin({ app, size: A.size }); const p = document.createElement('div'); p.className = 'panel'; W.body.appendChild(p); W.lib = U.Library(p, { ctx: 'desktop', collection: opts.collection }); return W; }
      case 'ai': { const W = createWin({ app, size: A.size }); const p = document.createElement('div'); p.className = 'panel'; W.body.appendChild(p); U.mountAI(p); W.onClose = () => { const n = $('.ai', p); if (n) $('#ai-home').appendChild(n); }; return W; }
      case 'movies': { const W = createWin({ app, size: A.size, cls: 'game' }); const p = document.createElement('div'); p.className = 'panel panel-flush'; W.body.appendChild(p); U.mountMovies(p); W.onClose = () => { const n = p.firstElementChild; if (n) $('#movies-home').appendChild(n); }; return W; }
      case 'notes': return openNotes();
      case 'calc': return openCalc();
      case 'terminal': return openTerminal();
      case 'timer': return openTimer();
    }
  }

  function openBrowser(url) {
    if (url && focused && focused.app === 'browser' && !focused.min && focused.nav) { focused.nav(url); return focused; }
    const W = createWin({ app: 'browser', size: APPS.browser.size });
    W.body.insertAdjacentHTML('beforeend', `<div class="mb-bar">
      <button class="icon-btn" data-b="back" title="Back">${ic('left')}</button><button class="icon-btn" data-b="fwd" title="Forward">${ic('right')}</button><button class="icon-btn" data-b="reload" title="Reload">${ic('reload')}</button>
      <div style="position:relative;flex:1;display:flex"><input placeholder="Search or type an address" spellcheck="false" autocomplete="off"><div class="sugg" hidden></div></div>
      <button class="icon-btn" data-b="tab" title="Open in browser mode">${ic('external')}</button></div>
      <div class="mb-home"><div><h3>New tab</h3><p>Type an address or search above.</p></div></div>`);
    const input = $('.mb-bar input', W.body), home = $('.mb-home', W.body);
    const st = { url: '', bk: [], fw: [], frame: null };
    const show = (u) => {
      if (!st.frame) { st.frame = U.makeFrame(u); W.body.appendChild(st.frame); home.remove(); } else st.frame.src = u;
      st.url = u; input.value = U.S.blankUrl ? 'about:blank' : u; setTitle(W, U.hostOf(u)); U.addHistory(u);
    };
    W.nav = (u) => { if (U.isAd(u)) { U.toast('Blocked an ad domain', 'x'); return; } if (st.url) st.bk.push(st.url); st.fw = []; show(u); focusWin(W); };
    U.bindSuggest(input, $('.mb-bar .sugg', W.body), (it) => { if (it.type === 'game') U.play(it.id, 'desktop'); else W.nav(it.url); });
    input.addEventListener('focus', () => { if (st.url) input.value = st.url; input.select(); });
    $('.mb-bar', W.body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]'); if (!b) return;
      if (b.dataset.b === 'back' && st.bk.length) { st.fw.push(st.url); show(st.bk.pop()); }
      if (b.dataset.b === 'fwd' && st.fw.length) { st.bk.push(st.url); show(st.fw.pop()); }
      if (b.dataset.b === 'reload' && st.frame) { try { st.frame.contentWindow.location.reload(); } catch { st.frame.src = st.frame.src; } }
      if (b.dataset.b === 'tab' && st.url) { U.setMode('browser'); U.navigate(st.url); }
    });
    if (url) W.nav(url); else setTimeout(() => input.focus(), 40);
    return W;
  }

  function openGame(g) {
    const ex = wins.find((x) => x.gameId === g.id); if (ex) { focusWin(ex); return ex; }
    const W = createWin({ app: 'browser', gameId: g.id, title: g.name, size: [980, 640], cls: 'game' });
    W.body.appendChild(U.makeFrame(g.url, true));
    return W;
  }

  function openNotes() {
    const W = createWin({ app: 'notes', size: APPS.notes.size });
    let notes = U.store.get('notes', null);
    if (!notes || !notes.length) notes = [{ id: Date.now().toString(36), text: 'Welcome to Notes.\n\nEverything you type is saved in this browser automatically.', t: Date.now() }];
    let cur = notes[0].id, saveT;
    W.body.insertAdjacentHTML('beforeend', `<div class="notes"><div class="notes-list"><button class="btn" data-n="new">${ic('plus')} New note</button><div class="nl"></div></div><textarea spellcheck="true" aria-label="Note"></textarea></div>`);
    const ta = $('textarea', W.body), nl = $('.nl', W.body);
    const save = () => U.store.set('notes', notes);
    const render = () => {
      nl.innerHTML = notes.map((n) => `<div class="note-item${n.id === cur ? ' active' : ''}" data-id="${n.id}">${esc((n.text.split('\n')[0] || 'Empty note').slice(0, 40))}</div>`).join('');
      const n = notes.find((x) => x.id === cur); ta.value = n ? n.text : '';
    };
    W.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-n="new"]')) { const n = { id: Date.now().toString(36), text: '', t: Date.now() }; notes.unshift(n); cur = n.id; save(); render(); ta.focus(); return; }
      const it = e.target.closest('[data-id]'); if (it) { cur = it.dataset.id; render(); }
    });
    W.body.addEventListener('contextmenu', (e) => {
      const it = e.target.closest('[data-id]'); if (!it) return; e.preventDefault();
      showMenu(e.clientX, e.clientY, [[`Delete note`, 'trash', () => { notes = notes.filter((n) => n.id !== it.dataset.id); if (!notes.length) notes = [{ id: Date.now().toString(36), text: '', t: Date.now() }]; cur = notes[0].id; save(); render(); }]]);
    });
    ta.addEventListener('input', () => { const n = notes.find((x) => x.id === cur); if (!n) return; n.text = ta.value; n.t = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => { save(); const el = $(`[data-id="${cur}"]`, nl); if (el) el.textContent = (n.text.split('\n')[0] || 'Empty note').slice(0, 40); }, 300); });
    render(); save(); setTimeout(() => ta.focus(), 40);
    return W;
  }

  function openCalc() {
    const W = createWin({ app: 'calc', size: APPS.calc.size });
    W.body.insertAdjacentHTML('beforeend', `<div class="calc"><div class="calc-screen"><div class="ce"></div><div class="cv">0</div></div><div class="calc-keys">
      ${['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='].map((k) => `<button data-k="${k}" class="${'÷×−+'.includes(k) ? 'op' : k === '=' ? 'eq' : ''}">${k}</button>`).join('')}</div></div>`);
    let expr = '', val = '0', fresh = false;
    const ev = $('.ce', W.body), cv = $('.cv', W.body);
    const compute = (s) => { const js = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'); if (!/^[\d+\-*/.() ]+$/.test(js)) return 'Error'; try { const r = Function('"use strict";return (' + js + ')')(); return Number.isFinite(r) ? String(+r.toPrecision(12)) : 'Error'; } catch { return 'Error'; } };
    const press = (k) => {
      if (/\d/.test(k)) { val = fresh || val === '0' ? k : val + k; fresh = false; }
      else if (k === '.') { if (fresh) { val = '0.'; fresh = false; } else if (!val.includes('.')) val += '.'; }
      else if (k === 'C') { expr = ''; val = '0'; }
      else if (k === '⌫') val = val.length > 1 ? val.slice(0, -1) : '0';
      else if (k === '±') val = val.startsWith('-') ? val.slice(1) : val === '0' ? val : '-' + val;
      else if (k === '%') val = String(+val / 100);
      else if ('÷×−+'.includes(k)) { expr = (expr && !fresh ? compute(expr + val) : val) + ' ' + k + ' '; val = expr.split(' ')[0]; fresh = true; }
      else if (k === '=') { if (!expr) return; const r = compute(expr + val); ev.textContent = expr + val + ' ='; expr = ''; val = r; fresh = true; cv.textContent = val; return; }
      ev.textContent = expr; cv.textContent = val;
    };
    W.body.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    W.keys = (e) => { const m = { '/': '÷', '*': '×', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', '.': '.', '%': '%' }; const k = /^\d$/.test(e.key) ? e.key : m[e.key]; if (k) { e.preventDefault(); press(k); } };
    return W;
  }

  function openTerminal() {
    const W = createWin({ app: 'terminal', size: APPS.terminal.size });
    W.body.insertAdjacentHTML('beforeend', `<div class="term"><div class="tlog"></div><div class="term-in"><span class="tp">unity ~ $</span><input spellcheck="false" autocomplete="off" aria-label="Terminal input"></div></div>`);
    const log = $('.tlog', W.body), input = $('input', W.body), term = $('.term', W.body);
    const hist = []; let hi = 0;
    const out = (t, cls = '') => { const d = document.createElement('div'); d.className = 'tl ' + cls; d.textContent = t; log.appendChild(d); term.scrollTop = term.scrollHeight; };
    const findGame = (q) => { q = q.toLowerCase(); return U.GAMES.find((g) => g.name.toLowerCase() === q) || U.GAMES.find((g) => g.name.toLowerCase().includes(q)); };
    const CMDS = {
      help: () => out('commands: games [filter]  play <game>  fav <game>  favs  random  open <url>  theme [name]  quality [low|medium|high|ultra]\n          spawn <shark|turtle|manta|boat>  date  echo <text>  js <expr>  neofetch  clear  browser  exit'),
      games: (a) => { const l = U.GAMES.filter((g) => !a || g.name.toLowerCase().includes(a.toLowerCase()) || g.cat.toLowerCase() === a.toLowerCase()); out(l.map((g) => `${U.isFav(g.id) ? '★' : ' '} ${g.name.padEnd(24)} ${g.cat}`).join('\n') || 'no games match'); },
      play: (a) => { const g = a && findGame(a); if (!g) return out('usage: play <game name>', 'te'); out('launching ' + g.name + '…'); U.play(g.id, 'desktop'); },
      fav: (a) => { const g = a && findGame(a); if (!g) return out('usage: fav <game name>', 'te'); U.toggleFav(g.id); out((U.isFav(g.id) ? 'added ' : 'removed ') + g.name); },
      favs: () => { const f = U.favs(); out(f.length ? f.map((id) => '★ ' + U.GBY.get(id).name).join('\n') : 'no favorites yet — try: fav 2048'); },
      random: () => U.randomGame(),
      open: (a) => { const u = U.resolveInput(a); if (!u) return out('usage: open <url or search>', 'te'); openBrowser(u); },
      theme: (a) => { if (!a) return out('themes: ' + Object.keys(U.THEMES).join(', ') + '\ncurrent: ' + U.S.theme); const k = Object.keys(U.THEMES).find((t) => t.startsWith(a.toLowerCase())); if (!k) return out('unknown theme', 'te'); U.setSetting('theme', k); out('theme → ' + U.THEMES[k].name); },
      quality: (a) => { if (!['low', 'medium', 'high', 'ultra'].includes(a)) return out('current: ' + U.S.quality + '  (low|medium|high|ultra)'); U.setSetting('quality', a); out('water quality → ' + a); },
      spawn: (a) => { if (!['shark', 'turtle', 'manta', 'boat'].includes(a)) return out('usage: spawn shark|turtle|manta|boat', 'te'); window.Reef && Reef.spawn(a); out(`a ${a} is on its way…`); },
      date: () => out(new Date().toString()),
      echo: (a) => out(a || ''),
      js: (a) => { try { const r = (0, eval)(a); out(typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r)); } catch (e) { out(e.message, 'te'); } },
      neofetch: () => out(`   .-~~~-.        unity@ocean\n  /  ~ ~  \\       ─────────────\n |  ><(((°> |     theme: ${U.THEMES[U.S.theme].name}\n  \\  ~ ~  /       water: ${U.S.quality} · webgl ${window.Water && Water.hasGL ? 'on' : 'off'}\n   '-~~~-'        games: ${U.GAMES.length} (${U.favs().length} favorite)\n                  windows: ${wins.length}`),
      clear: () => { log.innerHTML = ''; },
      browser: () => U.setMode('browser'),
      exit: () => closeWin(W),
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < hist.length) input.value = hist[++hi] || ''; return; }
      if (e.key !== 'Enter') return;
      const line = input.value.trim(); input.value = ''; out('unity ~ $ ' + line, 'tp');
      if (!line) return; hist.push(line); hi = hist.length;
      const [cmd, ...rest] = line.split(' '); const fn = CMDS[cmd.toLowerCase()];
      if (fn) fn(rest.join(' ').trim()); else out(`${cmd}: command not found — type "help"`, 'te');
    });
    W.body.addEventListener('click', () => input.focus());
    out('Unity terminal. Type "help" for commands.'); setTimeout(() => input.focus(), 40);
    return W;
  }

  let lastShown = [];
  function openTimer() {
    const W = createWin({ app: 'timer', size: APPS.timer.size });
    W.body.insertAdjacentHTML('beforeend', `<div class="timer">
      <div class="seg tm-seg"><button class="on" data-tm="timer">Timer</button><button data-tm="stopwatch">Stopwatch</button></div>
      <div class="tm-face">00:00</div>
      <div class="tm-presets">${[1, 5, 10, 15, 25].map((m) => `<button class="btn" data-min="${m}">${m} min</button>`).join('')}</div>
      <div class="btn-row" style="justify-content:center"><button class="btn primary" data-tm-go>Start</button><button class="btn" data-tm-reset>Reset</button></div></div>`);
    const face = $('.tm-face', W.body), go = $('[data-tm-go]', W.body), presets = $('.tm-presets', W.body);
    let mode = 'timer', total = 5 * 60000, left = total, elapsed = 0, running = false, last = 0, iv = null;
    const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0') + (mode === 'stopwatch' ? '.' + String(Math.floor((ms % 1000) / 100)) : ''); };
    const draw = () => { face.textContent = fmt(mode === 'timer' ? left : elapsed); go.textContent = running ? 'Pause' : 'Start'; setTitle(W, running ? `Timer ${fmt(mode === 'timer' ? left : elapsed)}` : 'Timer'); };
    const tick = () => {
      const now = performance.now(), d = now - last; last = now;
      if (mode === 'timer') { left -= d; if (left <= 0) { left = 0; running = false; clearInterval(iv); U.toast('Time is up', 'clock'); try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.4); } catch {} } }
      else elapsed += d;
      draw();
    };
    W.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tm]'); if (t) { mode = t.dataset.tm; $$('[data-tm]', W.body).forEach((b) => b.classList.toggle('on', b === t)); presets.hidden = mode !== 'timer'; running = false; clearInterval(iv); draw(); return; }
      const p = e.target.closest('[data-min]'); if (p) { total = left = +p.dataset.min * 60000; running = false; clearInterval(iv); draw(); return; }
      if (e.target.closest('[data-tm-go]')) { running = !running; if (running) { if (mode === 'timer' && left <= 0) left = total; last = performance.now(); iv = setInterval(tick, 100); } else clearInterval(iv); draw(); }
      if (e.target.closest('[data-tm-reset]')) { running = false; clearInterval(iv); left = total; elapsed = 0; draw(); }
    });
    W.onClose = () => clearInterval(iv);
    left = total; draw();
    return W;
  }

  /* ───────── desktop surface ───────── */
  const ICONS = () => [
    ...['browser', 'games', 'ai', 'movies', 'notes', 'calc', 'terminal', 'timer', 'settings'].map((k) => ({ key: k, label: APPS[k].name, open: () => openApp(k) })),
    ...U.favs().slice(0, 12).map((id) => { const g = U.GBY.get(id); return { key: 'game:' + id, label: g.name, open: () => U.play(id, 'desktop') }; }),
  ];
  let iconList = [];
  function renderIcons() {
    iconList = ICONS();
    $('#desk-icons').innerHTML = iconList.map((it, i) => `<button class="dicon" data-di="${i}" title="${esc(it.label)}">${appIcon(it.key)}<span>${esc(it.label)}</span></button>`).join('');
  }
  $('#desk-icons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-di]'); $$('.dicon.sel').forEach((x) => x !== b && x.classList.remove('sel'));
    if (!b) return; b.classList.add('sel');
    if (e.detail === 0 || matchMedia('(pointer: coarse)').matches) iconList[+b.dataset.di].open(); // keyboard Enter or touch: one tap opens
  });
  $('#desk-icons').addEventListener('dblclick', (e) => { const b = e.target.closest('[data-di]'); if (b) iconList[+b.dataset.di].open(); });

  function renderWidgets() {
    const f = U.favs().slice(0, 6);
    $('#wf-list').innerHTML = f.length ? f.map((id) => { const g = U.GBY.get(id); return `<button class="fw-item" data-play="${id}"><span class="fw-ic" style="${U.artVars(g)}">${esc(U.letters(g.name).slice(0, 2))}</span>${esc(g.name)}</button>`; }).join('')
      : `<div class="empty">Star games to pin them here.</div>`;
  }
  function tickClock() {
    const d = new Date(), h12 = !U.S.clock24;
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: h12 });
    $('#wc-time').textContent = time;
    $('#wc-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    $('#tray-clock').innerHTML = `<span>${esc(time)}</span><small>${esc(d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' }))}</small>`;
  }
  U.on('clock', () => entered && tickClock());

  /* taskbar */
  function renderTaskbar() {
    if (!entered) return;
    const items = [];
    PINNED.forEach((app) => { if (!wins.some((w) => w.app === app && !w.gameId)) items.push(`<button class="tb-app pinned" data-pin="${app}" title="${esc(APPS[app].name)}">${appIcon(app, true)}<span class="tb-l">${esc(APPS[app].name)}</span></button>`); });
    if (wins.length) items.push('<span class="tb-sep"></span>');
    wins.forEach((W) => items.push(`<button class="tb-app running${focused === W && !W.min ? ' focused' : ''}" data-win="${W.id}" title="${esc(W.title)}">${appIcon(W.gameId ? 'game:' + W.gameId : W.app, true)}<span class="tb-l">${esc(W.title)}</span></button>`));
    $('#tb-apps').innerHTML = items.join('');
  }
  $('#tb-apps').addEventListener('click', (e) => {
    const p = e.target.closest('[data-pin]'); if (p) { openApp(p.dataset.pin); return; }
    const w = e.target.closest('[data-win]'); if (!w) return;
    const W = wins.find((x) => x.id === +w.dataset.win); if (!W) return;
    if (focused === W && !W.min) minimize(W); else focusWin(W);
  });
  $('#tb-apps').addEventListener('contextmenu', (e) => {
    const w = e.target.closest('[data-win]'); if (!w) return; e.preventDefault();
    const W = wins.find((x) => x.id === +w.dataset.win); if (!W) return;
    showMenu(e.clientX, e.clientY - 120, [[W.max ? 'Restore' : 'Maximize', 'square', () => toggleMax(W)], [W.min ? 'Show' : 'Minimize', 'minus', () => (W.min ? focusWin(W) : minimize(W))], null, ['Close window', 'x', () => closeWin(W)]]);
  });

  /* start menu */
  let smSel = 0, smItems = [];
  function toggleStart(force) {
    const sm = $('#start-menu'), open = force != null ? force : sm.hidden;
    sm.hidden = !open; $('#start-btn').classList.toggle('on', open);
    if (open) { $('#sm-input').value = ''; renderStart(); setTimeout(() => $('#sm-input').focus(), 20); }
  }
  function renderStart() {
    const q = $('#sm-input').value.trim(), body = $('#sm-body');
    if (!q) {
      const favs = U.favs().slice(0, 6), rec = U.recentIds().slice(0, 5);
      const row = (id, sub) => { const g = U.GBY.get(id); return `<button class="sm-row" data-play="${id}"><span class="fw-ic" style="${U.artVars(g)}">${esc(U.letters(g.name).slice(0, 2))}</span>${esc(g.name)}<small>${esc(sub || g.cat)}</small></button>`; };
      body.innerHTML = `<h4>Apps</h4><div class="sm-grid">${Object.keys(APPS).map((k) => `<button class="dicon" data-app="${k}">${appIcon(k)}<span>${esc(APPS[k].name)}</span></button>`).join('')}</div>
        <h4>Favorites</h4><div class="sm-list">${favs.length ? favs.map((id) => row(id)).join('') : '<div class="empty">Star a game in the Games app to pin it here.</div>'}</div>
        ${rec.length ? `<h4>Recently played</h4><div class="sm-list">${rec.map((id) => row(id, 'Played ' + (U.store.get('plays', {})[id] || {}).n + '×')).join('')}</div>` : ''}`;
      smItems = []; return;
    }
    const ql = q.toLowerCase();
    const apps = Object.keys(APPS).filter((k) => APPS[k].name.toLowerCase().includes(ql)).map((k) => ({ type: 'app', key: k, label: APPS[k].name, sub: 'App' }));
    smItems = [...apps, ...U.suggest(q)].slice(0, 10); smSel = Math.min(smSel, smItems.length - 1);
    body.innerHTML = `<h4>Results</h4><div class="sm-list">${smItems.map((s, i) => `<button class="sm-row${i === smSel ? ' sel' : ''}" data-smi="${i}">${s.type === 'app' ? `<span class="fw-ic" style="background:${TILE[s.key]};color:#fff">${ic(APPS[s.key].icon)}</span>` : U.suggIcon(s).replace('si-ic', 'fw-ic')}${esc(s.label)}<small>${esc(s.sub)}</small></button>`).join('')}</div>`;
  }
  function runSm(s) { toggleStart(false); if (!s) return; if (s.type === 'app') openApp(s.key); else if (s.type === 'game') U.play(s.id, 'desktop'); else openBrowser(s.url); }
  $('#sm-input').addEventListener('input', () => { smSel = 0; renderStart(); });
  $('#sm-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); smSel = Math.min(smItems.length - 1, smSel + 1); renderStart(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); smSel = Math.max(0, smSel - 1); renderStart(); }
    else if (e.key === 'Enter') { e.preventDefault(); runSm(smItems[smSel] || U.suggest($('#sm-input').value)[0]); }
  });
  $('#start-menu').addEventListener('click', (e) => {
    const a = e.target.closest('[data-app]'); if (a) { toggleStart(false); openApp(a.dataset.app); return; }
    const s = e.target.closest('[data-smi]'); if (s) { runSm(smItems[+s.dataset.smi]); return; }
    if (e.target.closest('[data-play]') || e.target.closest('[data-act]')) toggleStart(false);
  });
  $('#start-btn').addEventListener('click', () => toggleStart());
  document.addEventListener('pointerdown', (e) => {
    if (!entered) return;
    if (!$('#start-menu').hidden && !e.target.closest('#start-menu') && !e.target.closest('#start-btn')) toggleStart(false);
    if (!$('#ctx-menu').hidden && !e.target.closest('#ctx-menu')) $('#ctx-menu').hidden = true;
  });

  /* context menu */
  function showMenu(x, y, items) {
    const m = $('#ctx-menu');
    m.innerHTML = items.map((it, i) => (it ? `<button data-mi="${i}">${ic(it[1])}${esc(it[0])}</button>` : '<hr>')).join('');
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    m.onclick = (e) => { const b = e.target.closest('[data-mi]'); if (!b) return; m.hidden = true; items[+b.dataset.mi][2](); };
  }
  $('#desk-surface').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.widget')) return;
    e.preventDefault();
    const themes = Object.entries(U.THEMES).map(([k, t]) => [`Theme: ${t.name}${U.S.theme === k ? ' ✓' : ''}`, 'drop', () => U.setSetting('theme', k)]);
    showMenu(e.clientX, e.clientY, [
      ['New browser window', 'browser', () => openApp('browser')], ['New note', 'note', () => openApp('notes')], ['Play a random game', 'shuffle', () => U.randomGame()],
      null, ...themes, null,
      ['Send in a shark', 'zap', () => window.Reef && Reef.spawn('shark')],
      ['Settings', 'sliders', () => U.openSettings()], ['Switch to browser mode', 'power', () => U.setMode('browser')],
    ]);
  });

  document.addEventListener('keydown', (e) => { if (entered && focused && focused.keys && !focused.min && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) focused.keys(e); });
  addEventListener('resize', () => { const A = area(); wins.forEach((W) => { if (!W.max) { W.x = Math.min(W.x, Math.max(0, A.w - 120)); W.y = Math.min(W.y, Math.max(0, A.h - 60)); place(W); } }); });

  /* ───────── public ───────── */
  window.Desktop = {
    enter() {
      entered = true;
      U.hydrateIcons($('#desktop'));
      renderIcons(); renderWidgets(); renderTaskbar(); tickClock();
      if (!U.store.get('desktopIntro')) { U.store.set('desktopIntro', 1); U.toast('Desktop mode. Use “Exit desktop” on the taskbar to go back.', 'monitor'); }
    },
    exit() { toggleStart(false); $('#ctx-menu').hidden = true; },
    openApp, openBrowser, openGame,
    closeFocused() { if (focused) closeWin(focused); },
    toggleStart,
    escape() { if (!$('#start-menu').hidden) toggleStart(false); else if (!$('#ctx-menu').hidden) $('#ctx-menu').hidden = true; },
    covered() { return wins.some((W) => W.max && !W.min); },
    showDesktop() {
      const open = wins.filter((W) => !W.min);
      if (open.length) { open.forEach((W) => { W.min = true; W.el.classList.add('minimized'); }); focused = null; lastShown = open; }
      else if (lastShown.length) { lastShown.forEach((W) => { if (wins.includes(W)) { W.min = false; W.el.classList.remove('minimized'); } }); const top = lastShown[lastShown.length - 1]; if (wins.includes(top)) focusWin(top); lastShown = []; }
      renderTaskbar(); U.updateOcean();
    },
  };
})();
