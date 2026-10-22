/* TT Jetpack: the headless checks of the rules (js/lab.js), in the page (game.check(), game.prove()) and in node
   (node tools/check.js). Each check returns { name, ok, stat, problems }. prove: true also breaks the game on purpose,
   one way per check, and makes sure the check notices.

   - passable: every lab the generator makes can be flown to the exit with the game's own physics (EASY labs, NORMAL
     labs, and an EASY lab flown with NORMAL physics, which is Teddy on NORMAL with Tommy on EASY), and EASY ones even
     with 0.3 m of extra wobble room. The solver's inputs are then flown through the real race: no zaps, exit reached.
   - layout: every zapper stays clear of the safe line and inside the lab, every coin is out of zapper reach, the same
     seed makes the same lab, and there's enough to do.
   - bounds, frames, feel: the physics. Nobody leaves the lab or goes faster than the top speeds; 30, 60, 144 and a
     jumpy frame rate give exactly the same flight; EASY climbs and falls more gently than NORMAL.
   - zaps: hits are where the beams are, EASY never knocks you out, NORMAL does after 3, the shield blocks.
   - easyRace: on EASY a wobbly 5-year-old beats Foxy and Froggy most of the time. */
(function () {
  'use strict';
  const JP = (window.JP = window.JP || {});
  const L = JP.lab;
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

  function replay(lab, level, sol) {
    const rc = L.race({ lab, flyers: [{ id: 'teddy', level }] });
    L.go(rc);
    const D = sol.decide;
    const input = (i, r) => sol.holds[Math.floor((r.ft - 1) / D)] === 1;
    for (let n = 0; n < 200000 && rc.phase !== 'done'; n++) L.step(rc, 1 / 60, input);
    return { zaps: rc.flyers[0].zaps, finished: rc.finished, x: rc.x };
  }

  const CHECKS = {
    passable(o) {
      const problems = [];
      const combos = [['easy', 'easy', 0], ['easy', 'easy', 0.3], ['normal', 'normal', 0], ['easy', 'normal', 0]];
      let n = 0, replayed = 0, peak = 1e9;
      for (const seed of o.seeds) {
        for (const [labLv, lv, margin] of combos) {
          if (o.quick && margin) continue;
          const lab = L.generate(seed, labLv, o.labOpts);
          const r = L.solve(lab, lv, { margin });
          n++;
          const what = `${labLv.toUpperCase()} lab ${seed} flown on ${lv.toUpperCase()}${margin ? ` with ${margin} m of wobble room` : ''}`;
          if (!r.ok) {
            problems.push(`${what}: no way through at x = ${f2(r.x)} m`);
            continue;
          }
          peak = Math.min(peak, r.peak);
          if (!margin) {
            const rep = replay(lab, lv, r);
            replayed++;
            if (rep.zaps || !rep.finished) problems.push(`${what}: the solver's inputs got ${rep.zaps} zaps, reached x = ${f2(rep.x)}`);
          }
        }
      }
      return { stat: `${n} labs flown to the exit, ${replayed} replays with 0 zaps, fewest ways through at any moment ${peak}`, problems };
    },

    layout(o) {
      const problems = [];
      let zaps = 0, coins = 0, minLine = 1e9, minCoin = 1e9;
      for (const seed of o.seeds) {
        for (const lv of ['easy', 'normal']) {
          const P = L.LEVELS[lv];
          const lab = L.generate(seed, lv, o.labOpts);
          const again = L.generate(seed, lv, o.labOpts);
          const strip = (lb) => JSON.stringify({ p: lb.path, z: lb.zaps.map((z) => [z.x1, z.y1, z.x2, z.y2, z.cx, z.cy, z.len, z.w]), c: lb.coins });
          if (strip(lab) !== strip(again)) problems.push(`${lv} lab ${seed} came out different the second time`);
          zaps += lab.zaps.length;
          coins += lab.coins.length;
          if (lab.zaps.length < (lv === 'easy' ? 10 : 30)) problems.push(`${lv} lab ${seed}: only ${lab.zaps.length} zappers`);
          if (lab.coins.length < (lv === 'easy' ? 120 : 200)) problems.push(`${lv} lab ${seed}: only ${lab.coins.length} coins`);
          for (const z of lab.zaps) {
            const g = L.lineGap(lab, z);
            minLine = Math.min(minLine, g);
            if (g < P.clear - 1e-6) problems.push(`${lv} lab ${seed}: a ${z.kind} zapper at x = ${f2(z.xa)} is ${f2(g)} m from the safe line (needs ${f2(P.clear)})`);
            const ys = z.spin ? [z.cy - z.len / 2, z.cy + z.len / 2] : [z.y1, z.y2];
            if (Math.min(...ys) < 0.19 || Math.max(...ys) > L.H - 0.19) problems.push(`${lv} lab ${seed}: a zapper pokes out of the lab at x = ${f2(z.xa)}`);
            if (z.xb > lab.exitX) problems.push(`${lv} lab ${seed}: a zapper past the exit`);
          }
          for (const c of lab.coins) {
            const g = L.zapGap(lab, c.x, c.y);
            minCoin = Math.min(minCoin, g);
            if (g < L.R + L.ZH + 0.1) problems.push(`${lv} lab ${seed}: the coin at x = ${f2(c.x)}, y = ${f2(c.y)} is inside a zapper's reach (${f2(g)} m)`);
            if (c.y < L.Y_MIN - 1e-9 || c.y > L.Y_MAX + 1e-9) problems.push(`${lv} lab ${seed}: a coin out of reach at y = ${f2(c.y)}`);
          }
        }
      }
      return { stat: `${o.seeds.length * 2} labs, ${zaps} zappers at least ${f2(minLine)} m from the safe line, ${coins} coins at least ${f2(minCoin)} m from a beam`, problems };
    },

    bounds() {
      const problems = [];
      let top = 0, maxUp = 0, maxDown = 0;
      for (const lv of ['easy', 'normal']) {
        const P = L.phys(lv), rnd = L.rng(lv === 'easy' ? 11 : 12);
        const f = { y: L.Y_MIN, vy: 0 };
        let hold = false, next = 0;
        for (let k = 0; k < 120 * 180; k++) {
          if (k >= next) {
            hold = rnd() < 0.55;
            next = k + 1 + Math.floor(rnd() * 160);
          }
          L.physStep(f, hold, P, L.STEP);
          if (!isFinite(f.y) || !isFinite(f.vy)) { problems.push(`${lv}: the flyer became NaN`); break; }
          if (f.y < L.Y_MIN - 1e-9 || f.y > L.Y_MAX + 1e-9) { problems.push(`${lv}: the flyer left the lab (y = ${f2(f.y)})`); break; }
          if (f.vy > L.LEVELS[lv].vyUp + 1e-9 || f.vy < L.LEVELS[lv].vyDown - 1e-9) { problems.push(`${lv}: too fast (${f2(f.vy)} m/s)`); break; }
          top = Math.max(top, f.y);
          maxUp = Math.max(maxUp, f.vy);
          maxDown = Math.min(maxDown, f.vy);
        }
      }
      return { stat: `3 minutes of random jetting on each level: highest ${f2(top)} m (ceiling ${f2(L.Y_MAX)}), fastest ${f2(maxUp)} up, ${f2(-maxDown)} down`, problems };
    },

    frames() {
      const problems = [];
      const N = 120 * 40;
      const run = (frame) => {
        const rc = L.race({ seed: 5, level: 'easy', flyers: [{ id: 'teddy' }, { id: 'foxy', cpu: true, bot: L.cpuBot('foxy', 'easy') }, { id: 'froggy', cpu: true, bot: L.cpuBot('froggy', 'easy') }] });
        L.go(rc);
        rc.stopAt = N;
        const rnd = L.rng(99);
        // the kid's hands: a pattern in time, the same whatever the frame rate
        const input = (i, r) => Math.sin(r.ft * 0.011) + Math.sin(r.ft * 0.047) > -0.2;
        for (let n = 0; n < 100000 && rc.ticks < N; n++) L.step(rc, frame === 'jumpy' ? 1 / 200 + rnd() * (1 / 20 - 1 / 200) : 1 / frame, input);
        return JSON.stringify({ x: rc.x, f: rc.flyers.map((f) => [f.y, f.vy, f.coins, f.zaps]), t: rc.ticks });
      };
      const base = run(60);
      for (const fr of [30, 144, 'jumpy']) if (run(fr) !== base) problems.push(`${fr} frames a second flies differently from 60`);
      return { stat: `40 s with Foxy and Froggy at 30, 60, 144 and jumpy frame rates: ${problems.length ? 'different' : 'identical'}`, problems };
    },

    feel() {
      const problems = [];
      const time = (lv, hold, from) => {
        const P = L.phys(lv), f = { y: from, vy: 0 };
        for (let k = 1; k < 120 * 10; k++) {
          L.physStep(f, hold, P, L.STEP);
          if (hold ? f.y >= L.Y_MAX : f.y <= L.Y_MIN) return k * L.STEP;
        }
        return Infinity;
      };
      const up = { easy: time('easy', true, L.Y_MIN), normal: time('normal', true, L.Y_MIN) };
      const down = { easy: time('easy', false, L.Y_MAX), normal: time('normal', false, L.Y_MAX) };
      if (!(up.easy <= 1.8)) problems.push(`EASY takes ${f2(up.easy)} s to climb from floor to ceiling (should be under 1.8)`);
      if (!(up.normal <= 1.2)) problems.push(`NORMAL takes ${f2(up.normal)} s to climb (should be under 1.2)`);
      if (!(up.easy > up.normal + 0.2)) problems.push(`EASY doesn't climb more gently than NORMAL (${f2(up.easy)} vs ${f2(up.normal)} s)`);
      if (!(down.easy > down.normal + 0.2)) problems.push(`EASY doesn't fall more gently than NORMAL (${f2(down.easy)} vs ${f2(down.normal)} s)`);
      const E = L.phys('easy'), N = L.phys('normal');
      if (!(E.vyUp < N.vyUp && -E.vyDown < -N.vyDown)) problems.push('EASY top speeds are not slower than NORMAL');
      if (!(L.LEVELS.easy.speed < L.LEVELS.normal.speed)) problems.push('the EASY lab is not slower than the NORMAL lab');
      return { stat: `floor to ceiling: EASY ${f2(up.easy)} s, NORMAL ${f2(up.normal)} s; ceiling to floor: EASY ${f2(down.easy)} s, NORMAL ${f2(down.normal)} s`, problems };
    },

    zaps() {
      const problems = [];
      // a beam from (10, 2) to (10, 5) and a spinner at (20, 3.6)
      const lab = { level: 'easy', exitX: 100, path: [{ x: 0, y: 1 }, { x: 100, y: 1 }], coins: [], zaps: [{ x1: 10, y1: 2, x2: 10, y2: 5 }, { spin: true, cx: 20, cy: 3.6, len: 3, a0: 0, w: Math.PI / 2 }] };
      lab.zaps.forEach((z) => L.ends(z, 0));
      // the same index the generator builds
      const g = L.generate(1, 'easy');
      g.zaps = lab.zaps;
      g.coins = [];
      g.exitX = 100;
      g.path = lab.path;
      const reach = L.R + L.ZH;
      const t1 = (x, y, t) => !!L.hitZap(reindex(g), x, y, t || 0, L.R);
      if (!t1(10 - reach + 0.01, 3.5)) problems.push('a flyer just touching a beam is not hit');
      if (t1(10 - reach - 0.01, 3.5)) problems.push('a flyer just missing a beam is hit');
      if (!t1(10, 5 + reach - 0.01)) problems.push('a flyer just touching an orb is not hit');
      if (t1(10, 5 + reach + 0.01)) problems.push('a flyer just above an orb is hit');
      // the spinner: flat at t = 0, standing up a second later (a quarter turn)
      if (!t1(21.4, 3.6, 0) || t1(21.4, 3.6, 1)) problems.push('the spinner is not where its turn says');
      if (!t1(20, 5.0, 1) || t1(20, 5.0, 0)) problems.push('the spinner standing up is not where its turn says');
      // EASY never knocks you out; NORMAL does after 3; the shield blocks; you're safe for a moment after a zap
      const sit = (level) => {
        const rc = L.race({ lab: g, flyers: [{ id: 'teddy', level }] });
        L.go(rc);
        const f = rc.flyers[0];
        f.coins = 40;
        // hover in the beam's height band all the way past it, then come back again and again
        for (let pass = 0; pass < 50 && rc.phase !== 'done'; pass++) {
          rc.x = 9;
          for (let k = 0; k < 120 && rc.phase !== 'done'; k++) {
            f.y = 3.5;
            f.vy = 0;
            L.step(rc, 1 / 120, () => false);
            rc.x = Math.min(rc.x, 10);
          }
        }
        return { f, rc };
      };
      const e = sit('easy');
      if (e.f.out) problems.push('EASY knocked the flyer out');
      if (e.f.zaps < 15) problems.push(`EASY: only ${e.f.zaps} zaps in 50 passes through a beam`);
      if (e.f.coins < 40 - 3 * e.f.zaps) problems.push('EASY: a zap cost more than 3 coins');
      const n = sit('normal');
      if (!n.f.out || n.f.zaps !== 3 || !n.rc.over) problems.push(`NORMAL: after ${n.f.zaps} zaps the flyer is ${n.f.out ? 'out' : 'still flying'} (should be out after 3, run over)`);
      const sh = L.race({ lab: g, flyers: [{ id: 'teddy', level: 'normal' }] });
      L.go(sh);
      L.shield(sh, 0, 3);
      sh.x = 9.9;
      sh.flyers[0].y = 3.5;
      for (let k = 0; k < 120; k++) {
        sh.flyers[0].y = 3.5;
        sh.flyers[0].vy = 0;
        sh.x = 9.9;
        L.step(sh, 1 / 120, () => false);
      }
      if (sh.flyers[0].zaps !== 0 || sh.flyers[0].blocks < 1) problems.push(`with the shield on, a beam zapped ${sh.flyers[0].zaps} times (blocked ${sh.flyers[0].blocks})`);
      return { stat: `hits within 1 cm of the beams and orbs, spinner on time; EASY: ${e.f.zaps} zaps, never out; NORMAL: out after ${n.f.zaps}; shield: ${sh.flyers[0].blocks} block, 0 zaps`, problems };
    },

    easyRace(o) {
      const problems = [];
      let wins = 0, races = 0, kidCoins = 0, cpuCoins = 0;
      for (const seed of o.seeds) {
        const rc = L.race({ seed, level: 'easy', flyers: [{ id: 'tommy', bot: 'wobbly5' }, { id: 'foxy', cpu: true, bot: L.cpuBot('foxy', 'easy') }, { id: 'froggy', cpu: true, bot: L.cpuBot('froggy', 'easy') }] });
        L.go(rc);
        for (let n = 0; n < 200000 && rc.phase !== 'done'; n++) L.step(rc, 1 / 60, () => false);
        races++;
        if (!rc.finished) problems.push(`EASY lab ${seed}: the race didn't reach the exit`);
        const order = L.places(rc);
        if (rc.flyers[0].place === 1) wins++;
        kidCoins += rc.flyers[0].coins;
        cpuCoins += (rc.flyers[1].coins + rc.flyers[2].coins) / 2;
        if (rc.flyers.some((f) => f.out)) problems.push(`EASY lab ${seed}: someone got knocked out`);
        void order;
      }
      if (wins < races * 0.7) problems.push(`the wobbly 5-year-old won only ${wins} of ${races} EASY races against Foxy and Froggy`);
      return { stat: `wobbly 5-year-old won ${wins} of ${races} EASY races (${Math.round(kidCoins / races)} coins a race; Foxy and Froggy ${Math.round(cpuCoins / races)})`, problems };
    },
  };
  // the zaps check builds its own little lab: rebuild the lookup boxes after swapping the zappers in
  function reindex(lab) {
    if (lab._indexed !== lab.zaps) {
      lab.buckets = [];
      lab.zaps.forEach((z, i) => {
        const xa = z.spin ? z.cx - z.len / 2 : Math.min(z.x1, z.x2), xb = z.spin ? z.cx + z.len / 2 : Math.max(z.x1, z.x2);
        z.xa = xa;
        z.xb = xb;
        for (let b = Math.floor((xa - 1.5) / 4); b <= Math.floor((xb + 1.5) / 4); b++) (lab.buckets[b] = lab.buckets[b] || []).push(i);
      });
      lab._indexed = lab.zaps;
    }
    return lab;
  }

  // each way of breaking the game, and the check that has to notice
  const BREAKS = [
    { name: 'wall', check: 'passable', why: 'a zapper from floor to ceiling', labOpts: { broken: 'wall' } },
    { name: 'narrow', check: 'passable', why: 'gates too narrow to fly through', labOpts: { broken: 'narrow' } },
    { name: 'heavy', check: 'passable', why: 'a jetpack too weak to lift you', phys: 'heavy' },
    { name: 'coinInZap', check: 'layout', why: 'a coin inside a zapper', labOpts: { broken: 'coinInZap' } },
    { name: 'noClamp', check: 'bounds', why: 'no floor, ceiling or top speed', phys: 'noClamp' },
    { name: 'rawdt', check: 'frames', why: 'one physics step per frame', phys: 'rawdt' },
    { name: 'easyHard', check: 'feel', why: 'EASY flies like NORMAL', phys: 'easyHard' },
    { name: 'noShield', check: 'zaps', why: 'the shield does nothing', phys: 'noShield' },
    { name: 'cpuStrong', check: 'easyRace', why: 'Foxy and Froggy go all out on EASY', phys: 'cpuStrong' },
  ];

  function run(o) {
    o = o || {};
    const t0 = Date.now();
    const quick = !!o.quick;
    const seeds = o.seeds || (quick ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const raceSeeds = quick ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const opts = (name) => ({ seeds: name === 'easyRace' ? raceSeeds : seeds, quick });
    const results = [];
    for (const name of Object.keys(CHECKS)) {
      if (o.only && o.only !== name) continue;
      L.breakIt(null);
      const r = CHECKS[name](opts(name));
      results.push({ name, ok: !r.problems.length, stat: r.stat, problems: r.problems });
    }
    const prove = [];
    if (o.prove) {
      for (const b of BREAKS) {
        if (o.only && o.only !== b.check) continue;
        L.breakIt(b.phys || null);
        let r;
        try {
          r = CHECKS[b.check](Object.assign(opts(b.check), { seeds: b.check === 'easyRace' ? raceSeeds : [1, 2], quick: true, labOpts: b.labOpts }));
        } finally {
          L.breakIt(null);
        }
        prove.push({ name: b.name, check: b.check, why: b.why, caught: r.problems.length > 0, first: r.problems[0] || 'NOT CAUGHT' });
      }
    }
    return { ok: results.every((r) => r.ok) && prove.every((p) => p.caught), results, prove, ms: Date.now() - t0 };
  }

  JP.checks = { run, CHECKS, BREAKS, replay };
})();
