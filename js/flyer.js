/* TT Jetpack: the flyers. Teddy and Tommy are the kit's blocky boys (Kit.people) with a jetpack on their backs; Foxy
   and Froggy are the same bodies with a fox's and a frog's head. JP.flyer.make(id) builds one; update(dt, s) poses it
   from what the rules say (running on the floor, jetting, falling, zapped and dizzy, out in a bubble, shielded), and
   setMode('celebrate') does the signature moves on the podium: Teddy's boxing and 🏀 jump shot, Tommy's Y with
   peace fingers ✌️, a wave for everyone else. airPose(mode) does a signature move in mid-air (the brother's visit).

   Hierarchy: root (the body's centre = the hit circle) > tilt (rotation.z) > turn (yaw) > fit (scale) > person */
(function () {
  'use strict';
  const JP = (window.JP = window.JP || {});
  const T = THREE, G = Kit.gfx, people = Kit.people;

  const SCALE = 0.68; // a 2 m kit person flies at 1.36 m
  const CENTER = 1.05; // body centre height in the person's own units
  const FLY_YAW = -Math.PI / 2 - 0.55; // facing +x, turned toward the camera so faces show
  const FACE_YAW = -Math.PI;
  const POSE_YAW = { boxing: -Math.PI + 0.75, jumpshot: -Math.PI / 2 - 0.5 };
  const AIR_YAW = { peace: -Math.PI + 0.45, wave: -Math.PI + 0.5, boxing: -Math.PI + 0.75, jumpshot: -Math.PI + 0.5 };
  const SEG_T = { boxing: 2.1, jumpshot: 1.9 };
  const RELEASE = 0.62;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);

  const LOOKS = {
    foxy: { head: 'human', skin: '#ff8a3c', top: '#2f6bff', bottom: '#1d2a55', shoes: '#ff8a3c', shirt: 'tee', print: 'star', hair: null },
    froggy: { head: 'human', skin: '#69c94e', top: '#ffd400', bottom: '#2f7d4f', shoes: '#69c94e', shirt: 'tee', print: 'bolt', hair: null },
  };
  const NAMES = { teddy: 'TEDDY', tommy: 'TOMMY', foxy: 'FOXY', froggy: 'FROGGY' };
  const TAGS = { teddy: '#8cc2ff', tommy: '#ffb02e', foxy: '#ffb27a', froggy: '#a6f08a' };
  const PACKS = { teddy: ['#e8382f', '#c9d6e8'], tommy: ['#ff8a1f', '#2f6bff'], foxy: ['#ffffff', '#ff8a3c'], froggy: ['#2fd0ff', '#ffd400'] };

  // a fox's or a frog's head in place of the boy's (same size, facing -z like the body)
  function animalHead(kind, head) {
    head.children.forEach((c) => { c.visible = false; });
    const fur = G.std(kind === 'foxy' ? '#ff8a3c' : '#69c94e'), dark = G.std('#1b1a22'), white = G.std('#ffffff');
    const box = (w, h, d, m, x, y, z) => G.mesh(new T.BoxGeometry(w, h, d), m, x, y, z, head, false);
    box(0.54, 0.48, 0.48, fur, 0, 0, 0);
    for (const s of [-1, 1]) {
      box(0.08, 0.1, 0.03, dark, s * 0.12, 0.06, -0.25);
      box(0.03, 0.03, 0.02, white, s * 0.1, 0.09, -0.27);
      if (kind === 'foxy') {
        box(0.17, 0.17, 0.07, fur, s * 0.19, 0.27, 0).rotation.z = Math.PI / 4;
        box(0.09, 0.09, 0.02, dark, s * 0.19, 0.27, -0.04).rotation.z = Math.PI / 4;
      } else {
        box(0.17, 0.13, 0.17, fur, s * 0.15, 0.27, -0.06);
        box(0.08, 0.08, 0.03, dark, s * 0.15, 0.29, -0.15);
        box(0.035, 0.035, 0.02, white, s * 0.14, 0.31, -0.17);
      }
    }
    if (kind === 'foxy') {
      box(0.24, 0.16, 0.14, G.std('#fff1e0'), 0, -0.1, -0.29);
      box(0.08, 0.06, 0.04, dark, 0, -0.05, -0.37);
      box(0.56, 0.12, 0.5, G.std('#fff1e0'), 0, -0.2, 0);
    } else {
      box(0.36, 0.04, 0.02, G.std('#2a6a1f'), 0, -0.12, -0.245);
      box(0.56, 0.14, 0.5, G.std('#d8f5b0'), 0, -0.19, 0);
    }
  }

  // the jetpack: two tanks on a back plate, nozzles with flames under them
  function jetpack(id) {
    const [body, trim] = PACKS[id] || ['#e8382f', '#c9d6e8'];
    const g = new T.Group();
    const bm = G.std(body, { roughness: 0.4, metalness: 0.3 }), tm = G.std(trim, { roughness: 0.3, metalness: 0.6 }), dk = G.std('#2b3550', { roughness: 0.5 });
    G.mesh(new T.BoxGeometry(0.62, 0.66, 0.2), dk, 0, 0, 0.1, g);
    const flames = [];
    const outer = new T.MeshBasicMaterial({ color: '#ff9a1f', transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const inner = new T.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
    for (const x of [-0.19, 0.19]) {
      G.mesh(new T.CylinderGeometry(0.15, 0.15, 0.74, 14), bm, x, 0.02, 0.36, g);
      G.mesh(new T.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bm, x, 0.39, 0.36, g);
      G.mesh(new T.CylinderGeometry(0.155, 0.155, 0.08, 14), tm, x, 0.18, 0.36, g, false);
      G.mesh(new T.CylinderGeometry(0.09, 0.14, 0.16, 12), tm, x, -0.43, 0.36, g);
      const f = new T.Group();
      f.position.set(x, -0.51, 0.36);
      const o = new T.Mesh(new T.ConeGeometry(0.12, 0.7, 10), outer);
      o.rotation.x = Math.PI;
      o.position.y = -0.35;
      const i = new T.Mesh(new T.ConeGeometry(0.065, 0.42, 8), inner);
      i.rotation.x = Math.PI;
      i.position.y = -0.21;
      f.add(o, i);
      g.add(f);
      flames.push(f);
    }
    g.userData.flames = flames;
    return g;
  }

  // a soap bubble / shield: a ring with a shine, drawn once
  let bubbleTex = null;
  function bubbleTexture() {
    if (bubbleTex) return bubbleTex;
    const [c, g] = G.makeCanvas(256, 256);
    const grd = g.createRadialGradient(128, 128, 60, 128, 128, 124);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    grd.addColorStop(0.92, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(84, 78, 26, 14, -0.7, 0, Math.PI * 2);
    g.fill();
    return (bubbleTex = G.toTexture(c));
  }

  // which move of a celebration loop is playing at `time`, and how far into it
  function segment(seq, time) {
    const total = seq.reduce((a, m) => a + (SEG_T[m] || 1.8), 0);
    let t = time % total;
    for (const m of seq) {
      const d = SEG_T[m] || 1.8;
      if (t < d) return { mode: m, t };
      t -= d;
    }
    return { mode: seq[0], t: 0 };
  }
  // Kit poses like 'wave' and 'peace' stride while they pose; standing still, the legs settle instead
  const STRIDING = { wave: 1, peace: 1, give: 1, run: 1, walk: 1 };
  function standPose(p, ph, mode, k) {
    people.pose(p, ph, mode, k);
    if (STRIDING[mode]) {
      p.legL.rotation.x += (0 - p.legL.rotation.x) * Math.min(1, k * 2);
      p.legR.rotation.x += (0 - p.legR.rotation.x) * Math.min(1, k * 2);
      p.hips.position.y = p.hipY;
    }
  }

  // o.scale: size relative to a 2 m person (the brother uses his roster buddyScale); o.tag: a name label over his head
  function make(id, o) {
    o = o || {};
    const entry = Kit.roster.get(id) || { id, look: LOOKS[id], signature: null };
    const look = LOOKS[id] || entry.look;
    const scale = o.scale ? SCALE * (o.scale / 0.85) : SCALE;
    const root = new T.Group(), tilt = new T.Group(), turn = new T.Group(), fit = new T.Group();
    root.add(tilt);
    tilt.add(turn);
    turn.add(fit);
    fit.scale.setScalar(scale);
    fit.position.y = -CENTER * scale;
    const p = people.build(Object.assign({}, look, { peace: true }));
    if (LOOKS[id]) animalHead(id, p.head);
    fit.add(p.root);
    p.root.traverse((q) => { if (q.isMesh) q.castShadow = true; });
    const jet = jetpack(id);
    jet.position.set(0, 0.36, 0.18 + (look.pack ? 0.23 : 0));
    p.hips.add(jet);
    const flames = jet.userData.flames;
    const headTop = (2.2 - CENTER) * scale;

    let tag = null;
    if (o.tag) {
      tag = G.nameTag(NAMES[id] || id.toUpperCase(), TAGS[id] || '#ffffff');
      tag.scale.multiplyScalar(0.72);
      tag.position.y = headTop + 0.4;
      root.add(tag);
    }
    // Foxy and Froggy fly further back, so when they're level with you they're right behind you: a little face over
    // the head that shows through, Froggy's a bit higher, so you can always see where they are
    let badge = null;
    if (o.badge) {
      badge = new T.Sprite(new T.SpriteMaterial({ map: G.emojiTexture(o.badge), depthTest: false, depthWrite: false, transparent: true }));
      badge.renderOrder = 10;
      badge.scale.setScalar(0.42);
      badge.position.y = headTop + (o.badgeUp || 0.3);
      root.add(badge);
    }
    const bubble = new T.Sprite(new T.SpriteMaterial({ map: bubbleTexture(), color: '#7fe7ff', transparent: true, depthWrite: false }));
    bubble.scale.setScalar(2.05 * (scale / SCALE));
    bubble.visible = false;
    root.add(bubble);
    const stars = new T.Group();
    const starMat = new T.SpriteMaterial({ map: G.emojiTexture('⭐'), depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const s = new T.Sprite(starMat);
      s.scale.setScalar(0.32);
      stars.add(s);
    }
    stars.visible = false;
    root.add(stars);

    const seq = entry.signature && entry.signature.length ? entry.signature.slice() : ['wave'];
    let ball = null;
    const ballV = new T.Vector3(), hA = new T.Vector3(), hB = new T.Vector3();
    if (seq.includes('jumpshot')) {
      ball = new T.Sprite(new T.SpriteMaterial({ map: G.emojiTexture('🏀'), depthWrite: false }));
      ball.scale.setScalar(0.34);
      ball.visible = false;
      root.add(ball);
    }
    const st = { phase: 0, yaw: FLY_YAW, pitch: 0, mode: 'fly', modeT: 0, spin: 0, thrust: 0, hop: 0, shot: false, air: null, airT: 0, blinkT: 0 };
    turn.rotation.y = st.yaw;

    function updateBall(t, dt, hopStep) {
      if (t < 0 || t > RELEASE + 1.1) {
        ball.visible = false;
        st.shot = false;
        return;
      }
      ball.visible = true;
      if (t < RELEASE) {
        root.updateMatrixWorld(true);
        people.handWorld(p, -1, hA);
        people.handWorld(p, 1, hB);
        ball.position.copy(hA).add(hB).multiplyScalar(0.5);
        root.worldToLocal(ball.position);
        ball.position.y += 0.14;
        st.shot = false;
        return;
      }
      if (!st.shot) {
        st.shot = true;
        ballV.set(2.2, 4.4, 0);
        try { Kit.sound.swish(); } catch (e) { /* sound is optional */ }
      }
      ballV.y -= 9.8 * dt;
      ball.position.addScaledVector(ballV, dt);
      ball.position.y -= hopStep;
    }

    return {
      id, entry, root, person: p, headTop, tag, badge, bubble, seq,
      get hop() { return st.hop; },
      get mode() { return st.mode; },
      get move() { return st.mode === 'celebrate' ? segment(seq, st.modeT) : null; },
      // fly (the rules drive it), celebrate, stand
      setMode(m) {
        if (m !== st.mode) {
          st.mode = m;
          st.modeT = 0;
        }
      },
      // a signature move in mid-air (null: back to flying); returns seconds into it
      airPose(m) {
        if (m !== st.air) {
          st.air = m;
          st.airT = 0;
        }
        return st.airT;
      },
      // nozzle world positions (smoke puffs)
      nozzles(out) {
        jet.updateWorldMatrix(true, true);
        for (let i = 0; i < flames.length; i++) flames[i].getWorldPosition(out[i]);
        return out;
      },
      // s: { y, vy, hold, ground, dizzy, safe, shield, out } from the rules (or made up, for the brother)
      update(dt, s) {
        s = s || {};
        st.modeT += dt;
        st.airT += dt;
        const m = st.mode;
        const flying = m === 'fly';
        const cele = m === 'celebrate' ? segment(seq, st.modeT) : null;
        const air = flying && !s.out && !(s.dizzy > 0) ? st.air : null;
        const wantYaw = air ? AIR_YAW[air] || FLY_YAW : flying ? FLY_YAW : cele ? POSE_YAW[cele.mode] || FACE_YAW : FACE_YAW;
        st.yaw += (wantYaw - st.yaw) * damp(7, dt);
        turn.rotation.y = st.yaw;
        // tilt: lean into the climb, a shake when zapped (a shake, not a somersault: his outline stays where the
        // rules say his body is, so coins still go to him exactly when they touch him), a slow roll in the bubble
        if (flying && s.dizzy > 0) {
          st.spin += dt * 30;
          tilt.rotation.z = Math.sin(st.spin) * 0.22;
        } else if (flying && s.out) {
          st.spin += dt * 0.8;
          tilt.rotation.z = Math.sin(st.spin) * 0.5;
        } else {
          const want = flying && !air && !s.ground ? clamp((s.vy || 0) * 0.03, -0.25, 0.22) : 0;
          st.spin = 0;
          st.pitch += (want - st.pitch) * damp(10, dt);
          tilt.rotation.z = st.pitch;
        }
        // limbs
        const lastHop = st.hop;
        st.hop = 0;
        if (flying) {
          if (s.out) people.pose(p, st.phase, 'fall', damp(6, dt));
          else if (air) {
            st.phase += dt * 7;
            standPose(p, air === 'boxing' ? st.airT * 6 : st.phase, air, damp(14, dt));
            p.legL.rotation.x = 0.3 + Math.sin(st.phase) * 0.15;
            p.legR.rotation.x = 0.1 - Math.sin(st.phase) * 0.15;
          } else if (s.dizzy > 0) {
            // zapped: arms flail back and forth (not up over his head, which would poke out of his outline)
            st.phase += dt * 14;
            people.pose(p, st.phase, 'jet', damp(14, dt));
            p.armL.rotation.x = 0.4 + Math.sin(st.phase) * 0.6;
            p.armR.rotation.x = 0.4 - Math.sin(st.phase) * 0.6;
          }
          else if (s.ground && !s.hold) {
            st.phase += dt * 13;
            people.pose(p, st.phase, 'run', damp(16, dt));
          } else {
            st.phase += dt * 8;
            people.pose(p, st.phase, 'jet', damp(12, dt));
            if (!s.hold && (s.vy || 0) < -2) {
              // falling: arms up a little, like a parachute without the parachute
              p.armL.rotation.x = 0.6;
              p.armR.rotation.x = 0.6;
            }
          }
        } else if (m === 'celebrate') {
          const { mode, t } = cele;
          standPose(p, st.modeT * 6, mode, damp(12, dt));
          if (mode === 'jumpshot') st.hop = t > 0.15 && t < 0.95 ? Math.sin((Math.PI * (t - 0.15)) / 0.8) * 0.6 : 0;
          else if (mode === 'boxing') st.hop = Math.abs(Math.sin(st.modeT * 7)) * 0.04;
          else st.hop = Math.abs(Math.sin(st.modeT * 5.5)) * 0.22;
          if (ball) updateBall(mode === 'jumpshot' ? t : -1, dt, st.hop - lastHop);
        } else standPose(p, st.modeT * 3, 'stand', damp(10, dt));
        if (ball && m !== 'celebrate') ball.visible = false;
        fit.position.y = -CENTER * scale + st.hop;

        // flames: big while holding, a flicker while falling, none on the ground or on the podium
        st.thrust += ((flying && s.hold && !(s.dizzy > 0) && !s.out ? 1 : 0) - st.thrust) * damp(14, dt);
        const on = flying && !s.out && !(s.ground && !s.hold);
        const f = on ? 0.25 + st.thrust * 0.95 + Math.random() * 0.12 : 0;
        for (const fl of flames) {
          fl.visible = f > 0.02;
          fl.scale.set(0.8 + f * 0.4, f * 1.2, 0.8 + f * 0.4);
        }
        // shield / out bubble
        const shield = s.shield > 0 && !s.out;
        bubble.visible = shield ? !(s.shield < 1.5 && Math.floor(s.shield * 8) % 2) : !!s.out;
        bubble.material.color.set(s.out ? '#ffd6f5' : '#7fe7ff');
        bubble.material.rotation = st.modeT * 0.4;
        // blink while safe after a zap
        st.blinkT += dt;
        p.root.visible = !(s.safe > 0 && !(s.dizzy > 0) && Math.floor(st.blinkT * 14) % 2);
        // dizzy stars
        stars.visible = s.dizzy > 0;
        if (stars.visible) {
          stars.position.y = headTop + 0.1;
          const a = st.modeT * 6;
          stars.children.forEach((q, i) => {
            const b = a + (i * Math.PI * 2) / 3;
            q.position.set(Math.cos(b) * 0.42, Math.sin(b * 2) * 0.05, Math.sin(b) * 0.42);
          });
        }
      },
    };
  }

  JP.flyer = { make, NAMES, SCALE, CENTER };
})();
