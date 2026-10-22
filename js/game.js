/* TT Jetpack: the game. Home screen (who flies, each brother's level, a demo flight behind the menu), the 3-2-1, the
   flight itself (hold to fly, through JP.lab's fixed steps), the brother's visit and his shield, high fives, the exit
   and the podium, the results, pause, sound, touch, and window.game for tests.
   Rules: js/lab.js. Drawing: js/world.js (the lab) and js/flyer.js (the flyers). */
(function () {
  'use strict';
  const JP = window.JP, L = JP.lab, W = JP.world, F = JP.flyer, S = Kit.sound;
  const $ = (id) => document.getElementById(id);
  const HUMANS = ['teddy', 'tommy'];
  const NAMES = F.NAMES;
  const STORE = 'jetpackTT.v1';
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const SHIELD_S = 8; // seconds of shield from one visit
  const MEDALS = ['🥇', '🥈', '🥉'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const ease = (u) => u * u * (3 - 2 * u);

  // ---------------------------------------------------------------- saved settings
  function load() {
    const d = { who: 'teddy', level: { teddy: 'easy', tommy: 'easy' }, best: {} };
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (['teddy', 'tommy', 'both'].includes(s.who)) d.who = s.who;
      for (const id of HUMANS) if (s.level && ['easy', 'normal'].includes(s.level[id])) d.level[id] = s.level[id];
      if (s.best && typeof s.best === 'object') d.best = s.best;
    } catch (e) { /* first visit, or storage blocked */ }
    return d;
  }
  const save = load();
  function store() {
    try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* private window */ }
  }

  // ---------------------------------------------------------------- sounds of our own (Kit.sound.tone / hiss)
  const SFX = {
    zap() { S.tone({ type: 'sawtooth', f: 170, to: 55, dur: 0.34, vol: 0.15 }); S.hiss({ filter: 'bandpass', f: 3400, to: 1100, dur: 0.3, vol: 0.12, q: 2 }); },
    block() { S.tone({ type: 'triangle', f: 640, to: 1400, dur: 0.18, vol: 0.12 }); },
    puff() { S.hiss({ filter: 'lowpass', f: 420, to: 900, dur: 0.18, vol: 0.05 }); },
    shield() { S.tone({ type: 'sine', f: 520, to: 1040, dur: 0.45, vol: 0.12 }); S.tone({ type: 'sine', f: 780, to: 1560, dur: 0.45, vol: 0.08, at: 0.09 }); },
    hi5() { S.tone({ type: 'square', f: 660, dur: 0.07, vol: 0.06 }); S.tone({ type: 'square', f: 990, dur: 0.12, vol: 0.06, at: 0.07 }); },
    tick() { S.tone({ type: 'square', f: 520, dur: 0.08, vol: 0.06 }); },
    yay() { [523, 659, 784, 1047].forEach((f, i) => S.tone({ type: 'triangle', f, dur: 0.22, vol: 0.12, at: i * 0.11 })); },
  };

  // ---------------------------------------------------------------- state
  let portraits = {};
  let mode = 'title'; // title, count, fly, finish, zapped, over
  let paused = false;
  let rc = null, models = [], humans = [], demo = true;
  let countT = 0, countShown = 0, endT = 0;
  let camX = 0, camY = L.H / 2, camZoom = 1, camTarget = null;
  let buddy = null, hfT = 0, hfSprite = null, treatSprite = null;
  let finishPlan = null, results = null;
  const forced = [false, false];
  const keyHold = { p0: new Set(), p1: new Set() };
  const touches = new Map(); // pointerId -> player
  const puffT = [0, 0, 0], wasHold = [false, false, false];
  const nozzle = [new THREE.Vector3(), new THREE.Vector3()];

  // ---------------------------------------------------------------- toasts and the count
  function toast(text, cls) {
    const box = $('toasts');
    while (box.children.length > 2) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'toast' + (cls ? ' ' + cls : '');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
  function showCount(text, go) {
    const c = $('count');
    c.textContent = text;
    c.className = '';
    void c.offsetWidth;
    c.className = go ? 'go' : 'tick';
  }

  // ---------------------------------------------------------------- setting up a flight
  function setup(isDemo, seedIn) {
    demo = isDemo;
    humans = save.who === 'both' ? HUMANS.slice() : [save.who];
    const lv = humans.map((id) => save.level[id]);
    const labLevel = lv.includes('easy') ? 'easy' : 'normal';
    const flyers = humans.map((id, k) => ({ id, level: save.level[id], lane: k, bot: isDemo ? (save.level[id] === 'easy' ? 'wobbly5' : 'careful8') : null }));
    if (humans.length === 1) {
      flyers.push({ id: 'foxy', cpu: true, level: labLevel, bot: L.cpuBot('foxy', labLevel), lane: 1 });
      flyers.push({ id: 'froggy', cpu: true, level: labLevel, bot: L.cpuBot('froggy', labLevel), lane: 2 });
    }
    let seed = seedIn || 1 + Math.floor(Math.random() * 1e9);
    let lab = null;
    for (let tries = 0; tries < 6; tries++) {
      lab = L.generate(seed, labLevel);
      if (isDemo) break;
      // every lab is flown by the solver before anyone plays it, at each level that's playing (the checks have never
      // seen one fail; this is the promise kept anyway)
      const levels = [...new Set(flyers.filter((f) => !f.cpu).map((f) => f.level))];
      if (levels.every((l) => L.solve(lab, l, { coarse: true }).ok)) break;
      seed++;
    }
    rc = L.race({ lab, flyers });
    rc.seed = seed;
    for (const m of models) W.scene.remove(m.root);
    models = rc.flyers.map((f) => {
      // name tags only with 2 players (Foxy and Froggy wear their faces); side by side, so they don't sit on top of each other
      const m = F.make(f.id, { tag: humans.length === 2 });
      if (m.tag) m.tag.position.x = f.lane ? 0.5 : -0.5;
      W.scene.add(m.root);
      return m;
    });
    W.setLab(lab);
    removeBuddy();
    finishPlan = null;
    camX = rc.x + 3;
    camZoom = 1;
    camY = L.H / 2;
    camTarget = null;
    hfT = 0;
    touches.clear();
    for (const k of ['p0', 'p1']) keyHold[k].clear();
    refreshHud();
  }

  function play(seed) {
    S.init();
    setup(false, seed);
    clearToasts();
    mode = 'count';
    countT = 3.2;
    countShown = 4;
    paused = false;
    $('title').classList.add('hidden');
    $('over').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.add('counting');
    S.music('title');
  }
  function home() {
    paused = false;
    clearToasts();
    mode = 'title';
    $('pause').classList.add('hidden');
    $('over').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('title').classList.remove('hidden');
    document.body.classList.remove('counting');
    refreshTitle();
    setup(true);
    L.go(rc);
    S.music('title');
  }

  // ---------------------------------------------------------------- input
  function holdFor(i) {
    if (forced[i]) return true;
    if (humans.length === 1) return keyHold.p0.size > 0 || keyHold.p1.size > 0 || touches.size > 0;
    if ((i === 0 ? keyHold.p0 : keyHold.p1).size > 0) return true;
    for (const p of touches.values()) if (p === i) return true;
    return false;
  }
  const input = (i, r) => (r._auto ? r._auto(i, r) : holdFor(i));
  const P0_KEYS = { Space: 1, KeyW: 1 }, P1_KEYS = { ArrowUp: 1, Enter: 1, NumpadEnter: 1 };

  function onKey(e) {
    if (e.repeat && !(e.code in P0_KEYS || e.code in P1_KEYS)) return;
    S.init();
    const c = e.code;
    if (c === 'KeyM') {
      S.toggleMute();
      return;
    }
    if (mode === 'title') {
      if (c === 'ArrowLeft' || c === 'ArrowRight') {
        const all = ['teddy', 'tommy', 'both'];
        pickWho(all[(all.indexOf(save.who) + (c === 'ArrowLeft' ? 2 : 1)) % 3]);
      } else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3') pickWho(['teddy', 'tommy', 'both'][+c.slice(-1) - 1]);
      else if (c === 'KeyW' || c === 'KeyS') toggleLevel(save.who === 'both' ? 'teddy' : save.who);
      else if (c === 'ArrowUp' || c === 'ArrowDown') toggleLevel(save.who === 'both' ? 'tommy' : save.who);
      else if (c === 'Enter' || c === 'Space') play();
      else return;
      e.preventDefault();
      return;
    }
    if (mode === 'over') {
      if (c === 'Enter' || c === 'Space') play();
      else if (c === 'Escape' || c === 'KeyH') home();
      else return;
      e.preventDefault();
      return;
    }
    if (c === 'KeyP' || c === 'Escape') {
      if (mode === 'count' || mode === 'fly') togglePause();
      e.preventDefault();
      return;
    }
    if (paused) {
      if (c === 'Space' || c === 'Enter') togglePause();
      e.preventDefault();
      return;
    }
    if (c === 'KeyT') {
      if (humans.length === 2) highFive(); else callBuddy();
      e.preventDefault();
      return;
    }
    if (c in P0_KEYS || c in P1_KEYS) {
      (c in P0_KEYS ? keyHold.p0 : keyHold.p1).add(c);
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keyHold.p0.delete(e.code);
    keyHold.p1.delete(e.code);
  }
  function onPointerDown(e) {
    S.init();
    if (mode !== 'count' && mode !== 'fly') return;
    if (paused) return;
    const side = humans.length === 2 && e.clientX > window.innerWidth / 2 ? 1 : 0;
    touches.set(e.pointerId, side);
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    e.preventDefault();
  }
  function onPointerUp(e) {
    touches.delete(e.pointerId);
  }

  // ---------------------------------------------------------------- the home screen
  function pickWho(w) {
    save.who = w;
    store();
    refreshTitle();
    setup(true);
    L.go(rc);
  }
  function toggleLevel(id) {
    save.level[id] = save.level[id] === 'easy' ? 'normal' : 'easy';
    store();
    refreshTitle();
    setup(true);
    L.go(rc);
  }
  function bestOf(id) {
    return save.best[id + '-' + save.level[id]] || 0;
  }
  function refreshTitle() {
    document.querySelectorAll('.who').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.who === save.who)));
    const flying = save.who === 'both' ? HUMANS : [save.who];
    document.querySelectorAll('.lvl').forEach((b) => {
      const id = b.dataset.lvl, lv = save.level[id];
      b.style.display = flying.includes(id) ? '' : 'none';
      b.className = 'lvl ' + lv;
      b.querySelector('span').textContent = lv === 'easy' ? '🐣' : '🔥';
      b.querySelector('b').textContent = `${NAMES[id]} · ${lv === 'easy' ? 'EASY' : 'NORMAL'}`;
    });
    document.querySelectorAll('[data-best]').forEach((s) => {
      const n = bestOf(s.dataset.best);
      s.textContent = n ? `BEST 🪙 ${n}` : save.level[s.dataset.best] === 'easy' ? '🐣 EASY' : '🔥 NORMAL';
    });
    $('vsLine').textContent = save.who === 'both' ? 'Teddy and Tommy race for coins!' : 'Race Foxy 🦊 and Froggy 🐸 for coins!';
    $('buddyKeyName').textContent = save.who === 'both' ? 'a high five' : Kit.roster.buddyFor(save.who) === 'tommy' ? 'Tommy' : 'Teddy';
  }

  // ---------------------------------------------------------------- the HUD
  function refreshHud() {
    const two = humans.length === 2;
    $('face0').src = portraits[humans[0]] || '';
    $('pill1').style.display = two ? '' : 'none';
    if (two) $('face1').src = portraits[humans[1]] || '';
    $('cpus').style.display = two ? 'none' : '';
    const bb = $('buddyBtn');
    if (two) {
      $('buddyFace').style.display = 'none';
      $('hiFive').style.display = '';
      $('buddyName').textContent = 'HIGH FIVE';
      bb.title = 'High five (T)';
    } else {
      const id = Kit.roster.buddyFor(humans[0]);
      $('buddyFace').style.display = '';
      $('buddyFace').src = portraits[id] || '';
      $('hiFive').style.display = 'none';
      $('buddyName').textContent = NAMES[id];
      bb.title = 'Call your brother (T)';
    }
    shown.coins = [-1, -1, -1, -1];
    shown.hearts = ['', ''];
  }
  const shown = { coins: [-1, -1, -1, -1], hearts: ['', ''], trip: -1 };
  function updateHud() {
    if (!rc) return;
    rc.flyers.forEach((f, i) => {
      const el = f.cpu ? $(f.id === 'foxy' ? 'coinsFoxy' : 'coinsFroggy') : $('coins' + i);
      if (shown.coins[i] !== f.coins) {
        if (shown.coins[i] >= 0 && f.coins > shown.coins[i]) {
          el.parentNode.classList.remove('bump');
          void el.offsetWidth;
          el.parentNode.classList.add('bump');
        }
        shown.coins[i] = f.coins;
        el.textContent = String(f.coins);
      }
      el.parentNode.classList.toggle('out', f.out);
      if (!f.cpu) {
        const P = L.LEVELS[f.level];
        const h = P.hearts ? '❤️'.repeat(Math.max(0, f.hearts)) + '🤍'.repeat(Math.max(0, P.hearts - f.hearts)) : '';
        if (shown.hearts[i] !== h) $('hearts' + i).textContent = shown.hearts[i] = h;
      }
    });
    const k = clamp(rc.x / rc.lab.exitX, 0, 1);
    $('tripBar').style.width = (k * 100).toFixed(1) + '%';
    $('tripMe').style.left = (k * 100).toFixed(1) + '%';
    const m = Math.max(0, Math.round(rc.lab.exitX - rc.x));
    if (shown.trip !== m) $('tripM').textContent = `${(shown.trip = m)} m`;
    $('buddyBtn').classList.toggle('on', !!(humans.length === 1 && rc.flyers[0].shield > 0));
    $('buddyBtn').style.visibility = mode === 'fly' || mode === 'count' ? '' : 'hidden';
  }

  // ---------------------------------------------------------------- the brother's visit (1 player)
  function removeBuddy() {
    if (buddy) W.scene.remove(buddy.model.root);
    buddy = null;
    if (treatSprite) { W.scene.remove(treatSprite); treatSprite = null; }
  }
  function callBuddy() {
    if (demo || humans.length !== 1 || (mode !== 'fly' && mode !== 'count')) return;
    const me = rc.flyers[0];
    if (me.out) return;
    if (!buddy) {
      const id = Kit.roster.buddyFor(humans[0]), entry = Kit.roster.get(id);
      const model = F.make(id, { scale: entry.buddyScale });
      W.scene.add(model.root);
      buddy = { id, entry, model, phase: 'enter', t: 0, x: -6, y: L.H - 0.6, vy: 0 };
    } else if (buddy.phase !== 'enter') {
      // called again while he's here: he does it all again (and the shield starts over when he gets to it)
      buddy.phase = 'hello';
      buddy.t = 0;
    }
    S.powerup();
  }
  function updateBuddy(dt) {
    if (!buddy) return;
    const b = buddy, me = rc.flyers[0], m = b.model;
    b.t += dt;
    const meY = me.y;
    let tx = -1.9, ty = clamp(meY + 1.15, 1.0, L.H - 0.8);
    if (b.phase === 'enter') {
      if (b.t >= 0.75) { b.phase = 'hello'; b.t = 0; }
      m.airPose(null);
    } else if (b.phase === 'hello') {
      const move = Kit.roster.signature(b.entry, 'hello');
      m.airPose(move);
      if (b.t >= 1.6) {
        b.phase = 'treat';
        b.t = 0;
        const [emoji, item] = TREATS[Math.floor(Math.random() * TREATS.length)];
        b.treat = { emoji, item };
        treatSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Kit.gfx.emojiTexture(emoji), depthWrite: false }));
        treatSprite.scale.setScalar(0.55);
        W.scene.add(treatSprite);
        m.airPose('give');
        toast(`${emoji} ${item} FROM ${NAMES[b.id]}!`, 'good');
        S.swish();
      }
    } else if (b.phase === 'treat') {
      const u = Math.min(1, b.t / 0.6);
      if (treatSprite) {
        const fx = rc.x + b.x, fy = b.y, toX = rc.x, toY = meY + 0.2;
        treatSprite.position.set(fx + (toX - fx) * u, fy + (toY - fy) * u + Math.sin(Math.PI * u) * 1.0, 0.5 * (1 - u));
      }
      if (u >= 1) {
        if (treatSprite) { W.scene.remove(treatSprite); treatSprite = null; }
        if (L.treat(rc, 0)) toast('❤️ +1', 'pink');
        S.coin(6);
        b.phase = 'shield';
        b.t = 0;
        L.shield(rc, 0, SHIELD_S);
        toast(`${NAMES[b.id]} SAYS: SHIELD!`, 'good');
        SFX.shield();
        W.sparkle(rc.x, meY, W.LANES[me.lane]);
        m.airPose(null);
      }
    } else if (b.phase === 'shield') {
      // he flies along just behind, keeping the shield up
      tx = -2.1;
      ty = clamp(meY + 0.5, L.Y_MIN, L.Y_MAX);
      m.airPose(b.t < 0.8 ? 'give' : null);
      if (me.shield <= 0 || me.out) { b.phase = 'bye'; b.t = 0; }
    } else if (b.phase === 'bye') {
      m.airPose(Kit.roster.signature(b.entry, 'goodbye'));
      if (b.t > 1.2) {
        tx = -7;
        ty = L.H + 3;
      }
      if (b.t > 2.2) { removeBuddy(); return; }
    }
    const k = damp(b.phase === 'enter' ? 5 : 6, dt);
    const ny = b.y + (ty - b.y) * k;
    b.vy = (ny - b.y) / Math.max(dt, 1e-6);
    b.y = ny;
    b.x += (tx - b.x) * k;
    m.root.position.set(rc.x + b.x, b.y, 0.75);
    m.update(dt, { y: b.y, vy: b.vy, hold: true });
  }

  // ---------------------------------------------------------------- high five (2 players)
  function highFive() {
    if (demo || humans.length !== 2 || (mode !== 'fly' && mode !== 'count') || hfT > 0) return;
    hfT = 1.0;
    models[0].airPose('give');
    models[1].airPose('give');
    if (!hfSprite) {
      hfSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Kit.gfx.emojiTexture('✋'), depthWrite: false }));
      hfSprite.scale.setScalar(0.7);
      W.scene.add(hfSprite);
    }
    hfSprite.visible = true;
    toast('✋ HIGH FIVE!', 'good');
    SFX.hi5();
    const a = rc.flyers[0], b = rc.flyers[1];
    W.sparkle(rc.x + 0.4, (a.y + b.y) / 2, -0.6);
  }
  function updateHighFive(dt) {
    if (hfT <= 0) return;
    hfT -= dt;
    const a = rc.flyers[0], b = rc.flyers[1];
    if (hfSprite) {
      hfSprite.position.set(rc.x + 0.55, (a.y + b.y) / 2 + 0.3, -0.5);
      hfSprite.scale.setScalar(0.7 + Math.sin(Math.min(1, (1 - hfT) * 3) * Math.PI) * 0.3);
    }
    if (hfT <= 0) {
      models[0].airPose(null);
      models[1].airPose(null);
      if (hfSprite) hfSprite.visible = false;
    }
  }

  // ---------------------------------------------------------------- what the rules said happened
  function handleEvents() {
    for (const ev of rc.events) {
      const f = ev.i !== undefined ? rc.flyers[ev.i] : null;
      const z = f ? W.LANES[f.lane] : 0;
      if (ev.type === 'coin') {
        W.coinBurst(rc.x, f.y, z);
        if (demo) continue;
        if (!f.cpu) {
          S.coin(ev.streak);
          if (ev.streak && ev.streak % 10 === 9) toast(`COIN STREAK ×${ev.streak + 1}!`);
        }
      } else if (ev.type === 'zap') {
        W.zapBurst(rc.x, f.y, z);
        if (demo) continue;
        SFX.zap();
        if (f.cpu) continue;
        const who = humans.length === 2 ? `${NAMES[f.id]}: ` : '';
        const P = L.LEVELS[f.level];
        toast(P.hearts ? `⚡ ${who}BZZT! ❤️ −1` : ev.lost ? `⚡ ${who}BZZT! −${ev.lost} 🪙` : `⚡ ${who}BZZT!`, 'zap');
      } else if (ev.type === 'block') {
        W.sparkle(rc.x + 0.4, f.y, z);
        if (demo) continue;
        SFX.block();
        toast('🛡️ SHIELD BLOCK!', 'good');
      } else if (ev.type === 'out') {
        if (demo) continue;
        S.crash();
        toast(`🫧 ${NAMES[f.id]} IS OUT!`, 'pink');
      } else if (ev.type === 'over') {
        if (demo) continue;
        mode = 'zapped';
        endT = 0;
        S.music('over');
        toast('⚡ ZAPPED!', 'zap');
      } else if (ev.type === 'exit') {
        if (demo) continue;
        startFinish();
      }
    }
    rc.events.length = 0;
  }

  // ---------------------------------------------------------------- the exit: everyone lands on the podium
  function startFinish() {
    mode = 'finish';
    endT = 0;
    removeBuddy();
    toast('🏁 EXIT!', 'good');
    SFX.yay();
    S.music('over');
    const order = L.places(rc);
    const steps = W.exit.userData.steps;
    const feet = F.CENTER * F.SCALE;
    finishPlan = order.map((f, k) => {
      const st = steps[Math.min(k, 2)];
      const sx = k > 2 ? st.x + 1.6 : st.x;
      return { f, m: models[f.i], from: { x: rc.x, y: f.y, z: W.LANES[f.lane] }, to: { x: sx, y: st.top + feet, z: -1.15 }, winner: f.place === 1, done: false };
    });
    camTarget = { x: rc.lab.exitX + 8, y: 2.6, zoom: 1.45 };
    for (const m of models) if (m.tag) m.tag.position.set(0, m.headTop + 0.4, 0);
  }
  function updateFinish(dt) {
    endT += dt;
    const u = clamp((endT - 0.2) / 1.9, 0, 1), e = ease(u);
    for (const p of finishPlan) {
      const { from, to, m } = p;
      const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e + Math.sin(Math.PI * u) * 1.4, z = from.z + (to.z - from.z) * e;
      m.root.position.set(x, y, z);
      if (u < 1) m.update(dt, { y, vy: (to.y - from.y) * 0.5, hold: true, out: p.f.out && u < 0.6 });
      else {
        if (!p.done) {
          p.done = true;
          m.setMode(p.winner ? 'celebrate' : 'stand');
          W.sparkle(x, y, z);
        }
        m.update(dt, {});
      }
    }
    const win = finishPlan.find((p) => p.winner);
    if (win && u >= 1) {
      const t = endT - 2.1;
      for (const at of [0, 0.7, 1.4]) if (t >= at && t - dt < at) W.confetti(win.to.x, win.to.y + 3.5);
    }
    if (endT > 5.2) showResults(false);
  }

  // ---------------------------------------------------------------- results
  function clearToasts() {
    $('toasts').innerHTML = '';
  }
  function showResults(zapped) {
    mode = 'over';
    clearToasts();
    $('hud').classList.add('hidden');
    document.body.classList.remove('counting');
    const order = L.places(rc);
    const top = order.filter((f) => f.place === 1);
    let title;
    if (zapped) title = '⚡ ZAPPED!';
    else if (top.length > 1) title = "🏆 IT'S A TIE!";
    else if (top[0].id === 'foxy') title = '🦊 FOXY WINS!';
    else if (top[0].id === 'froggy') title = '🐸 FROGGY WINS!';
    else title = `🏆 ${NAMES[top[0].id]} WINS!`;
    const head = $('ovTitle');
    head.textContent = title;
    head.className = 'head' + (zapped ? ' zapped' : '');
    const card = $('ovCard');
    card.innerHTML = '';
    const row = (left, right, me) => {
      const r = document.createElement('div');
      r.className = 'row' + (me ? ' me' : '');
      const a = document.createElement('span');
      left.forEach((t, k) => {
        const s = document.createElement('span');
        s.textContent = t;
        a.appendChild(s);
        if (k < left.length - 1) a.appendChild(document.createTextNode(' '));
      });
      const b = document.createElement('b');
      if (typeof right === 'object') {
        b.innerHTML = '<i class="coin-icon"></i> ';
        b.appendChild(document.createTextNode(String(right.coins || 0)));
      } else b.textContent = right;
      r.append(a, b);
      card.appendChild(r);
    };
    order.forEach((f) => row([MEDALS[f.place - 1] || '🎈', NAMES[f.id]], { coins: f.coins }, !f.cpu));
    if (zapped) row(['DISTANCE'], `${Math.round(rc.x)} m`);
    let newBest = false;
    for (const f of rc.flyers) {
      if (f.cpu) continue;
      const key = f.id + '-' + f.level;
      if (f.coins > (save.best[key] || 0)) {
        save.best[key] = f.coins;
        if (f.coins > 0) newBest = true;
      }
      row([`${NAMES[f.id]}'S BEST`], { coins: save.best[key] });
    }
    store();
    $('newBest').classList.toggle('on', newBest);
    $('over').classList.remove('hidden');
    results = { title, newBest, order: order.map((f) => ({ id: f.id, coins: f.coins, place: f.place })) };
  }

  // ---------------------------------------------------------------- pause
  function togglePause() {
    if (mode !== 'count' && mode !== 'fly') return;
    paused = !paused;
    $('pause').classList.toggle('hidden', !paused);
    touches.clear();
    keyHold.p0.clear();
    keyHold.p1.clear();
    S.music(paused ? 'pause' : 'play');
  }

  // ---------------------------------------------------------------- every frame
  function update(dt) {
    if (!rc) return;
    if (!paused) {
      if (mode === 'count') {
        countT -= dt;
        const n = Math.ceil(countT - 0.2);
        if (n < countShown && n >= 1) {
          countShown = n;
          showCount(String(n));
          SFX.tick();
        }
        if (countT <= 0.2) {
          mode = 'fly';
          L.go(rc);
          showCount('GO!', true);
          document.body.classList.remove('counting');
          S.music('play');
          S.jet();
        }
      }
      if (mode === 'title' || mode === 'count' || mode === 'fly') {
        L.step(rc, dt, input);
        handleEvents();
        if (mode === 'title' && rc.phase === 'done') {
          setup(true);
          L.go(rc);
        }
      }
      if (mode === 'fly' || mode === 'count') {
        updateBuddy(dt);
        updateHighFive(dt);
      }
      if (mode === 'finish') updateFinish(dt);
      if (mode === 'zapped') {
        endT += dt;
        for (const f of rc.flyers) if (f.out) f.y += (L.H * 0.78 - f.y) * Math.min(1, dt * 1.5);
        if (endT > 2.2) showResults(true);
      }
    }
    // flyers
    if (mode !== 'finish' && !(mode === 'over' && finishPlan)) {
      rc.flyers.forEach((f, i) => {
        const m = models[i];
        m.root.position.set(rc.x, f.y, W.LANES[f.lane]);
        // a name tag near the ceiling would hide behind it: it goes under his feet instead
        if (m.tag) m.tag.position.y = f.y + m.headTop + 0.4 > L.H - 0.2 ? -m.headTop - 0.35 : m.headTop + 0.4;
        m.update(paused ? 0 : dt, { y: f.y, vy: f.vy, hold: f.hold, ground: f.y <= L.Y_MIN + 1e-6 && !f.hold, dizzy: f.dizzy, safe: f.safe, shield: f.shield, out: f.out });
        // jet smoke, and a puff of sound when a human starts holding
        if (!paused && f.hold && !f.out && !(f.dizzy > 0)) {
          puffT[i] -= dt;
          if (puffT[i] <= 0) {
            puffT[i] = 0.045;
            m.nozzles(nozzle);
            for (const n of nozzle) W.smoke(n.x, n.y, n.z, 1);
          }
          if (!f.cpu && !demo && i < 2 && !wasHold[i]) SFX.puff();
        }
        if (i < 3) wasHold[i] = f.hold;
      });
    } else if (mode === 'over' && finishPlan) for (const p of finishPlan) p.m.update(dt, {});
    // camera: the flyers a third of the way in from the left, the whole lab height in view
    const vw = W.visibleWidth();
    let tx = rc.x + vw * 0.2, tz = 1;
    if (camTarget) {
      tx = camTarget.x;
      tz = camTarget.zoom;
      camY += (camTarget.y - camY) * damp(2.2, dt);
    } else camY = L.H / 2;
    const k = camTarget ? damp(2.2, dt) : damp(10, dt);
    camX += (tx - camX) * (mode === 'title' && Math.abs(tx - camX) > 20 ? 1 : k);
    camZoom += (tz - camZoom) * k;
    // room for the HUD above the ceiling and the buttons under the floor while flying
    const hud = mode === 'count' || mode === 'fly' || mode === 'zapped', short = window.innerHeight < 500;
    W.frame(camX, camTarget ? camY : null, camZoom, hud ? { top: short ? 56 : 104, bottom: short ? 50 : 66 } : { top: 30, bottom: 30 });
    W.update(paused ? 0 : dt, { t: rc.t, taken: rc.taken });
    if (mode === 'fly' || mode === 'count' || mode === 'finish' || mode === 'zapped') updateHud();
  }

  // ---------------------------------------------------------------- start-up
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
    last = now;
    update(dt);
    W.render();
  }
  function resize() {
    W.resize(window.innerWidth, window.innerHeight);
  }
  function syncMute() {
    const m = S.isMuted();
    for (const id of ['muteBtn', 'muteTitle']) $(id).textContent = m ? '🔇' : '🔊';
  }

  function init() {
    // the logo from the name in js/title.js: the last word big, the words before it small on top
    const words = window.JP_TITLE.split(' ');
    $('logo1').textContent = words.slice(0, -1).join(' ');
    $('logo2').textContent = words[words.length - 1];
    $('logo').setAttribute('aria-label', window.JP_TITLE);
    W.init($('game'));
    resize();
    window.addEventListener('resize', resize);
    portraits = Kit.portraits(HUMANS.map((id) => Kit.roster.get(id)), { size: 128 });
    document.querySelectorAll('[data-face]').forEach((img) => { img.src = portraits[img.dataset.face]; });
    // the menus
    document.querySelectorAll('.who').forEach((b) => b.addEventListener('click', () => { S.init(); pickWho(b.dataset.who); }));
    document.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => { S.init(); toggleLevel(b.dataset.lvl); }));
    $('playBtn').addEventListener('click', () => play());
    $('againBtn').addEventListener('click', () => play());
    $('homeBtn').addEventListener('click', home);
    $('homeBtn2').addEventListener('click', home);
    $('resumeBtn').addEventListener('click', togglePause);
    $('pauseBtn').addEventListener('click', togglePause);
    for (const id of ['muteBtn', 'muteTitle']) $(id).addEventListener('click', () => { S.init(); S.toggleMute(); });
    S.onMute(syncMute);
    syncMute();
    $('buddyBtn').addEventListener('click', () => { if (humans.length === 2) highFive(); else callBuddy(); });
    // buttons on the HUD never start a flight
    for (const id of ['pauseBtn', 'muteBtn', 'buddyBtn']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
    const touch = $('touch');
    touch.addEventListener('pointerdown', onPointerDown);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) touch.addEventListener(ev, onPointerUp);
    touch.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { touches.clear(); keyHold.p0.clear(); keyHold.p1.clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'fly' && !paused) togglePause(); });
    Kit.lang.onChange(() => { refreshTitle(); });
    refreshTitle();
    setup(true);
    L.go(rc);
    $('loading').remove();
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- for tests
  function info() {
    return {
      mode, paused, demo, seed: rc && rc.seed, x: rc && +rc.x.toFixed(2), exit: rc && rc.lab.exitX, phase: rc && rc.phase,
      flyers: rc ? rc.flyers.map((f) => ({ id: f.id, cpu: f.cpu, level: f.level, y: +f.y.toFixed(2), coins: f.coins, hearts: f.hearts, out: f.out, shield: +f.shield.toFixed(2), zaps: f.zaps, blocks: f.blocks })) : [],
      buddy: buddy && buddy.phase, results,
    };
  }
  window.game = {
    // o: { who: 'teddy' | 'tommy' | 'both', level: 'easy' | 'normal' | { teddy, tommy }, seed }
    start(o) {
      o = o || {};
      if (o.who) save.who = o.who;
      if (o.level) Object.assign(save.level, typeof o.level === 'string' ? { teddy: o.level, tommy: o.level } : o.level);
      play(o.seed);
      return info();
    },
    // run the game for this many seconds right now (60 steps a second) and draw it
    step(sec) {
      const n = Math.max(1, Math.round((sec || 0) * 60));
      for (let i = 0; i < n; i++) update(1 / 60);
      W.render();
      return info();
    },
    hold(i, on) { forced[i] = !!on; },
    // fly the solver's own inputs for player 1 (proves the lab you're looking at is flyable)
    autopilot() {
      const sol = L.solve(rc.lab, rc.flyers[0].level);
      rc.flyers[0].bot = null;
      const inp = (i, r) => (i === 0 ? sol.holds[Math.floor((r.ft - 1) / sol.decide)] === 1 : holdFor(i));
      rc._auto = inp;
      return sol.ok;
    },
    call: () => callBuddy(),
    highFive: () => highFive(),
    pause: () => togglePause(),
    home: () => home(),
    again: () => play(),
    info,
    check(o) { return JP.checks.run(Object.assign({ quick: true }, o)); },
    prove() { return JP.checks.run({ quick: true, prove: true }); },
    get race() { return rc; },
    get save() { return save; },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
