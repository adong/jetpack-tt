/* TT Jetpack: the 3D lab. A side-on corridor (floor, ceiling, back wall with windows, benches, tanks and screens),
   the zappers (two emitter rods and crackling beams across the whole depth of the corridor, some spinning), the coins,
   the exit door with its landing pad and podium, and the sparks, smoke and confetti.
   Everything long is a pool that follows the camera: the lab is 420-720 m long but only ~45 m of it is ever built.
   The human flies in the front plane (z = 0) and his coins are drawn in that same plane, so a coin touches him on
   screen exactly when it touches him in the rules. Foxy and Froggy fly in their own lanes further back (js/game.js).
   The camera is centred on the racers' place along the lab (the human's x) and looks straight across, a little from
   above, with an off-centre view so the racers sit a third of the way in: everyone at the same x is at the same place
   across the screen whatever their depth, so nobody looks ahead, and the back lanes sit a touch higher. */
(function () {
  'use strict';
  const JP = (window.JP = window.JP || {});
  const T = THREE, G = Kit.gfx, LB = JP.lab;
  const H = LB.H;
  const PLANE_Z = 0; // the human's plane: his coins, the brightest beam and the zapper orbs are drawn here
  const LIFT = 1.2; // how far above the middle of the lab the camera stands: the back lanes show a touch higher
  const ZAP_BACK = -3.1, ZAP_FRONT = 0.45;
  const WALL_Z = -4.3, FRONT_Z = 1.6;
  const COIN_Z = PLANE_Z;
  const AHEAD = 34, BEHIND = 16; // how much of the lab is built around the camera

  let renderer, scene, camera, sun;
  const tex = {}, mat = {};
  let floorMesh, ceilMesh, wallMesh, stripeMesh, capMesh;
  let zapPool = [], coinMesh, coinDummy, props = [], exitG = null, lab = null;
  let parts = {}, time = 0;

  // ---------------------------------------------------------------- textures (canvas, no image files)
  function wallTexture() {
    const [c, g] = G.makeCanvas(512, 512);
    g.fillStyle = '#c9d6e8';
    g.fillRect(0, 0, 512, 512);
    // big panels with seams and rivets
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        const x = i * 256, y = j * 170;
        const grd = g.createLinearGradient(0, y, 0, y + 170);
        grd.addColorStop(0, '#d8e3f2');
        grd.addColorStop(1, '#b7c7dd');
        g.fillStyle = grd;
        g.fillRect(x + 4, y + 4, 248, 162);
        g.fillStyle = 'rgba(60,80,120,0.35)';
        for (const [rx, ry] of [[14, 14], [242, 14], [14, 156], [242, 156]]) {
          g.beginPath();
          g.arc(x + rx, y + ry, 4, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // a teal stripe at hand height and a darker skirting board
    g.fillStyle = '#25c2c8';
    g.fillRect(0, 300, 512, 26);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 296, 512, 4);
    g.fillStyle = '#6d7f9c';
    g.fillRect(0, 470, 512, 42);
    g.fillStyle = '#ffd400';
    for (let x = 0; x < 512; x += 64) g.fillRect(x + 8, 486, 30, 10);
    return G.toTexture(c, true);
  }
  function floorTexture() {
    const [c, g] = G.makeCanvas(256, 256);
    g.fillStyle = '#3a4658';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#445268' : '#3f4c61';
        g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
        g.strokeStyle = 'rgba(255,255,255,0.07)';
        g.lineWidth = 2;
        for (let k = 16; k < 128; k += 16) {
          g.beginPath();
          g.moveTo(i * 128 + k, j * 128 + 6);
          g.lineTo(i * 128 + k, j * 128 + 122);
          g.stroke();
        }
      }
    }
    return G.toTexture(c, true);
  }
  function stripeTexture() {
    const [c, g] = G.makeCanvas(256, 64);
    g.fillStyle = '#14121f';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffd400';
    for (let x = -64; x < 320; x += 64) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 32, 64);
      g.lineTo(x + 64, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
    return G.toTexture(c, true);
  }
  function ceilTexture() {
    const [c, g] = G.makeCanvas(256, 256);
    g.fillStyle = '#56657f';
    g.fillRect(0, 0, 256, 256);
    // glowing light panels
    g.fillStyle = '#fffbe6';
    g.shadowColor = '#fff3b0';
    g.shadowBlur = 18;
    g.fillRect(40, 70, 176, 116);
    g.shadowBlur = 0;
    g.strokeStyle = '#8d9bb5';
    g.lineWidth = 6;
    g.strokeRect(40, 70, 176, 116);
    return G.toTexture(c, true);
  }
  function cutTexture() {
    // the building cut open above the ceiling and under the floor: dark concrete with pipes
    const [c, g] = G.makeCanvas(256, 256);
    g.fillStyle = '#18223a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1f2b47';
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 14);
    g.fillStyle = '#2b3a5e';
    g.fillRect(0, 100, 256, 18);
    g.fillRect(0, 190, 256, 10);
    return G.toTexture(c, true);
  }
  // crackling bolts: 4 rows, each a different crackle, picked at random every few frames
  function boltTexture() {
    const [c, g] = G.makeCanvas(512, 256);
    for (let row = 0; row < 4; row++) {
      const y0 = row * 64 + 32;
      for (const [w, col, blur] of [[10, 'rgba(120,220,255,0.55)', 16], [4, '#e8fbff', 6]]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.shadowColor = '#7fe7ff';
        g.shadowBlur = blur;
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          g.moveTo(0, y0);
          for (let x = 0; x <= 512; x += 24) g.lineTo(x, y0 + (x === 0 || x === 512 ? 0 : (Math.random() - 0.5) * 34));
          g.stroke();
        }
      }
    }
    const t = G.toTexture(c);
    t.repeat.set(1, 0.25);
    return t;
  }
  function signTexture(text, bg, fg) {
    const [c, g] = G.makeCanvas(512, 160);
    g.fillStyle = bg;
    G.roundRect(g, 6, 6, 500, 148, 30);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#14121f';
    g.stroke();
    g.fillStyle = fg;
    g.font = `92px ${G.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = fg;
    g.shadowBlur = 18;
    g.fillText(text, 256, 86);
    return G.toTexture(c);
  }

  // ---------------------------------------------------------------- particles: a pool of point sprites
  function particles(n, size, additive) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const life = new Float32Array(n), max = new Float32Array(n), grav = new Float32Array(n), drag = new Float32Array(n);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
    const m = new T.PointsMaterial({ size, map: G.dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending });
    const pts = new T.Points(geo, m);
    pts.frustumCulled = false;
    scene.add(pts);
    const color = new T.Color(), base = new Float32Array(n * 3);
    let next = 0;
    return {
      emit(x, y, z, count, o) {
        for (let k = 0; k < count; k++) {
          const i = next;
          next = (next + 1) % n;
          color.set(Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color);
          const sp = o.spread || 0;
          pos[i * 3] = x + G.rand(-sp, sp);
          pos[i * 3 + 1] = y + G.rand(-sp, sp);
          pos[i * 3 + 2] = z + G.rand(-sp, sp) * 0.5;
          vel[i * 3] = (o.vx || 0) + G.rand(-o.speed, o.speed);
          vel[i * 3 + 1] = (o.vy || 0) + G.rand(-o.speed, o.speed);
          vel[i * 3 + 2] = G.rand(-o.speed, o.speed) * 0.4;
          life[i] = max[i] = G.rand(o.life * 0.6, o.life);
          grav[i] = o.gravity !== undefined ? o.gravity : 6;
          drag[i] = o.drag || 0;
          base[i * 3] = color.r;
          base[i * 3 + 1] = color.g;
          base[i * 3 + 2] = color.b;
        }
      },
      update(dt) {
        for (let i = 0; i < n; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          if (life[i] <= 0) {
            pos[i * 3 + 1] = -999;
            continue;
          }
          const d = Math.max(0, 1 - drag[i] * dt);
          vel[i * 3] *= d;
          vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt;
          vel[i * 3 + 2] *= d;
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const f = Math.min(1, (life[i] / max[i]) * 1.6);
          col[i * 3] = base[i * 3] * (additive ? f : 1);
          col[i * 3 + 1] = base[i * 3 + 1] * (additive ? f : 1);
          col[i * 3 + 2] = base[i * 3 + 2] * (additive ? f : 1);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
      clear() {
        for (let i = 0; i < n; i++) {
          life[i] = 0;
          pos[i * 3 + 1] = -999;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  }

  // ---------------------------------------------------------------- the room
  function buildRoom() {
    tex.wall = wallTexture();
    tex.floor = floorTexture();
    tex.stripe = stripeTexture();
    tex.ceil = ceilTexture();
    tex.cut = cutTexture();
    const len = 90;
    const plane = (w, h, m) => new T.Mesh(new T.PlaneGeometry(w, h), m);
    // back wall: one texture tile is 6 m wide and the full height
    tex.wall.repeat.set(len / 6, 1);
    wallMesh = plane(len, H, new T.MeshStandardMaterial({ map: tex.wall, roughness: 0.85 }));
    wallMesh.position.set(0, H / 2, WALL_Z);
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
    // floor (2 m tiles), its front edge with hazard stripes, the ceiling with light panels
    tex.floor.repeat.set(len / 2, (FRONT_Z - WALL_Z) / 2);
    floorMesh = plane(len, FRONT_Z - WALL_Z, new T.MeshStandardMaterial({ map: tex.floor, roughness: 0.55, metalness: 0.25 }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, (FRONT_Z + WALL_Z) / 2);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    tex.stripe.repeat.set(len / 1.6, 1);
    stripeMesh = plane(len, 0.4, new T.MeshStandardMaterial({ map: tex.stripe, roughness: 0.6 }));
    stripeMesh.position.set(0, -0.2, FRONT_Z);
    scene.add(stripeMesh);
    tex.ceil.repeat.set(len / 3, (FRONT_Z - WALL_Z) / 3);
    ceilMesh = plane(len, FRONT_Z - WALL_Z, new T.MeshStandardMaterial({ map: tex.ceil, emissive: '#ffffff', emissiveMap: tex.ceil, emissiveIntensity: 0.55, roughness: 0.9 }));
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(0, H, (FRONT_Z + WALL_Z) / 2);
    scene.add(ceilMesh);
    // the cut-open building above and below (tall screens see it)
    tex.cut.repeat.set(len / 4, 40 / 4);
    capMesh = new T.Group();
    const cm = new T.MeshBasicMaterial({ map: tex.cut });
    const above = plane(len, 40, cm), below = plane(len, 40, cm);
    above.position.set(0, H + 20, FRONT_Z);
    below.position.set(0, -0.4 - 20, FRONT_Z);
    capMesh.add(above, below);
    const lip = new T.MeshStandardMaterial({ color: '#8d9bb5', roughness: 0.6, metalness: 0.3 });
    const top = new T.Mesh(new T.BoxGeometry(len, 0.35, 0.3), lip);
    top.position.set(0, H + 0.17, FRONT_Z);
    capMesh.add(top);
    scene.add(capMesh);
  }

  // ---------------------------------------------------------------- props along the back wall
  const PROP_STEP = 7;
  function buildProp(kind) {
    const g = new T.Group();
    const metal = G.std('#8d9bb5', { roughness: 0.4, metalness: 0.5 }), dark = G.std('#2b3550', { roughness: 0.6 });
    if (kind === 'window') {
      const [c, x] = G.makeCanvas(256, 192);
      const grd = x.createLinearGradient(0, 0, 0, 192);
      grd.addColorStop(0, '#0d1b46');
      grd.addColorStop(1, '#3b4fa0');
      x.fillStyle = grd;
      x.fillRect(0, 0, 256, 192);
      for (let i = 0; i < 40; i++) {
        x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
        x.fillRect(Math.random() * 256, Math.random() * 110, 2, 2);
      }
      // a city skyline far away
      x.fillStyle = '#1a2456';
      for (let b = 0; b < 256; b += 22) x.fillRect(b, 120 + Math.random() * 40, 18, 80);
      x.fillStyle = '#ffd86b';
      for (let i = 0; i < 50; i++) x.fillRect(Math.random() * 256, 140 + Math.random() * 50, 3, 3);
      x.fillStyle = '#fff6c8';
      x.beginPath();
      x.arc(200, 40, 16, 0, Math.PI * 2);
      x.fill();
      const pane = new T.Mesh(new T.PlaneGeometry(3.2, 2.4), new T.MeshBasicMaterial({ map: G.toTexture(c) }));
      pane.position.set(0, 4.3, 0.02);
      g.add(pane);
      for (const [w, h, px, py] of [[3.5, 0.16, 0, 5.55], [3.5, 0.16, 0, 3.05], [0.16, 2.6, -1.67, 4.3], [0.16, 2.6, 1.67, 4.3], [0.1, 2.4, 0, 4.3]]) G.mesh(new T.BoxGeometry(w, h, 0.18), metal, px, py, 0.08, g, false);
    } else if (kind === 'bench') {
      G.mesh(new T.BoxGeometry(3.2, 0.14, 1.1), G.std('#e8eef7', { roughness: 0.5 }), 0, 1.05, 0.6, g);
      G.mesh(new T.BoxGeometry(3.0, 0.95, 0.95), G.std('#5b6c8c', { roughness: 0.7 }), 0, 0.5, 0.6, g);
      const cols = ['#ff3d7f', '#5fe3b5', '#ffd400', '#18d4ff', '#9b6bff'];
      for (let i = 0; i < 4; i++) {
        const cx = -1.15 + i * 0.75, col = cols[(i + Math.floor(Math.random() * 5)) % 5];
        const glass = new T.MeshStandardMaterial({ color: '#dff6ff', transparent: true, opacity: 0.35, roughness: 0.1 });
        G.mesh(new T.CylinderGeometry(0.16, 0.22, 0.5, 14), glass, cx, 1.37, 0.6, g, false);
        G.mesh(new T.CylinderGeometry(0.15, 0.2, 0.28, 14), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 }), cx, 1.27, 0.6, g, false);
        G.mesh(new T.CylinderGeometry(0.06, 0.06, 0.25, 8), glass, cx, 1.72, 0.6, g, false);
      }
    } else if (kind === 'tank') {
      const col = Math.random() < 0.5 ? '#5fe3b5' : '#18d4ff';
      G.mesh(new T.CylinderGeometry(0.9, 0.9, 0.4, 24), metal, 0, 0.2, 0.9, g);
      G.mesh(new T.CylinderGeometry(0.9, 0.9, 0.4, 24), metal, 0, 4.6, 0.9, g);
      G.mesh(new T.CylinderGeometry(0.8, 0.8, 4.0, 24, 1, true), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, transparent: true, opacity: 0.6, roughness: 0.1 }), 0, 2.4, 0.9, g, false);
      const bub = new T.SpriteMaterial({ map: G.dotTexture(), color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
      g.userData.bubbles = [];
      for (let i = 0; i < 6; i++) {
        const s = new T.Sprite(bub);
        s.scale.setScalar(0.18);
        s.position.set(G.rand(-0.4, 0.4), G.rand(0.5, 4.3), 1.75);
        g.add(s);
        g.userData.bubbles.push(s);
      }
      G.mesh(new T.CylinderGeometry(0.12, 0.12, 2.6, 10), metal, 0, 6.1, 0.9, g, false);
    } else if (kind === 'screen') {
      const [c, x] = G.makeCanvas(256, 160);
      x.fillStyle = '#0b1a2c';
      x.fillRect(0, 0, 256, 160);
      x.strokeStyle = '#5fe3b5';
      x.lineWidth = 4;
      x.beginPath();
      for (let i = 0; i <= 16; i++) x.lineTo(10 + i * 14.7, 110 - Math.sin(i * 0.9) * 30 - i * 3);
      x.stroke();
      x.fillStyle = '#ffd400';
      for (let i = 0; i < 6; i++) x.fillRect(20 + i * 38, 140 - (i + 1) * 9, 22, (i + 1) * 9);
      const scr = new T.Mesh(new T.PlaneGeometry(2.0, 1.25), new T.MeshBasicMaterial({ map: G.toTexture(c) }));
      scr.position.set(0, 3.6, 0.09);
      g.add(scr);
      G.mesh(new T.BoxGeometry(2.25, 1.5, 0.14), dark, 0, 3.6, 0, g, false);
      G.mesh(new T.BoxGeometry(0.16, 1.2, 0.16), metal, 0, 2.4, 0, g, false);
      G.mesh(new T.BoxGeometry(1.6, 1.8, 0.8), G.std('#5b6c8c'), 0, 0.9, 0.4, g);
      for (let i = 0; i < 6; i++) G.mesh(new T.BoxGeometry(0.16, 0.16, 0.05), new T.MeshBasicMaterial({ color: ['#ff3d7f', '#5fe3b5', '#ffd400'][i % 3] }), -0.5 + (i % 3) * 0.5, 1.3 + Math.floor(i / 3) * 0.35, 0.82, g, false);
    } else {
      // pipes with a wheel valve and a hazard sign
      for (const px of [-0.5, 0.05, 0.6]) G.mesh(new T.CylinderGeometry(0.16, 0.16, H, 12), metal, px, H / 2, 0.25, g);
      const wheel = G.mesh(new T.TorusGeometry(0.32, 0.06, 8, 20), G.std('#ff3d7f', { roughness: 0.4 }), 0.05, 2.2, 0.55, g, false);
      wheel.userData.spin = true;
      const [c, x] = G.makeCanvas(128, 128);
      x.fillStyle = '#ffd400';
      x.strokeStyle = '#14121f';
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(64, 10);
      x.lineTo(120, 112);
      x.lineTo(8, 112);
      x.closePath();
      x.fill();
      x.stroke();
      x.font = `60px ${G.EMOJI_FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('⚡', 64, 78);
      const sign = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: G.toTexture(c), transparent: true }));
      sign.position.set(1.4, 3.4, 0.05);
      g.add(sign);
    }
    g.visible = false;
    scene.add(g);
    return g;
  }
  const PROP_KINDS = ['window', 'bench', 'tank', 'screen', 'pipes'];
  function buildProps() {
    for (const k of PROP_KINDS) for (let i = 0; i < 4; i++) props.push({ kind: k, g: buildProp(k), slot: null });
  }
  const hash = (n) => {
    const v = Math.sin(n * 91.7 + 13.1) * 43758.5453;
    return v - Math.floor(v);
  };
  function placeProps(camX) {
    const a = Math.floor((camX - BEHIND) / PROP_STEP), b = Math.floor((camX + AHEAD) / PROP_STEP);
    for (const p of props) if (p.slot !== null && (p.slot < a || p.slot > b)) { p.slot = null; p.g.visible = false; }
    for (let s = a; s <= b; s++) {
      if (s < -2) continue;
      if (props.some((p) => p.slot === s)) continue;
      const h = hash(s);
      if (h < 0.18) continue; // a bare stretch of wall now and then
      const kind = PROP_KINDS[Math.floor(hash(s + 0.5) * PROP_KINDS.length)];
      const p = props.find((q) => q.kind === kind && q.slot === null);
      if (!p) continue;
      p.slot = s;
      p.g.visible = true;
      p.g.position.set(s * PROP_STEP + hash(s + 0.25) * 2, 0, WALL_Z + 0.02);
    }
    for (const p of props) {
      if (!p.g.visible) continue;
      if (p.g.userData.bubbles) for (const s of p.g.userData.bubbles) { s.position.y += 0.02; if (s.position.y > 4.3) s.position.y = 0.5; }
    }
  }

  // ---------------------------------------------------------------- zappers
  function buildZapper() {
    const g = new T.Group();
    const rodMat = G.std('#9aa7bf', { roughness: 0.35, metalness: 0.7 });
    const capMat = new T.MeshStandardMaterial({ color: '#ffd400', emissive: '#ffb000', emissiveIntensity: 0.9, roughness: 0.3 });
    const coreMat = new T.MeshBasicMaterial({ color: '#d8fbff' });
    const depth = ZAP_FRONT - ZAP_BACK, zc = (ZAP_FRONT + ZAP_BACK) / 2;
    const ends = [];
    for (const s of [-1, 1]) {
      const e = new T.Group();
      const rod = G.mesh(new T.CylinderGeometry(0.17, 0.17, depth, 14), rodMat, 0, 0, zc, e);
      rod.rotation.x = Math.PI / 2;
      // the orb in the human's plane: what he can touch is exactly where he sees it
      G.mesh(new T.SphereGeometry(0.3, 18, 12), capMat, 0, 0, PLANE_Z, e);
      G.mesh(new T.SphereGeometry(0.14, 12, 8), coreMat, 0, 0, PLANE_Z + 0.22, e, false);
      for (const z of [ZAP_BACK + 0.4, -1.15, -2.3]) {
        const ring = G.mesh(new T.TorusGeometry(0.2, 0.05, 8, 18), capMat, 0, 0, z, e, false);
        ring.rotation.y = 0;
      }
      e.userData.side = s;
      g.add(e);
      ends.push(e);
    }
    const hub = G.mesh(new T.CylinderGeometry(0.24, 0.24, depth * 0.96, 16), G.std('#5b6c8c', { roughness: 0.4, metalness: 0.6 }), 0, 0, zc, g);
    hub.rotation.x = Math.PI / 2;
    const bt = tex.bolt.clone();
    bt.needsUpdate = true;
    const boltMat = new T.MeshBasicMaterial({ map: bt, color: '#bff6ff', transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const beams = [];
    for (const z of [PLANE_Z, -1.15, -2.3, ZAP_BACK + 0.25]) {
      const b = new T.Mesh(new T.PlaneGeometry(1, 0.9), boltMat);
      b.position.z = z;
      g.add(b);
      beams.push(b);
    }
    const sheet = new T.Mesh(new T.PlaneGeometry(1, depth), new T.MeshBasicMaterial({ color: '#3fc8ff', transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    sheet.rotation.x = Math.PI / 2;
    sheet.position.z = zc;
    g.add(sheet);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: G.glowTexture(), color: '#5fd8ff', transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    glow.position.z = PLANE_Z;
    g.add(glow);
    g.visible = false;
    scene.add(g);
    return { g, ends, beams, sheet, hub, glow, bolt: bt, z: null, flick: 0 };
  }
  function placeZappers(camX, t) {
    if (!lab) return;
    for (const v of zapPool) if (v.z && (v.z.xb < camX - BEHIND || v.z.xa > camX + AHEAD)) { v.z = null; v.g.visible = false; }
    for (const z of lab.zaps) {
      if (z.xb < camX - BEHIND || z.xa > camX + AHEAD) continue;
      if (zapPool.some((v) => v.z === z)) continue;
      const v = zapPool.find((q) => !q.z);
      if (!v) break;
      v.z = z;
      v.g.visible = true;
      v.hub.visible = !!z.spin;
    }
    for (const v of zapPool) {
      if (!v.z) continue;
      const z = LB.ends(v.z, t);
      const l = Math.hypot(z.x2 - z.x1, z.y2 - z.y1);
      v.g.position.set((z.x1 + z.x2) / 2, (z.y1 + z.y2) / 2, 0);
      v.g.rotation.z = Math.atan2(z.y2 - z.y1, z.x2 - z.x1);
      v.ends[0].position.x = -l / 2;
      v.ends[1].position.x = l / 2;
      for (const b of v.beams) b.scale.x = l;
      v.sheet.scale.x = l;
      v.glow.scale.set(l + 1.2, 1.4, 1);
      v.flick -= 1;
      if (v.flick <= 0) {
        v.flick = 2 + Math.floor(Math.random() * 3);
        v.bolt.offset.y = Math.floor(Math.random() * 4) * 0.25;
        v.bolt.offset.x = Math.random();
        v.sheet.material.opacity = 0.12 + Math.random() * 0.1;
      }
    }
  }

  // ---------------------------------------------------------------- coins
  const MAX_COINS = 260;
  function buildCoins() {
    const geo = new T.CylinderGeometry(0.3, 0.3, 0.08, 22);
    geo.rotateX(Math.PI / 2);
    const m = new T.MeshStandardMaterial({ color: '#ffd23f', emissive: '#c27c00', emissiveIntensity: 0.6, roughness: 0.32, metalness: 0.1 });
    coinMesh = new T.InstancedMesh(geo, m, MAX_COINS);
    coinMesh.castShadow = true;
    coinMesh.count = 0;
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);
    coinDummy = new T.Object3D();
  }
  function placeCoins(camX, taken) {
    if (!lab) { coinMesh.count = 0; return; }
    let n = 0;
    const cs = lab.coins;
    // binary search the first coin in view
    let lo = 0, hi = cs.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cs[m].x < camX - BEHIND) lo = m + 1; else hi = m;
    }
    for (let k = lo; k < cs.length && n < MAX_COINS; k++) {
      const c = cs[k];
      if (c.x > camX + AHEAD) break;
      if (taken && taken[k]) continue;
      coinDummy.position.set(c.x, c.y, COIN_Z);
      coinDummy.rotation.set(0, time * 3 + c.x * 0.6, 0);
      coinDummy.updateMatrix();
      coinMesh.setMatrixAt(n++, coinDummy.matrix);
    }
    coinMesh.count = n;
    coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the exit, the landing pad and the podium
  function buildExit(x) {
    if (exitG) scene.remove(exitG);
    exitG = new T.Group();
    exitG.position.x = x;
    const frame = G.std('#2fb38a', { roughness: 0.45, metalness: 0.3 }), white = G.std('#ffffff', { roughness: 0.5 });
    const depth = FRONT_Z - WALL_Z, zc = (FRONT_Z + WALL_Z) / 2;
    G.mesh(new T.BoxGeometry(0.6, H, 0.6), frame, 0, H / 2, FRONT_Z - 0.4, exitG);
    G.mesh(new T.BoxGeometry(0.6, H, 0.6), frame, 0, H / 2, WALL_Z + 0.4, exitG);
    G.mesh(new T.BoxGeometry(0.6, 0.6, depth), frame, 0, H - 0.3, zc, exitG);
    // the finish line on the floor: a checkered strip
    const [c, g] = G.makeCanvas(64, 256);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#14121f' : '#ffffff'; g.fillRect(i * 32, j * 32, 32, 32); }
    const strip = new T.Mesh(new T.PlaneGeometry(1.0, depth), new T.MeshStandardMaterial({ map: G.toTexture(c), roughness: 0.6 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.01, zc);
    strip.receiveShadow = true;
    exitG.add(strip);
    const sign = new T.Mesh(new T.PlaneGeometry(2.6, 0.81), new T.MeshBasicMaterial({ transparent: true }));
    sign.position.set(0, H - 1.05, FRONT_Z - 0.05);
    exitG.add(sign);
    exitG.userData.sign = sign;
    drawExitSign();
    // the pad: a round platform with three podium steps
    const pad = G.mesh(new T.CylinderGeometry(3.4, 3.6, 0.3, 32), G.std('#5b6c8c', { roughness: 0.6, metalness: 0.2 }), 8, 0.15, -1.15, exitG);
    pad.receiveShadow = true;
    const steps = [[0, 1.1, '#ffd400'], [-1.5, 0.75, '#c9d6e8'], [1.5, 0.5, '#ff8a1f']];
    exitG.userData.steps = steps.map(([dx, h, col], i) => {
      const s = G.mesh(new T.BoxGeometry(1.35, h, 1.35), G.std(col, { roughness: 0.5 }), 8 + dx, 0.3 + h / 2, -1.15, exitG);
      s.receiveShadow = true;
      const [cc, gg] = G.makeCanvas(128, 128);
      gg.fillStyle = '#14121f';
      gg.font = `90px ${G.FONT}`;
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText(String(i + 1), 64, 70);
      const num = new T.Mesh(new T.PlaneGeometry(0.7, 0.7), new T.MeshBasicMaterial({ map: G.toTexture(cc), transparent: true }));
      num.position.set(8 + dx, 0.3 + h / 2, -1.15 + 0.68);
      exitG.add(num);
      return { x: x + 8 + dx, top: 0.3 + h };
    });
    // balloons
    const cols = ['#ff3d7f', '#ffd400', '#18d4ff', '#5fe3b5', '#9b6bff'];
    exitG.userData.balloons = [];
    for (let i = 0; i < 7; i++) {
      const b = G.mesh(new T.SphereGeometry(0.4, 16, 12), G.std(cols[i % 5], { roughness: 0.35 }), 4 + i * 1.6, 4.4 + (i % 2) * 0.8, WALL_Z + 0.9, exitG, false);
      b.scale.y = 1.2;
      exitG.userData.balloons.push(b);
    }
    scene.add(exitG);
  }
  function drawExitSign() {
    if (!exitG) return;
    const m = exitG.userData.sign.material;
    if (m.map) m.map.dispose();
    m.map = signTexture(Kit.lang.t('EXIT'), '#14121f', '#5fe3b5');
    m.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera
  const view = { x: 0, w: 1, h: 1 };
  // The camera fits the whole lab height between the HUD at the top and the buttons at the bottom (m.top / m.bottom,
  // in pixels), and keeps at least VW m of lab across, whatever the screen shape. focusY (the podium) overrides the
  // height it looks at; zoom > 1 moves in. It stands at camX and looks straight across the lab; `lead` is how far
  // across the screen camX shows (0.3 while flying: the flyers a third of the way in, more lab ahead), done with an
  // off-centre view rather than by turning the camera, so everything at camX lines up whatever its depth.
  function frame(camX, focusY, zoom, m, lead) {
    m = m || { top: 24, bottom: 24 };
    const fov = (camera.fov * Math.PI) / 180, tan = Math.tan(fov / 2), w = view.w, h = view.h, aspect = w / h;
    const VW = aspect < 0.7 ? 12 : aspect < 1 ? 14 : 17.5;
    const ppmH = Math.max(8, (h - m.top - m.bottom) / (H + 0.6));
    const ppm = Math.min(ppmH, w / VW) * (zoom || 1);
    const VH = h / ppm;
    let cy = focusY;
    if (cy == null) {
      // between "ceiling just under the HUD" and "floor just over the buttons"
      const hi = H + 0.3 + m.top / ppm - VH / 2, lo = -0.3 - m.bottom / ppm + VH / 2;
      cy = hi >= lo ? (hi + lo) / 2 : H / 2;
    }
    const dist = VH / (2 * tan);
    camera.position.set(camX, cy + LIFT, PLANE_Z + dist);
    camera.lookAt(camX, cy, PLANE_Z);
    const ld = lead == null ? 0.5 : lead;
    camera.aspect = aspect;
    if (Math.abs(ld - 0.5) < 1e-4) camera.clearViewOffset();
    else camera.setViewOffset(2 * Math.max(ld, 1 - ld) * w, h, ld < 0.5 ? (1 - 2 * ld) * w : 0, 0, w, h);
    // the light follows so the flyers' shadows stay on the floor
    sun.position.set(camX + 6, 22, 14);
    sun.target.position.set(camX + 4, 0, -1);
    sun.target.updateMatrixWorld();
    view.x = camX;
  }
  // How much of a flyer at `back` is covered on screen by one at `front` (0 none, 1 all): the boxes round their bodies
  // (JP.lab.BODY), projected with the camera.
  const pv = new T.Vector3();
  function rectOf(p) {
    const B = LB.BODY;
    let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
    for (const [dx, dy] of [[-B.back, -B.down], [B.front, -B.down], [-B.back, B.up], [B.front, B.up]]) {
      pv.set(p.x + dx, p.y + dy, p.z).project(camera);
      l = Math.min(l, pv.x); r = Math.max(r, pv.x); t = Math.min(t, pv.y); b = Math.max(b, pv.y);
    }
    return { l, r, t, b };
  }
  function covered(front, back) {
    camera.updateMatrixWorld();
    const a = rectOf(front), c = rectOf(back);
    const w = Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l)), h = Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t));
    return (w * h) / Math.max(1e-9, (c.r - c.l) * (c.b - c.t));
  }
  // how many metres of lab are in view across, in the human's plane
  function visibleWidth() {
    const fov = (camera.fov * Math.PI) / 180, dist = camera.position.z - PLANE_Z;
    return 2 * Math.tan(fov / 2) * dist * (view.w / view.h);
  }

  // ---------------------------------------------------------------- set-up and each frame
  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    scene.background = new T.Color('#141c33');
    scene.fog = new T.Fog('#2a3a63', 34, 80);
    camera = new T.PerspectiveCamera(40, 1, 0.1, 220);
    scene.add(new T.HemisphereLight('#e8f1ff', '#56607a', 0.85));
    sun = new T.DirectionalLight('#fff6e6', 0.75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 60;
    scene.add(sun, sun.target);
    tex.bolt = boltTexture();
    buildRoom();
    buildProps();
    for (let i = 0; i < 26; i++) zapPool.push(buildZapper());
    buildCoins();
    parts.smoke = particles(260, 0.55, false);
    parts.fire = particles(220, 0.32, true);
    parts.spark = particles(200, 0.26, true);
    parts.confetti = particles(420, 0.24, false);
    Kit.lang.onChange(drawExitSign);
  }
  function setLab(l) {
    lab = l;
    for (const v of zapPool) { v.z = null; v.g.visible = false; }
    for (const p of props) { p.slot = null; p.g.visible = false; }
    buildExit(l.exitX);
    for (const k in parts) parts[k].clear();
  }
  function resize(w, h) {
    view.w = w;
    view.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // o: { t (lab time, for the spinners), taken (coins already picked up) }
  function update(dt, o) {
    time += dt;
    const camX = view.x;
    // the long pieces follow the camera; their textures slide the other way so the lab stands still
    for (const m of [wallMesh, floorMesh, stripeMesh, ceilMesh, capMesh]) m.position.x = camX;
    tex.wall.offset.x = camX / 6;
    tex.floor.offset.x = camX / 2;
    tex.stripe.offset.x = camX / 1.6;
    tex.ceil.offset.x = camX / 3;
    tex.cut.offset.x = camX / 4;
    placeProps(camX);
    placeZappers(camX, o.t || 0);
    placeCoins(camX, o.taken);
    if (exitG) {
      exitG.userData.balloons.forEach((b, i) => { b.position.y = 4.6 + (i % 2) * 0.8 + Math.sin(time * 1.4 + i) * 0.18; });
      for (const p of props) if (p.g.visible) p.g.traverse((q) => { if (q.userData.spin) q.rotation.z = time * 0.4; });
    }
    for (const k in parts) parts[k].update(dt);
  }
  function render() {
    renderer.render(scene, camera);
  }

  JP.world = {
    PLANE_Z, COIN_Z, ZAP_FRONT, init, setLab, resize, update, render, frame, visibleWidth, covered,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get exit() { return exitG; },
    parts,
    // a burst of sparks (zap), a coin sparkle, a puff of jet smoke, confetti from above
    zapBurst(x, y, z) {
      parts.spark.emit(x, y, z, 26, { color: ['#bff6ff', '#5fd8ff', '#ffffff', '#ffd400'], speed: 5, life: 0.5, gravity: 4, spread: 0.2, drag: 2 });
    },
    coinBurst(x, y, z) {
      parts.spark.emit(x, y, z, 7, { color: ['#ffe14d', '#fff6b0', '#ffc928'], speed: 2.2, life: 0.35, gravity: 0, spread: 0.1, drag: 3 });
    },
    smoke(x, y, z, k) {
      parts.smoke.emit(x, y, z, 1, { color: ['#d9e0ea', '#b8c2d2'], speed: 0.35, vy: -1.2 * k, vx: -1.4, life: 0.7, gravity: -0.6, spread: 0.06, drag: 1.5 });
      parts.fire.emit(x, y, z, 1, { color: ['#ffd400', '#ff8a1f', '#fff3b0'], speed: 0.3, vy: -3 * k, life: 0.18, gravity: 0, spread: 0.04 });
    },
    confetti(x, y) {
      parts.confetti.emit(x, y, -1.1, 140, { color: ['#ff3d7f', '#ffd400', '#18d4ff', '#5fe3b5', '#9b6bff', '#ffffff'], speed: 5, vy: 3, life: 3.2, gravity: 3.2, spread: 1.6, drag: 0.9 });
    },
    sparkle(x, y, z) {
      parts.spark.emit(x, y, z, 18, { color: ['#ffffff', '#bff6ff', '#ffd400'], speed: 2.6, life: 0.6, gravity: 0, spread: 0.3, drag: 2 });
    },
  };
})();
