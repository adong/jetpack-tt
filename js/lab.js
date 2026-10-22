/* TT Jetpack: the rules, with no drawing (it runs in node too, for the checks).
   The lab is a long corridor along +x: floor at y = 0, ceiling at y = H. Everyone flies at the same x, carried along at
   the lab's speed; holding the jet pushes you up, letting go lets you fall. Zappers are capsules (a beam between two
   orbs), some of them spinning; coins sit along the safe line.

   - generate(seed, level) builds a lab: first a safe line through it whose slope the jetpack can follow, then zappers
     placed only where they stay well clear of that line, then coins along it.
   - solve(lab, level) proves a lab can be flown: it tries every hold / let-go choice (every 0.1 s) with the game's own
     physics step and collision test, keeping one flyer per little box of height and speed, until one reaches the exit.
     A lab it says yes to comes with the inputs that fly it.
   - race / step / tick: the game itself (flyers, coins, zaps, hearts, shields, Foxy and Froggy), at fixed 1/120 s steps. */
(function () {
  'use strict';
  const JP = (window.JP = window.JP || {});

  const H = 7.2; // floor to ceiling
  const R = 0.42; // the flyer's hit circle (his body is 1.3 m tall: near misses are misses)
  const ZH = 0.22; // a zapper's hit radius around its beam (the orbs are drawn a bit bigger, so a touch reads as fair)
  const Y_MIN = 0.66, Y_MAX = H - 0.66; // the flyer's centre: feet on the floor, head on the ceiling
  const STEP = 1 / 120;
  const PICK = R + 0.34; // coin pick-up distance
  const BUCKET = 4; // zapper lookup boxes, metres of x

  // speed: the lab's speed at the start and at the exit. thrust / gravity in m/s², vyUp / vyDown the top speeds.
  // clear: how far every zapper stays from the safe line (beam axis to the flyer's centre).
  const LEVELS = {
    easy: {
      id: 'easy', speed: 5.0, speedEnd: 5.6, thrust: 27, gravity: 12, vyUp: 5.2, vyDown: -5.6,
      length: 420, start: 24, beat: 10.5, gap: 12.5, clear: R + ZH + 1.15, spinners: false,
      hearts: 0, zapCoins: 3, dizzy: 0.7, safe: 2.2, coinStep: 1.0,
      kinds: { vert: 4, pair: 3, bar: 3, diag: 2 },
    },
    normal: {
      id: 'normal', speed: 7.5, speedEnd: 10, thrust: 45, gravity: 21, vyUp: 8, vyDown: -9.5,
      length: 720, start: 28, beat: 8.0, gap: 8.6, clear: R + ZH + 0.75, spinners: true,
      hearts: 3, zapCoins: 5, dizzy: 0.55, safe: 1.6, coinStep: 0.85,
      kinds: { vert: 4, pair: 4, bar: 3, diag: 3, spin: 2 },
    },
  };
  // broken on purpose, for the checks that have to notice: heavy (the jet can't lift you), noClamp (no floor, ceiling
  // or top speed), easyHard (EASY flies like NORMAL), rawdt (one big step per frame), noShield, cpuStrong
  let broken = null;
  function phys(level) {
    const P = LEVELS[level];
    if (broken === 'heavy') return Object.assign({}, P, { gravity: P.thrust * 1.05 });
    if (broken === 'easyHard' && level === 'easy') return LEVELS.normal;
    return P;
  }

  // ---------------------------------------------------------------- small maths
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // distance from point (px, py) to segment (ax, ay)-(bx, by)
  function segPoint(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = ax + dx * u - px, ey = ay + dy * u - py;
    return Math.sqrt(ex * ex + ey * ey);
  }
  // distance between two segments (they never need to cross here: crossing counts as 0)
  function segSeg(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    return Math.min(segPoint(a.x, a.y, c.x, c.y, d.x, d.y), segPoint(b.x, b.y, c.x, c.y, d.x, d.y),
      segPoint(c.x, c.y, a.x, a.y, b.x, b.y), segPoint(d.x, d.y, a.x, a.y, b.x, b.y));
  }

  // ---------------------------------------------------------------- the lab
  function pathY(lab, x) {
    const p = lab.path;
    if (x <= p[0].x) return p[0].y;
    let lo = 0, hi = p.length - 1;
    if (x >= p[hi].x) return p[hi].y;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (p[m].x <= x) lo = m; else hi = m;
    }
    const a = p[lo], b = p[hi];
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  function speedAt(lab, x) {
    const L = LEVELS[lab.level];
    return L.speed + (L.speedEnd - L.speed) * clamp(x / lab.exitX, 0, 1);
  }
  // a zapper's ends at time t (spinners turn round their centre)
  function ends(z, t) {
    if (!z.spin) return z;
    const a = z.a0 + z.w * t, c = Math.cos(a) * z.len * 0.5, s = Math.sin(a) * z.len * 0.5;
    z.x1 = z.cx - c; z.y1 = z.cy - s; z.x2 = z.cx + c; z.y2 = z.cy + s;
    return z;
  }
  // the closest a zapper ever comes to the safe line (a spinner sweeps a disc)
  function lineGap(lab, z) {
    const p = lab.path;
    const xa = (z.spin ? z.cx - z.len / 2 : Math.min(z.x1, z.x2)) - 12, xb = (z.spin ? z.cx + z.len / 2 : Math.max(z.x1, z.x2)) + 12;
    let best = 1e9;
    for (let i = 0; i < p.length - 1; i++) {
      if (p[i + 1].x < xa || p[i].x > xb) continue;
      const d = z.spin ? segPoint(z.cx, z.cy, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y) - z.len / 2
        : segSeg({ x: z.x1, y: z.y1 }, { x: z.x2, y: z.y2 }, p[i], p[i + 1]);
      if (d < best) best = d;
    }
    return best;
  }
  // how far a point is from the nearest zapper's beam (spinners: from their disc)
  function zapGap(lab, x, y) {
    let best = 1e9;
    for (const z of lab.zaps) {
      if (z.spin) {
        const d = Math.hypot(x - z.cx, y - z.cy) - z.len / 2;
        if (d < best) best = d;
      } else {
        const d = segPoint(x, y, z.x1, z.y1, z.x2, z.y2);
        if (d < best) best = d;
      }
    }
    return best;
  }
  // the same, looking only at the zappers near x (spinners count as their whole disc)
  function gapNear(lab, x, y) {
    const list = lab.buckets[Math.floor(x / BUCKET)];
    let best = 1e9;
    if (!list) return best;
    for (let k = 0; k < list.length; k++) {
      const z = lab.zaps[list[k]];
      const d = z.spin ? Math.hypot(x - z.cx, y - z.cy) - z.len / 2 : segPoint(x, y, z.x1, z.y1, z.x2, z.y2);
      if (d < best) best = d;
    }
    return best;
  }
  function index(lab) {
    lab.buckets = [];
    lab.zaps.forEach((z, i) => {
      const xa = z.spin ? z.cx - z.len / 2 : Math.min(z.x1, z.x2), xb = z.spin ? z.cx + z.len / 2 : Math.max(z.x1, z.x2);
      z.xa = xa;
      z.xb = xb;
      for (let b = Math.floor((xa - 1.5) / BUCKET); b <= Math.floor((xb + 1.5) / BUCKET); b++) (lab.buckets[b] = lab.buckets[b] || []).push(i);
    });
  }

  // opts.broken (for the checks): 'wall' puts one floor-to-ceiling zapper in the middle; 'narrow' makes every gate a
  // pair with no room between; 'coinInZap' drops a coin on a zapper.
  function generate(seed, level, opts) {
    opts = opts || {};
    const L = LEVELS[level], rnd = rng(seed * 7919 + (level === 'normal' ? 17 : 3));
    const r = (a, b) => a + rnd() * (b - a);
    const lab = { seed, level, exitX: L.length, path: [], zaps: [], coins: [] };

    // 1. the safe line: from the floor up to the middle, then a new height every beat, never steeper than the jet can
    // climb or fall at the top speed (with plenty to spare: corners need time)
    const up = (0.55 * L.vyUp) / L.speedEnd, down = (0.55 * -L.vyDown) / L.speedEnd;
    let x = 0, y = Y_MIN;
    lab.path.push({ x, y });
    x = L.start * 0.7;
    y = H * 0.5;
    lab.path.push({ x, y });
    while (x < L.length + 40) {
      const nx = x + L.beat * r(0.8, 1.2);
      const lo = Math.max(Y_MIN + 0.3, y - down * (nx - x)), hi = Math.min(Y_MAX - 0.3, y + up * (nx - x));
      // mostly a real change of height, now and then a straight bit
      let ny = rnd() < 0.2 ? y : lo + rnd() * (hi - lo);
      if (Math.abs(ny - y) < 0.8 && rnd() < 0.6) ny = clamp(y + (y < H / 2 ? 1 : -1) * r(1.2, 2.4), lo, hi);
      x = nx;
      y = ny;
      lab.path.push({ x, y });
    }

    // 2. zappers, each one kept at least `clear` from the safe line
    const clear = L.clear, lo = 0.2, hi = H - 0.2;
    const kinds = Object.keys(L.kinds), weights = kinds.map((k) => L.kinds[k]), wsum = weights.reduce((a, b) => a + b, 0);
    const pickKind = () => {
      let u = rnd() * wsum;
      for (let i = 0; i < kinds.length; i++) if ((u -= weights[i]) < 0) return kinds[i];
      return kinds[0];
    };
    const fits = (z) => {
      if (z.spin) return z.cy - z.len / 2 >= lo && z.cy + z.len / 2 <= hi;
      return Math.min(z.y1, z.y2) >= lo - 1e-9 && Math.max(z.y1, z.y2) <= hi + 1e-9;
    };
    // push a zapper straight up or down, away from the line, until it's clear (or give up). An anchored one (a gate
    // standing on the floor or hanging from the ceiling) moves only its end nearer the line, so it gets shorter.
    const settle = (z, dir, need, anchored) => {
      for (let k = 0; k < 12; k++) {
        const g = lineGap(lab, z);
        if (g >= need) return fits(z);
        const d = (need - g) + 0.06;
        if (z.spin) z.cy += dir * d;
        else if (anchored) { if (dir < 0) z.y2 -= d; else z.y1 += d; }
        else { z.y1 += dir * d; z.y2 += dir * d; }
        if (!fits(z) || (anchored && z.y2 - z.y1 < 1)) return false;
      }
      return false;
    };
    const vertical = (xc, below, len) => {
      const py = pathY(lab, xc);
      if (below) {
        const top = py - clear - r(0, 0.5), bot = Math.max(lo, top - len);
        return { x1: xc, y1: bot, x2: xc, y2: top };
      }
      const bot = py + clear + r(0, 0.5), top = Math.min(hi, bot + len);
      return { x1: xc, y1: bot, x2: xc, y2: top };
    };
    const add = (z, dir, anchored) => {
      if (!settle(z, dir, clear, anchored)) return false;
      if (!z.spin && Math.hypot(z.x2 - z.x1, z.y2 - z.y1) < 1.0) return false;
      lab.zaps.push(z);
      return true;
    };
    let bx = L.start;
    for (;;) {
      bx += L.gap * r(0.75, 1.25);
      if (bx > L.length - 10) break;
      const kind = pickKind(), py = pathY(lab, bx);
      if (kind === 'vert') {
        const below = py > H / 2 ? rnd() < 0.75 : rnd() < 0.25;
        const z = vertical(bx, below, r(1.8, 3.8));
        z.kind = kind;
        add(z, below ? -1 : 1);
      } else if (kind === 'pair') {
        const gap = opts.broken === 'narrow' ? R * 0.9 : clear;
        const a = { x1: bx, y1: lo, x2: bx, y2: py - gap, kind }, b = { x1: bx, y1: py + gap, x2: bx, y2: hi, kind };
        if (opts.broken === 'narrow') {
          lab.zaps.push(a, b);
          continue;
        }
        if (a.y2 - a.y1 >= 1) add(a, -1, true);
        if (b.y2 - b.y1 >= 1) add(b, 1, true);
      } else if (kind === 'bar' || kind === 'diag') {
        const below = py > H / 2 ? rnd() < 0.7 : rnd() < 0.3, dir = below ? -1 : 1;
        const len = kind === 'bar' ? r(2.6, 5) : r(2.4, 3.8);
        const ang = kind === 'bar' ? 0 : (rnd() < 0.5 ? 1 : -1) * r(0.5, 1.0);
        const c = (Math.cos(ang) * len) / 2, s = (Math.sin(ang) * len) / 2;
        const cy = py + dir * (clear + Math.abs(s) + r(0, 0.9));
        add({ x1: bx - c, y1: cy - s, x2: bx + c, y2: cy + s, kind }, dir);
      } else if (kind === 'spin') {
        if (bx < L.length * 0.3) continue;
        const len = r(2.4, 3.2), below = py > H / 2 ? rnd() < 0.7 : rnd() < 0.3, dir = below ? -1 : 1;
        const z = { spin: true, cx: bx, cy: py + dir * (clear + len / 2 + r(0, 0.4)), len, a0: r(0, Math.PI), w: (rnd() < 0.5 ? -1 : 1) * r(1.3, 2.0), kind };
        if (add(z, dir)) ends(z, 0);
      }
    }
    if (opts.broken === 'wall') lab.zaps.push({ x1: L.length * 0.5, y1: lo, x2: L.length * 0.5, y2: hi, kind: 'pair' });
    lab.zaps.sort((a, b) => (a.spin ? a.cx : a.x1) - (b.spin ? b.cx : b.x1));
    index(lab);

    // 3. coins: rows along the safe line (sometimes a little above or below it), never near a zapper
    const safe = R + ZH + 0.18;
    const p = lab.path;
    for (let i = 1; i < p.length - 1; i++) {
      if (p[i].x > L.length - 4 || rnd() < 0.4) continue;
      const off = rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1) * r(0.5, 0.9);
      const xa = p[i].x + r(0.5, 2), xb = Math.min(p[i + 1].x - r(0.5, 2), L.length - 4);
      for (let cx = xa; cx <= xb; cx += L.coinStep) {
        const cy = clamp(pathY(lab, cx) + off, Y_MIN, Y_MAX);
        if (zapGap(lab, cx, cy) >= safe) lab.coins.push({ x: cx, y: cy });
      }
    }
    // a few bonus blocks of coins in the open
    for (let k = 0; k < L.length / 60; k++) {
      const cx0 = r(L.start + 10, L.length - 12), cy0 = r(Y_MIN + 0.3, Y_MAX - 1.2);
      const blk = [];
      for (let ix = 0; ix < 4; ix++) for (let iy = 0; iy < 3; iy++) blk.push({ x: cx0 + ix * 0.7, y: cy0 + iy * 0.7 });
      if (blk.every((c) => zapGap(lab, c.x, c.y) >= safe + 0.3 && c.y <= Y_MAX)) lab.coins.push(...blk);
    }
    if (opts.broken === 'coinInZap' && lab.zaps.length) {
      const z = lab.zaps[Math.floor(lab.zaps.length / 2)];
      ends(z, 0);
      lab.coins.push({ x: (z.x1 + z.x2) / 2, y: (z.y1 + z.y2) / 2 });
    }
    lab.coins.sort((a, b) => a.x - b.x);
    return lab;
  }

  // does a flyer of radius r at (x, y) touch a zapper at time t? returns the zapper or null
  function hitZap(lab, x, y, t, r) {
    const list = lab.buckets[Math.floor(x / BUCKET)];
    if (!list) return null;
    const reach = r + ZH;
    for (let k = 0; k < list.length; k++) {
      const z = lab.zaps[list[k]];
      if (x < z.xa - reach || x > z.xb + reach) continue;
      if (z.spin) {
        const dx = x - z.cx, dy = y - z.cy;
        if (dx * dx + dy * dy > (z.len / 2 + reach) * (z.len / 2 + reach)) continue;
        ends(z, t);
      }
      if (segPoint(x, y, z.x1, z.y1, z.x2, z.y2) < reach) return z;
    }
    return null;
  }

  // ---------------------------------------------------------------- physics: one fixed step for one flyer
  function physStep(f, hold, P, dt) {
    const a = hold ? P.thrust - P.gravity : -P.gravity;
    f.vy += a * dt;
    if (broken !== 'noClamp') f.vy = clamp(f.vy, P.vyDown, P.vyUp);
    f.y += f.vy * dt;
    if (broken === 'noClamp') return;
    if (f.y <= Y_MIN) {
      f.y = Y_MIN;
      if (f.vy < 0) f.vy = 0;
    } else if (f.y >= Y_MAX) {
      f.y = Y_MAX;
      if (f.vy > 0) f.vy = 0;
    }
  }

  // ---------------------------------------------------------------- the solver
  // o.margin: fly with a bigger hit circle (a wobblier flyer); o.decide: ticks between choices (12 = 0.1 s)
  function solve(lab, level, o) {
    o = o || {};
    const P = phys(level), r = R + (o.margin || 0), D = o.decide || 12, yq = 0.1, vq = 0.5;
    let states = [{ y: Y_MIN, vy: 0, p: -1, h: 0 }];
    const hist = [];
    let x = 0, ft = 0, peak = 0;
    const xs = new Float64Array(D), ts = new Float64Array(D), f = { y: 0, vy: 0 };
    while (x < lab.exitX + 1) {
      for (let k = 0; k < D; k++) {
        x += speedAt(lab, x) * STEP;
        ft++;
        xs[k] = x;
        ts[k] = ft * STEP;
      }
      const seen = new Map(), list = [];
      for (let si = 0; si < states.length; si++) {
        const s = states[si];
        for (let hold = 1; hold >= 0; hold--) {
          f.y = s.y;
          f.vy = s.vy;
          let ok = true;
          for (let k = 0; k < D; k++) {
            physStep(f, hold, P, STEP);
            if (hitZap(lab, xs[k], f.y, ts[k], r)) { ok = false; break; }
          }
          if (!ok) continue;
          const key = Math.round(f.y / yq) * 4096 + Math.round(f.vy / vq) + 2048;
          if (!seen.has(key)) {
            seen.set(key, 1);
            list.push({ y: f.y, vy: f.vy, p: si, h: hold });
          }
        }
      }
      hist.push(list);
      if (!list.length) return { ok: false, x, peak };
      if (list.length > peak) peak = list.length;
      states = list;
    }
    // the inputs that fly it: walk back from any survivor
    const holds = new Uint8Array(hist.length);
    let i = 0;
    for (let s = hist.length - 1; s >= 0; s--) {
      const st = hist[s][i];
      holds[s] = st.h;
      i = st.p;
    }
    return { ok: true, x, peak, holds, decide: D };
  }

  // ---------------------------------------------------------------- the race
  // o: { seed, level (the lab's), flyers: [{ id, cpu, level, lane, bot }] }. Humans first (they win a coin tie).
  function race(o) {
    const lab = o.lab || generate(o.seed, o.level, o.labOpts);
    const flyers = o.flyers.map((d, i) => {
      const P = phys(d.level || lab.level);
      return {
        i, id: d.id, cpu: !!d.cpu, level: d.level || lab.level, lane: d.lane || 0, bot: d.bot || null,
        y: Y_MIN, vy: 0, hold: false, coins: 0, hearts: P.hearts, out: false, zaps: 0, blocks: 0,
        dizzy: 0, safe: 0, shield: 0, blockT: 0, streak: 0, lastCoin: -9, want: false, think: 0, best: 0,
      };
    });
    return { lab, flyers, x: 0, ft: 0, t: 0, acc: 0, ticks: 0, phase: 'count', taken: new Uint8Array(lab.coins.length), c0: 0, events: [], finished: false, over: false, stopAt: 0 };
  }
  function go(rc) {
    rc.phase = 'fly';
  }

  // the controller Foxy and Froggy fly with (and the checks' pretend kids): aim for the safe line a little ahead,
  // wobbling round it, and look again every `react` seconds
  const BOTS = {
    foxyEasy: { look: 0.25, kp: 2.5, react: 0.22, wob: 0.9, wobF: 0.9, bias: 0.4, chase: 0.3 },
    froggyEasy: { look: 0.25, kp: 2.2, react: 0.26, wob: 1.0, wobF: 0.7, bias: -0.45, chase: 0.25 },
    foxyNormal: { look: 0.12, kp: 4, react: 0.08, wob: 0.15, wobF: 1.3, bias: 0.05, chase: 0.6 },
    froggyNormal: { look: 0.12, kp: 4, react: 0.09, wob: 0.2, wobF: 1.1, bias: -0.05, chase: 0.5 },
    // a careful 8-year-old and a wobbly 5-year-old (checks only)
    careful8: { look: 0.12, kp: 4, react: 0.08, wob: 0.1, wobF: 1.7, bias: 0, chase: 1 },
    wobbly5: { look: 0.2, kp: 3, react: 0.18, wob: 0.5, wobF: 0.8, bias: 0, chase: 1 },
    exact: { look: 0.1, kp: 5, react: 0.05, wob: 0, wobF: 1, bias: 0, chase: 0 },
  };
  // a steady pseudo-random number from the tick and the flyer (the same on every run, whatever the frame rate)
  const noise = (ft, i) => {
    const v = Math.sin(ft * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  // which controller Foxy or Froggy uses on a level (cpuStrong, broken on purpose: they go all out on EASY too)
  function cpuBot(id, level) {
    const lv = broken === 'cpuStrong' ? 'normal' : level;
    return id + (lv === 'easy' ? 'Easy' : 'Normal');
  }
  function botHold(rc, f) {
    const b = BOTS[f.bot];
    if (rc.t >= f.think) {
      f.think = rc.t + b.react;
      const lab = rc.lab, v = speedAt(lab, rc.x), ax = rc.x + v * b.look;
      // where the line will be, and how fast it's climbing there
      let ty = pathY(lab, ax) + Math.sin(rc.t * b.wobF + f.i * 1.7) * b.wob + b.bias;
      let tvy = (pathY(lab, ax + 0.5) - pathY(lab, ax - 0.5)) * v;
      if (b.chase && noise(rc.ft, f.i) < b.chase) {
        // a coin just ahead, near the line: go for it
        const c = nextCoin(rc, rc.x + 0.5, rc.x + 3.5);
        const off = c ? c.y - pathY(lab, c.x) : 0;
        // follow the row of coins, unless that line runs into a zapper on the way
        if (c && Math.abs(off) < 1.0) {
          let ok = true;
          for (let d = 0; d <= 2.5 && ok; d += 0.5) ok = gapNear(lab, rc.x + d, pathY(lab, rc.x + d) + off) > R + ZH + 0.35;
          if (ok) ty = pathY(lab, ax) + off;
        }
      }
      ty = clamp(ty, Y_MIN, Y_MAX);
      f.want = b.kp * (ty - f.y) + (tvy - f.vy) > 0;
    }
    return f.want;
  }
  function nextCoin(rc, xa, xb) {
    const cs = rc.lab.coins;
    for (let k = rc.c0; k < cs.length && cs[k].x <= xb; k++) if (cs[k].x >= xa && !rc.taken[k]) return cs[k];
    return null;
  }

  // input(i, rc) -> hold? for the humans
  function tick(rc, input) {
    const lab = rc.lab, ev = rc.events;
    const flying = rc.phase === 'fly';
    if (flying) {
      rc.x += speedAt(lab, rc.x) * STEP;
      rc.ft++;
      rc.t = rc.ft * STEP;
    }
    rc.ticks++;
    // coins far behind are gone for good
    while (rc.c0 < lab.coins.length && lab.coins[rc.c0].x < rc.x - 2) rc.c0++;
    for (const f of rc.flyers) {
      const P = phys(f.level);
      if (f.out) {
        // floats in a bubble near the top, out of the way
        f.vy = 0;
        f.y += (H * 0.78 - f.y) * Math.min(1, STEP * 1.5);
        continue;
      }
      let hold = false;
      if (flying) hold = f.bot ? botHold(rc, f) : !!input(f.i, rc);
      f.hold = hold;
      physStep(f, hold && f.dizzy <= 0, P, STEP);
      if (f.dizzy > 0) f.dizzy -= STEP;
      if (f.safe > 0) f.safe -= STEP;
      if (f.shield > 0) f.shield -= STEP;
      if (f.blockT > 0) f.blockT -= STEP;
      if (!flying) continue;
      const z = hitZap(lab, rc.x, f.y, rc.t, R);
      if (z) {
        if (f.shield > 0 && broken !== 'noShield') {
          if (f.blockT <= 0) {
            f.blocks++;
            ev.push({ type: 'block', i: f.i, z });
          }
          f.blockT = 0.35;
        } else if (f.safe <= 0) zap(rc, f, P, z);
      }
    }
    // coins: each one in reach goes to whoever is closest to it (a tie goes to the first flyer, a human)
    if (flying) {
      for (let k = rc.c0; k < lab.coins.length; k++) {
        const c = lab.coins[k];
        if (c.x > rc.x + PICK) break;
        if (rc.taken[k]) continue;
        let who = null, best = PICK * PICK;
        for (const f of rc.flyers) {
          if (f.out) continue;
          const dx = c.x - rc.x, dy = c.y - f.y, d = dx * dx + dy * dy;
          if (d <= best) {
            if (who && d === best) continue;
            best = d;
            who = f;
          }
        }
        if (!who) continue;
        rc.taken[k] = 1 + who.i;
        who.streak = rc.t - who.lastCoin < 0.6 ? who.streak + 1 : 0;
        who.lastCoin = rc.t;
        who.coins++;
        ev.push({ type: 'coin', i: who.i, k, streak: who.streak });
      }
    }
    if (flying && rc.x >= lab.exitX) {
      rc.phase = 'done';
      rc.finished = true;
      ev.push({ type: 'exit' });
    }
  }
  function zap(rc, f, P, z) {
    f.zaps++;
    f.dizzy = P.dizzy;
    f.safe = P.safe;
    f.vy = -2.5;
    const lost = Math.min(f.coins, P.zapCoins);
    f.coins -= lost;
    rc.events.push({ type: 'zap', i: f.i, lost, z });
    if (P.hearts) {
      f.hearts--;
      if (f.hearts <= 0) {
        f.out = true;
        rc.events.push({ type: 'out', i: f.i });
        // every human out: the run is over
        if (rc.flyers.every((g) => g.out || g.cpu)) {
          rc.phase = 'done';
          rc.over = true;
          rc.events.push({ type: 'over' });
        }
      }
    }
  }
  // frame step: any dt, fixed 1/120 s ticks inside (rc.stopAt > 0 stops at that tick, for the checks)
  function step(rc, dt, input) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (broken === 'rawdt') return tickRaw(rc, input, dt);
    rc.acc += dt * 120;
    while (rc.acc >= 1 - 1e-7) {
      if (rc.stopAt && rc.ticks >= rc.stopAt) { rc.acc = 0; break; }
      rc.acc -= 1;
      tick(rc, input);
      if (rc.phase === 'done') { rc.acc = 0; break; }
    }
  }
  // broken on purpose (rawdt): one big step per frame, what a game without fixed steps would do
  function tickRaw(rc, input, dt) {
    if (rc.stopAt && rc.ticks >= rc.stopAt) return;
    const n = Math.max(1, Math.round(dt * 120));
    if (rc.phase === 'fly') {
      rc.x += speedAt(rc.lab, rc.x) * dt;
      rc.ft += n;
      rc.t = rc.ft * STEP;
    }
    rc.ticks += n;
    for (const f of rc.flyers) {
      if (f.out) continue;
      const hold = rc.phase === 'fly' && (f.bot ? botHold(rc, f) : !!input(f.i, rc));
      physStep(f, hold && f.dizzy <= 0, phys(f.level), dt);
    }
  }

  // the shield and the treat (the brother's visit)
  function shield(rc, i, sec) {
    const f = rc.flyers[i];
    f.shield = Math.max(f.shield, sec);
  }
  function treat(rc, i) {
    const f = rc.flyers[i], P = phys(f.level);
    if (P.hearts && f.hearts < P.hearts && !f.out) {
      f.hearts++;
      return true;
    }
    return false;
  }
  // places: everyone by coins, ties share a place
  function places(rc) {
    const order = rc.flyers.slice().sort((a, b) => b.coins - a.coins || a.i - b.i);
    let place = 0, last = -1;
    order.forEach((f, k) => {
      if (f.coins !== last) { place = k + 1; last = f.coins; }
      f.place = place;
    });
    return order;
  }

  JP.lab = {
    H, R, ZH, Y_MIN, Y_MAX, STEP, PICK, LEVELS, BOTS,
    rng, generate, solve, pathY, speedAt, ends, hitZap, zapGap, lineGap, physStep, phys,
    race, go, step, tick, shield, treat, places, botHold, cpuBot,
    breakIt(what) { broken = what || null; },
    get broken() { return broken; },
  };
})();
