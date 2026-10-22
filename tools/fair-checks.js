/* Fairness checks in the real page: node tools/fair.js runs this (muted) and prints { ok, checks }.
   The flying is done the way a kid does it: real keydown / keyup events on window (Space for 1 player, W and ↑ for two),
   decided every 0.1 s from what is drawn on screen. What's checked is drawn against what the rules did:

   - touch: a coin that touches the human's body on screen (8 px or more) is his; a coin he collects did touch him on
     screen (within 8 px). Body = the box round his meshes (not the jet flames), coin = its drawn disc, both projected
     with the game's own camera.
   - rivals: a coin drawn for the human never disappears unless the human took it, and Foxy and Froggy never take one
     of his coins (they still collect their own).
   - level: everyone flies at the same x, so on screen everyone is at the same x too (within 1.5 px): nobody looks ahead;
     and each flyer shows at his true height as seen in the human's plane, so two at the same height look level.
   - twoPlayers: the same touch rule for both brothers at once (a coin touching both goes to one of them).
   - keysRace (only where the game has its own coins per rival): whole races flown with keys against Foxy and Froggy:
     a pretend 5-year-old (slow, wobbly) wins EASY most of the time, a careful pretend 8-year-old (who steers round the
     zappers) wins NORMAL sometimes: not never, not always.
   It works on the first version of the game too, which is how it was shown to fail there. */
async function () {
  const T = THREE, W = JP.world, L = JP.lab, scene = W.scene, cam = W.camera;
  const TOL = 8, COIN_R = 0.3;
  const checks = [];
  const newGame = !!(L.touches && game.race && true);
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true }));
  // one frame of the game; the new version can skip drawing the picture (the camera still moves)
  const frame = (draw) => (newGame ? game.step(1 / 60, draw) : game.step(1 / 60));
  const scr = (v) => {
    const p = v.clone().project(cam);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  };
  // each flyer's model: the game lists them (the first version didn't: there they stand exactly at their x and height)
  const roots = () => {
    const rc = game.race;
    if (game.roots) return game.roots;
    return rc.flyers.map((f) => scene.children.find((o) => o.isGroup && Math.abs(o.position.x - rc.x) < 1e-6 && Math.abs(o.position.y - f.y) < 1e-6) || null);
  };
  // the body's box on screen: every visible mesh except the additive jet flames
  const tmp = new T.Box3(), corner = new T.Vector3();
  function bodyRect(root) {
    const b = new T.Box3();
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || (o.material && o.material.blending === T.AdditiveBlending)) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      tmp.setFromObject(o);
      b.union(tmp);
    });
    let l = 1e9, r = -1e9, t = 1e9, bt = -1e9;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      const s = scr(corner);
      l = Math.min(l, s.x); r = Math.max(r, s.x); t = Math.min(t, s.y); bt = Math.max(bt, s.y);
    }
    return { l, r, t, b: bt };
  }
  // how far a disc reaches into a rectangle (px; negative = the gap between them)
  function overlap(rect, c) {
    const dx = Math.max(rect.l - c.x, 0, c.x - rect.r), dy = Math.max(rect.t - c.y, 0, c.y - rect.b);
    if (dx === 0 && dy === 0) return c.r + Math.min(c.x - rect.l, rect.r - c.x, c.y - rect.t, rect.b - c.y);
    return c.r - Math.hypot(dx, dy);
  }
  // the coins drawn right now: lab coin index -> world position (read back from the coin mesh)
  const coinMesh = () => scene.children.find((o) => o.isInstancedMesh);
  const m4 = new T.Matrix4(), pos = new T.Vector3();
  function drawnCoins() {
    const rc = game.race, cs = rc.lab.coins, mesh = coinMesh(), out = new Map();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m4);
      pos.setFromMatrixPosition(m4);
      let lo = 0, hi = cs.length - 1;
      // (the mesh keeps 32-bit floats: match to a millimetre)
      while (lo < hi) { const m = (lo + hi) >> 1; if (cs[m].x < pos.x - 1e-3) lo = m + 1; else hi = m; }
      for (let k = lo; k < cs.length && cs[k].x <= pos.x + 1e-3; k++) if (Math.abs(cs[k].y - pos.y) < 1e-3) { out.set(k, pos.clone()); break; }
    }
    return out;
  }
  const coinDisc = (p) => {
    const c = scr(p), e = scr(new T.Vector3(p.x + COIN_R, p.y, p.z));
    return { x: c.x, y: c.y, r: Math.abs(e.x - c.x) };
  };
  // a kid on a keyboard: every 0.1 s he looks at the next coin drawn ahead (or the open way) and holds or lets go
  function kid(i, code, o) {
    let held = false, want = false, n = 0, seed = 7 + i * 101 + (o.seed || 0);
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return (seen) => {
      const rc = game.race, f = rc.flyers[i];
      if (n++ % (o.react || 6) === 0) {
        let ty = L.pathY(rc.lab, rc.x + 1.5) + (o.off || 0), best = null;
        if (o.chase) for (const [k, p] of seen) if (p.x > rc.x + 0.6 && p.x < rc.x + 4 && (!best || p.x < best.x)) best = p;
        // a careful kid doesn't go for a coin with a zapper on the way to it
        if (best && o.careful) for (let u = 0; u <= 1.25 && best; u += 0.125) {
          const x = rc.x + (best.x - rc.x) * Math.min(u, 1) + Math.max(0, u - 1) * 4, y = f.y + (best.y - f.y) * Math.min(u, 1);
          if (L.hitZap(rc.lab, x, y, rc.t + ((x - rc.x) / 8), L.R + 0.3)) best = null;
        }
        if (best && rnd() < o.chase) ty = best.y + (o.miss || 0);
        ty += (rnd() - 0.5) * 2 * (o.wob || 0);
        want = ty - (f.y + f.vy * 0.22) > 0;
      }
      if (want !== held) { key(want ? 'keydown' : 'keyup', code); held = want; }
    };
  }
  const settle = () => new Promise((r) => setTimeout(r, 30));

  // ---------------------------------------------------------------- one flight, watched frame by frame
  async function watch(o) {
    game.start({ who: o.who, level: o.level, seed: o.seed });
    for (let i = 0; i < 210; i++) frame(false); // the 3-2-1
    const rc = game.race, humans = rc.flyers.filter((f) => !f.cpu);
    const kids = o.kids;
    const where = new Map(), maxOv = humans.map(() => new Map()), wasDrawn = new Map();
    const res = { touched: 0, collected: 0, misses: 0, problems: [], levelPx: 0, vanished: 0, cpuTookHuman: 0, cpuCoins: 0, frames: 0 };
    let prev = new Map();
    for (let n = 0; n < o.frames && game.info().mode === 'fly'; n++) {
      const seen = drawnCoins();
      for (const [k, p] of seen) where.set(k, p);
      kids.forEach((d) => d(seen));
      frame(o.draw);
      cam.updateMatrixWorld();
      res.frames++;
      // rivals: a drawn coin that's gone (and not yet passed) must be the human's
      const now = drawnCoins();
      for (const [k] of prev) {
        if (now.has(k) || rc.lab.coins[k].x < rc.x - 1.5) continue;
        const by = rc.taken[k] - 1;
        if (!(by >= 0 && !rc.flyers[by].cpu)) {
          res.vanished++;
          if (res.problems.length < 40) res.problems.push(`rivals: the coin at x = ${rc.lab.coins[k].x.toFixed(1)} disappeared from the screen, taken by ${by >= 0 ? rc.flyers[by].id : 'nobody'}`);
        }
      }
      prev = now;
      // touch: the overlap of every coin near each human, as drawn
      const rs = roots();
      humans.forEach((h, hi) => {
        const root = rs[h.i];
        if (!root) return;
        const rect = bodyRect(root);
        for (const [k, p] of where) {
          if (Math.abs(p.x - rc.x) > 2.5) continue;
          const ov = overlap(rect, coinDisc(p));
          if (!maxOv[hi].has(k) || ov > maxOv[hi].get(k)) maxOv[hi].set(k, ov);
        }
      });
      // level: everyone's centre at the same x on screen, and every flyer shown where his place in the rules shows in
      // the human's plane (so two at the same height look level too)
      const hx = rs[humans[0].i] ? scr(rs[humans[0].i].position).x : null;
      rs.forEach((r, i) => {
        if (!r || hx === null) return;
        res.seenFlyers = Math.max(res.seenFlyers || 0, rs.filter(Boolean).length);
        const s1 = scr(r.position), want = scr(new T.Vector3(rc.x, rc.flyers[i].y, 0));
        res.levelPx = Math.max(res.levelPx, Math.abs(s1.x - hx));
        res.heightPx = Math.max(res.heightPx || 0, Math.abs(s1.y - want.y));
      });
    }
    for (const c of ['Space', 'KeyW', 'ArrowUp']) key('keyup', c);
    // the verdict for every coin a human came near
    for (let k = 0; k < rc.lab.coins.length; k++) {
      const by = rc.taken[k] - 1;
      if (by >= 0 && rc.flyers[by].cpu) res.cpuTookHuman++;
      const ovs = humans.map((h, hi) => (maxOv[hi].has(k) ? maxOv[hi].get(k) : -1e9));
      const touchedBy = humans.filter((h, hi) => ovs[hi] >= TOL).map((h) => h.i);
      const gotIt = by >= 0 && !rc.flyers[by].cpu ? by : -1;
      if (touchedBy.length) res.touched++;
      if (gotIt >= 0) res.collected++;
      if (Math.max(...ovs) <= -TOL && Math.max(...ovs) > -1e8) res.misses++;
      const x = rc.lab.coins[k].x.toFixed(1);
      // (with two brothers, the first to touch it gets it: the other may be touching it more by then, but the one who
      // got it must have been touching it on screen too, within the 8 px)
      const hiGot = humans.findIndex((h) => h.i === gotIt);
      if (touchedBy.length && !touchedBy.includes(gotIt) && (gotIt < 0 || ovs[hiGot] < -TOL)) res.problems.push(`touch: the coin at x = ${x} touched ${touchedBy.map((i) => rc.flyers[i].id).join(' and ')} on screen by ${Math.round(Math.max(...ovs))} px but went to ${by >= 0 ? rc.flyers[by].id : 'nobody'}`);
      if (gotIt >= 0) {
        const hi = humans.findIndex((h) => h.i === gotIt);
        if (ovs[hi] < -1e8) res.problems.push(`touch: ${rc.flyers[gotIt].id} got the coin at x = ${x}, which was never drawn near him`);
        else if (ovs[hi] < -TOL) res.problems.push(`touch: ${rc.flyers[gotIt].id} got the coin at x = ${x} with a ${Math.round(-ovs[hi])} px gap on screen`);
      }
    }
    res.cpuCoins = rc.flyers.filter((f) => f.cpu).map((f) => f.coins);
    return res;
  }

  // ---------------------------------------------------------------- 1 player, EASY, with Foxy and Froggy
  const one = [];
  for (const seed of [3, 8]) one.push(await watch({ who: 'teddy', level: 'easy', seed, frames: 60 * 26, kids: [kid(0, 'Space', { chase: 0.8, wob: 0.3 })] }));
  await settle();
  const sum = (k) => one.reduce((a, r) => a + r[k], 0);
  const touchP = one.flatMap((r) => r.problems.filter((p) => p.startsWith('touch')));
  checks.push({ name: 'touch', ok: !touchP.length && sum('touched') > 10, stat: `2 flights with Space: ${sum('touched')} coins touched on screen, ${sum('collected')} collected, ${sum('misses')} clear misses`, problems: touchP.slice(0, 6) });
  const rivalP = one.flatMap((r) => r.problems.filter((p) => p.startsWith('rivals')));
  const cpuTook = sum('cpuTookHuman');
  if (cpuTook) rivalP.push(`rivals: Foxy and Froggy took ${cpuTook} of the human's coins`);
  checks.push({ name: 'rivals', ok: !rivalP.length, stat: `coins that vanished from the human's screen without him: ${sum('vanished')}; his coins taken by Foxy or Froggy: ${cpuTook}; Foxy and Froggy's own coins: ${one.map((r) => r.cpuCoins.join(' + ')).join(', ')}`, problems: rivalP.slice(0, 6) });
  const lvl = Math.max(...one.map((r) => r.levelPx)), hgt = Math.max(...one.map((r) => r.heightPx || 0));
  const lvlP = [];
  if (lvl > 1.5) lvlP.push(`level: a rival at the same x looked ${lvl.toFixed(0)} px ahead or behind`);
  if (hgt > 1.5) lvlP.push(`level: a flyer was drawn ${hgt.toFixed(0)} px higher or lower than his height in the game`);
  if (Math.min(...one.map((r) => r.seenFlyers || 0)) < 3) lvlP.push('level: could not find all three flyers on screen');
  checks.push({ name: 'level', ok: !lvlP.length, stat: `the farthest any flyer's centre was from the human's across the screen: ${lvl.toFixed(1)} px; from his true height: ${hgt.toFixed(1)} px`, problems: lvlP });

  // ---------------------------------------------------------------- 2 players, both EASY: W for Teddy, ↑ for Tommy
  const two = await watch({ who: 'both', level: 'easy', seed: 5, frames: 60 * 26, kids: [kid(0, 'KeyW', { chase: 0.8, wob: 0.3 }), kid(1, 'ArrowUp', { chase: 0.5, wob: 0.5, off: 0.8 })] });
  const twoP = two.problems.filter((p) => p.startsWith('touch'));
  checks.push({ name: 'twoPlayers', ok: !twoP.length && two.touched > 10 && two.levelPx <= 1.5, stat: `2 players with W and ↑: ${two.touched} coins touched on screen, ${two.collected} collected, ${two.misses} clear misses, level within ${two.levelPx.toFixed(1)} px`, problems: twoP.slice(0, 6) });

  // ---------------------------------------------------------------- whole races with keys (the new game only)
  if (newGame && L.cpuBot) {
    const race = async (level, o, seed) => {
      game.start({ who: 'teddy', level, seed });
      for (let i = 0; i < 210; i++) frame(false);
      const d = kid(0, 'Space', o);
      for (let n = 0; n < 60 * 140 && game.info().mode === 'fly'; n++) { d(drawnCoins()); frame(false); }
      key('keyup', 'Space');
      for (let n = 0; n < 60 * 8 && game.info().mode !== 'over'; n++) frame(false);
      const r = game.info();
      return { won: !!(r.results && r.results.order[0].id === 'teddy' && r.results.order[0].coins > r.results.order[1].coins), me: r.flyers[0].coins, cpu: r.flyers.slice(1).map((f) => f.coins), mode: r.mode };
    };
    const easy = [], normal = [];
    for (const s of [21, 22, 23]) easy.push(await race('easy', { chase: 0.6, wob: 0.6, react: 12 }, s));
    for (const s of [31, 32, 33, 34]) normal.push(await race('normal', { chase: 0.9, wob: 0.15, react: 6, careful: true }, s));
    const ew = easy.filter((r) => r.won).length, nw = normal.filter((r) => r.won).length;
    const kp = [];
    if (ew < 2) kp.push(`keysRace: the 5-year-old won only ${ew} of 3 EASY races`);
    if (nw < 1 || nw > 3) kp.push(`keysRace: the careful 8-year-old won ${nw} of 4 NORMAL races (should be sometimes)`);
    checks.push({ name: 'keysRace', ok: !kp.length, stat: `pretend 5-year-old (slow, wobbly, Space) won ${ew} of 3 EASY races: ${easy.map((r) => `${r.me} vs ${r.cpu.join('/')}`).join(', ')}; careful pretend 8-year-old won ${nw} of 4 NORMAL races: ${normal.map((r) => `${r.me} vs ${r.cpu.join('/')}`).join(', ')}`, problems: kp });
  }
  game.home();
  return JSON.stringify({ ok: checks.every((c) => c.ok), version: newGame ? 'own coins per rival' : 'first version (shared coins)', checks });
}
