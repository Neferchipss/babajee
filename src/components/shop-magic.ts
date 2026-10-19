import * as THREE from "three";

// The shop's mischief (see tools/blender/shop_magic.py and shop_world.py for
// how the parts are named). Everything is cosmetic: with this switched off
// the shop is just still.
//
//   book_N / bslot_N     books lift off their shelf and settle in another gap
//   step_N, ladder       the spiral stair ripples; the library ladder slides
//   flybook_N            books that fly circuits of the vault, flapping
//   roll_N               a paper that rolls itself, lights and floats off
//   lflame_N, grind_top  lighters that take turns, a grinder that spins
//   chalk_board          writes on itself
//   portrait_N           mouths move, a speech bubble offers its category
//   m_star*, m_flame*    stars twinkle, candles flicker
//   smoke that writes words above the table, and rings from the floating bongs

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};
const Y = new THREE.Vector3(0, 1, 0);

export type Speaker = { id: number; label: string; text: string; slugs: string[]; at: THREE.Vector3 } | null;

// what the portraits say; the first line of each is the one that points somewhere
const LINES: Record<string, string[]> = {
  "The Old Roller": ["Papers, wraps and cones. Down at the back, dear.", "Mind the ladder. It has opinions.", "I rolled that one myself. Or something did."],
  "Madam Grind": ["Grinders on the left, and the ashtrays beside them.", "A good grind is half the ceremony.", "Touch nothing that is looking at you."],
  "Sir Bubbleton": ["Bongs, my good fellow. That whole wall of them.", "Glass, water, patience. In that order.", "Do ignore the ones that float."],
  "Grandmother Baba": ["Tobacco and cigars, and a light for either.", "I see you. I have always seen you.", "Take your time. The shop does."],
};
const WORDS = ["Welcome", "Stay awhile", "Look up", "Breathe"];
const BOARD = ["Mind the eyes.", "Open late. Very late.", "The books move.", "Please do not", "feed the portraits."];

type Book = { o: THREE.Object3D; slot: number; hb: number };
type Move = { book: Book; from: THREE.Vector3; to: number; t0: number; dur: number };
type Portrait = { root: THREE.Object3D; mouth: THREE.Object3D | null; label: string; slugs: string[]; id: number };

function softDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMagic(root: THREE.Object3D, scene: THREE.Scene, have: Set<string>) {
  const all: THREE.Object3D[] = [];
  root.traverse((o) => all.push(o));
  const named = (re: RegExp) => all.filter((o) => re.test(o.name));
  const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

  // --- books that move ----------------------------------------------------------------------
  const slotPos: THREE.Vector3[] = [];
  const slotIsFree: boolean[] = [];
  for (const o of named(/^bslot_\d+$/)) {
    const i = Number(o.name.slice(6));
    slotPos[i] = worldPos(o);
    slotIsFree[i] = true;
  }
  const books: Book[] = named(/^book_\d+$/).map((o) => ({ o, slot: Number(o.userData.slot), hb: Number(o.userData.hb ?? 0.28) }));
  for (const b of books) slotIsFree[b.slot] = false;
  const moves: Move[] = [];
  let nextMove = 3;

  // --- stairs and the ladder ------------------------------------------------------------------
  const steps = named(/^step_\d+$/).map((o, i) => ({ o, q: o.quaternion.clone(), y: o.position.y, i: Number(o.name.slice(5)) || i }));
  const ladder = all.find((o) => o.name === "ladder") ?? null;
  const ladderX = ladder?.position.x ?? 0;

  // --- flying books ----------------------------------------------------------------------------
  const fly = named(/^flybook_\d+$/).map((o) => ({
    o,
    wl: o.children.find((c) => c.name.endsWith("_wl")) ?? null,
    wr: o.children.find((c) => c.name.endsWith("_wr")) ?? null,
    k: Number(o.name.slice(9)),
  }));

  // --- rolling papers, lighters, grinder -------------------------------------------------------
  const rolls = named(/^roll_\d+$/).map((o) => ({
    o,
    sheet: o.children.find((c) => c.name.endsWith("_sheet")) ?? null,
    herb: o.children.find((c) => c.name.endsWith("_herb")) ?? null,
    joint: o.children.find((c) => c.name.endsWith("_joint")) ?? null,
    ember: o.children.find((c) => c.name.endsWith("_ember")) ?? null,
    k: Number(o.name.slice(5)),
  }));
  const lflames = named(/^lflame_\d+$/);
  const grind = all.find((o) => o.name === "grind_top") ?? null;
  const grindBase = grind?.position.y ?? 0;

  // --- materials that flicker or twinkle ---------------------------------------------------------
  const flames: THREE.MeshStandardMaterial[] = [];
  const stars: THREE.MeshStandardMaterial[] = [];
  for (const o of all) {
    if (!(o instanceof THREE.Mesh)) continue;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const mm = m as THREE.MeshStandardMaterial;
      if (/^m_flame/.test(m.name) && !flames.includes(mm)) flames.push(mm);
      if (/^m_star/.test(m.name) && !stars.includes(mm)) stars.push(mm);
    }
  }

  // --- the chalkboard ----------------------------------------------------------------------------
  let chalk: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; shown: number } | null = null;
  const board = all.find((o) => o.name === "chalk_board") as THREE.Mesh | undefined;
  if (board && !Array.isArray(board.material)) {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 852;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    const m = board.material as THREE.MeshStandardMaterial;
    m.map = tex;
    m.color.set(0xffffff);
    m.needsUpdate = true;
    chalk = { ctx: cv.getContext("2d")!, tex, shown: -1 };
  }
  const BOARD_TOTAL = BOARD.reduce((n, l) => n + l.length, 0);
  function drawBoard(chars: number) {
    if (!chalk || chalk.shown === chars) return;
    chalk.shown = chars;
    const g = chalk.ctx;
    g.fillStyle = "#16231d";
    g.fillRect(0, 0, 1024, 852);
    g.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.moveTo(hash(i) * 1024, hash(i + 90) * 852);
      g.lineTo(hash(i) * 1024 + 90, hash(i + 90) * 852 + 12);
      g.stroke();
    }
    g.fillStyle = "#e9f0e6";
    g.font = '66px "Segoe Script","Bradley Hand","Comic Sans MS",cursive';
    g.textBaseline = "middle";
    let left = chars;
    BOARD.forEach((line, i) => {
      const part = line.slice(0, Math.max(0, left));
      left -= line.length;
      g.save();
      g.translate(70, 120 + i * 140);
      g.rotate(-0.018 + i * 0.008);
      g.fillText(part, 0, 0);
      g.restore();
    });
    chalk.tex.needsUpdate = true;
  }

  // --- portraits ----------------------------------------------------------------------------------
  const portraits: Portrait[] = named(/^portrait_\d+$/).map((o) => ({
    root: o,
    mouth: o.children.find((c) => c.name.endsWith("_mouth")) ?? null,
    label: String(o.userData.label ?? ""),
    slugs: String(o.userData.categories ?? "").split(",").filter((s) => have.has(s)),
    id: Number(o.name.slice(9)),
  }));
  let speaker: { p: Portrait; line: number; t0: number; lines: number; silentUntil: number } | null = null;
  let lastSpoke = -1;
  let hush = 0;

  // --- smoke that writes, and rings -----------------------------------------------------------------
  const dot = softDot();
  const smokeMat = (size: number) =>
    new THREE.PointsMaterial({ size, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  const WN = 760;
  const wPos = new Float32Array(WN * 3);
  const wCol = new Float32Array(WN * 3);
  const wFrom = new Float32Array(WN * 3);
  const wTo = new Float32Array(WN * 3);
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute("position", new THREE.BufferAttribute(wPos, 3));
  wGeo.setAttribute("color", new THREE.BufferAttribute(wCol, 3));
  const wPts = new THREE.Points(wGeo, smokeMat(0.075));
  wPts.frustumCulled = false;
  scene.add(wPts);
  const TEXT_AT = new THREE.Vector3(-0.3, 4.5, -7.8); // above and beyond the table, in front of the far wall
  let writeStart = 0;
  let wordN = 0;
  function pickWord() {
    const cv = document.createElement("canvas");
    cv.width = 640;
    cv.height = 160;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#fff";
    g.font = 'bold 118px "Georgia","Palatino Linotype",serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(WORDS[wordN++ % WORDS.length], 320, 86);
    const px = g.getImageData(0, 0, 640, 160).data;
    const pts: [number, number][] = [];
    for (let y = 0; y < 160; y += 3) for (let x = 0; x < 640; x += 3) if (px[(y * 640 + x) * 4 + 3] > 128) pts.push([x, y]);
    for (let i = 0; i < WN; i++) {
      const p = pts[Math.floor(hash(i + wordN * 31) * pts.length)] ?? [320, 80];
      wTo[i * 3] = TEXT_AT.x + (p[0] - 320) * 0.0062;
      wTo[i * 3 + 1] = TEXT_AT.y - (p[1] - 80) * 0.0062;
      wTo[i * 3 + 2] = TEXT_AT.z + (hash(i + 5) - 0.5) * 0.12;
      // they rise from above the table
      wFrom[i * 3] = 0.5 + (hash(i + 7) - 0.5) * 0.9;
      wFrom[i * 3 + 1] = 1.0 + hash(i + 9) * 0.4;
      wFrom[i * 3 + 2] = -5.0 + (hash(i + 11) - 0.5) * 0.9;
    }
  }
  pickWord();
  const WRITE = 9.5;
  let nextWrite = 4;

  const RN = 6;
  const RP = 34;
  const rPos = new Float32Array(RN * RP * 3);
  const rCol = new Float32Array(RN * RP * 3);
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute("color", new THREE.BufferAttribute(rCol, 3));
  const rPts = new THREE.Points(rGeo, smokeMat(0.06));
  rPts.frustumCulled = false;
  scene.add(rPts);
  const rings = Array.from({ length: RN }, () => ({ at: new THREE.Vector3(), t0: -99 }));
  const bongs = named(/^float_bong_\d+$/);
  let nextRing = 5;
  let ringN = 0;

  // --- per frame ---------------------------------------------------------------------------------------
  const cam = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const ease = (p: number) => p * p * (3 - 2 * p);

  function update(t: number, dt: number, inside: number, camera: THREE.Camera): Speaker {
    camera.getWorldPosition(cam);
    camera.getWorldDirection(fwd);
    const live = smooth(0.2, 0.7, inside);

    // books: now and then one lifts out and settles into a free gap, anywhere on the shelves
    if (live > 0.5 && t > nextMove && moves.length < 3 && books.length) {
      const b = books[Math.floor(hash(t * 3.1) * books.length)];
      const free = slotIsFree.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
      if (free.length && !moves.some((m) => m.book === b)) {
        const to = free[Math.floor(hash(t * 7.7) * free.length)];
        slotIsFree[b.slot] = true;
        slotIsFree[to] = false;
        moves.push({ book: b, from: b.o.position.clone(), to, t0: t, dur: 1.6 + hash(t) * 0.8 });
      }
      nextMove = t + 1.2 + hash(t * 5.3) * 1.8;
    }
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i];
      const p = clamp((t - m.t0) / m.dur);
      const e = ease(p);
      const end = slotPos[m.to];
      m.book.o.position.set(
        THREE.MathUtils.lerp(m.from.x, end.x, e) + 0.3 * Math.sin(Math.PI * p),
        THREE.MathUtils.lerp(m.from.y, end.y + m.book.hb / 2, e) + 0.28 * Math.sin(Math.PI * p),
        THREE.MathUtils.lerp(m.from.z, end.z, e),
      );
      m.book.o.rotation.set(0, Math.sin(Math.PI * p) * 0.7, Math.sin(Math.PI * p * 2) * 0.35);
      if (p >= 1) {
        m.book.slot = m.to;
        m.book.o.rotation.set(0, 0, 0);
        moves.splice(i, 1);
      }
    }

    // the stair ripples, the ladder slides
    for (const s of steps) {
      qTmp.setFromAxisAngle(Y, Math.sin(t * 0.7 + s.i * 0.45) * 0.07 * live);
      s.o.quaternion.copy(s.q).premultiply(qTmp);
      s.o.position.y = s.y + Math.sin(t * 0.9 + s.i * 0.5) * 0.025 * live;
    }
    if (ladder) ladder.position.x = ladderX + Math.sin(t * 0.18) * 0.45;

    // books in flight: circuits of the vault, covers flapping
    for (const f of fly) {
      const sp = (0.18 + 0.05 * (f.k % 4)) * (f.k % 2 ? 1 : -1);
      const th = t * sp + f.k * 0.8;
      const rx = 2.3 + 0.18 * (f.k % 3);
      const rz = 3.0;
      const x = 0.2 + Math.cos(th) * rx;
      const z = -7.0 + Math.sin(th) * rz;
      f.o.position.set(x, 4.4 + 0.2 * f.k + Math.sin(t * 0.7 + f.k) * 0.15, z);
      f.o.rotation.y = Math.atan2(-Math.sin(th) * rx * Math.sign(sp), Math.cos(th) * rz * Math.sign(sp));
      const flap = Math.sin(t * 8 + f.k * 1.3) * 0.75;
      if (f.wl) f.wl.rotation.z = -flap;
      if (f.wr) f.wr.rotation.z = flap;
    }

    // papers that roll themselves into something else
    for (const r of rolls) {
      const u = (t + r.k * 4.7) % 15;
      const sheet = r.sheet;
      const herb = r.herb;
      const joint = r.joint;
      const ember = r.ember;
      const show = live > 0.3 ? 1 : 0;
      if (!sheet || !herb || !joint || !ember) continue;
      const roll = smooth(1.8, 4.2, u);
      sheet.visible = herb.visible = u < 4.3 && show > 0;
      sheet.scale.set(1, 1, Math.max(0.001, 1 - roll));
      herb.scale.set(smooth(0.2, 1.6, u), 1 - smooth(2.6, 3.8, u), 1);
      joint.visible = u > 1.8 && u < 11 && show > 0;
      joint.rotation.order = "YXZ";
      joint.scale.set(1, Math.max(0.001, roll), Math.max(0.001, roll));
      joint.rotation.x = roll * Math.PI * 6;
      const lit = smooth(4.4, 5.0, u);
      const rise = smooth(5, 10, u);
      joint.position.set(0, 0.0115 + rise * 0.7, 0);
      joint.rotation.y = rise * 2.4;
      const gone = 1 - smooth(9.8, 11, u);
      if (u > 4.4) joint.scale.setScalar(gone);
      ember.visible = joint.visible && lit > 0.05;
      ember.position.set(0.085 * Math.cos(joint.rotation.y) * gone, joint.position.y, -0.085 * Math.sin(joint.rotation.y) * gone);
      ember.scale.setScalar(gone * (0.8 + 0.4 * Math.sin(t * 19 + r.k)));
    }
    lflames.forEach((o, i) => {
      const on = Math.floor(t / 0.8) % (lflames.length + 2) === i && live > 0.3;
      o.visible = on;
      if (on) o.scale.set(1, 0.8 + 0.5 * Math.sin(t * 24 + i), 1);
    });
    if (grind) {
      const ph = (t + 2) % 10;
      const spin = ph < 3.4 ? smooth(0, 0.5, ph) * (1 - smooth(2.9, 3.4, ph)) : 0;
      grind.rotation.y += dt * 9 * spin * live;
      grind.position.y = grindBase + 0.012 * spin * live;
    }

    // flicker and twinkle
    const flick = 3 + Math.sin(t * 17) * 0.8 + Math.sin(t * 29 + 1) * 0.5;
    for (const m of flames) m.emissiveIntensity = flick;
    stars.forEach((m, i) => (m.emissiveIntensity = 2 + 4 * (0.5 + 0.5 * Math.sin(t * (1.1 + i * 0.7) + i * 2))));

    // the chalkboard writes a line at a time, then wipes
    if (chalk) {
      const cyc = (t * 7) % (BOARD_TOTAL + 38);
      drawBoard(live > 0.3 ? Math.min(BOARD_TOTAL, Math.floor(cyc)) : 0);
    }

    // smoke writing a word above the table
    if (live > 0.85 && t > nextWrite) {
      writeStart = t;
      pickWord();
      nextWrite = t + WRITE + 14;
    }
    const wu = t - writeStart;
    const active = wu >= 0 && wu < WRITE;
    wPts.visible = active;
    if (active) {
      const gather = smooth(1.6, 4.6, wu);
      const fade = 1 - smooth(7.4, WRITE, wu);
      for (let i = 0; i < WN; i++) {
        const j = hash(i) * 6.28;
        const rise = Math.min(1, wu / 2.2);
        for (let c = 0; c < 3; c++) {
          const from = wFrom[i * 3 + c] + (c === 1 ? rise * (1.3 + hash(i + 3)) : 0) + Math.sin(t * 0.8 + j + c) * 0.08 * (1 - gather);
          const to = wTo[i * 3 + c] + Math.sin(t * 1.3 + j * 2 + c) * 0.015 + (c === 1 ? smooth(7.4, WRITE, wu) * (0.5 + hash(i + 2)) : 0);
          wPos[i * 3 + c] = THREE.MathUtils.lerp(from, to, gather);
        }
        const a = smooth(0, 0.7, wu) * fade * (0.5 + 0.5 * gather);
        wCol[i * 3] = a * 0.85;
        wCol[i * 3 + 1] = a * 0.7;
        wCol[i * 3 + 2] = a * 1.0;
      }
      wGeo.attributes.position.needsUpdate = true;
      wGeo.attributes.color.needsUpdate = true;
    }

    // a smoke ring now and then from one of the floating bongs
    if (live > 0.5 && t > nextRing && bongs.length) {
      const r = rings[ringN++ % RN];
      r.at.copy(worldPos(bongs[Math.floor(hash(t * 2.9) * bongs.length)])).y += 0.26;
      r.t0 = t;
      nextRing = t + 3.5 + hash(t) * 3;
    }
    rPts.visible = live > 0.3;
    for (let k = 0; k < RN; k++) {
      const r = rings[k];
      const age = t - r.t0;
      const ok = age >= 0 && age < 4;
      for (let i = 0; i < RP; i++) {
        const n = (k * RP + i) * 3;
        if (!ok) {
          rCol[n] = rCol[n + 1] = rCol[n + 2] = 0;
          continue;
        }
        const a = (i / RP) * Math.PI * 2;
        const rad = 0.04 + age * 0.12;
        rPos[n] = r.at.x + Math.cos(a) * rad + Math.sin(t + k) * 0.01 * age;
        rPos[n + 1] = r.at.y + age * 0.4;
        rPos[n + 2] = r.at.z + Math.sin(a) * rad;
        const al = smooth(0, 0.3, age) * (1 - smooth(2.4, 4, age)) * 0.7;
        rCol[n] = al * 0.8;
        rCol[n + 1] = al * 0.75;
        rCol[n + 2] = al;
      }
    }
    rGeo.attributes.position.needsUpdate = true;
    rGeo.attributes.color.needsUpdate = true;

    // portraits: whoever is nearest and in front of you speaks, one line at a time
    let out: Speaker = null;
    let typing = false;
    if (live > 0.8 && portraits.length && t > hush) {
      if (!speaker) {
        let best: Portrait | null = null;
        let bestD = 9.5;
        for (const p of portraits) {
          if (p.id === lastSpoke) continue;
          const at = worldPos(p.root);
          tmp.copy(at).sub(cam);
          const d = tmp.length();
          if (d > bestD || tmp.normalize().dot(fwd) < 0.3) continue;
          const back = p.root.worldToLocal(cam.clone()).z; // in front of the canvas?
          if (back <= 0) continue;
          best = p;
          bestD = d;
        }
        if (best) speaker = { p: best, line: 0, t0: t, lines: 2, silentUntil: 0 };
        else lastSpoke = -1;
      }
      if (speaker) {
        const p = speaker.p;
        const lines = LINES[p.label] ?? ["…"];
        const text = lines[speaker.line % lines.length];
        const typed = Math.floor((t - speaker.t0) * 26);
        const done = typed >= text.length;
        typing = !done;
        const at = worldPos(p.root);
        tmp.copy(at).sub(cam);
        const away = tmp.length() > 12 || tmp.normalize().dot(fwd) < -0.15; // only if you turn your back or walk off
        if (done && t - speaker.t0 > text.length / 26 + 2.6) {
          speaker.line++;
          speaker.t0 = t;
          if (speaker.line >= speaker.lines || away) {
            lastSpoke = p.id;
            hush = t + 2.5;
            speaker = null;
          }
        } else if (away && t - speaker.t0 > 1) {
          lastSpoke = p.id;
          speaker = null;
        }
        if (speaker) {
          out = { id: p.id, label: p.label, text: text.slice(0, typed), slugs: speaker.line === 0 ? p.slugs : [], at: at.clone().add(new THREE.Vector3(0, 1.0, 0)) };
        }
      }
    }
    for (const p of portraits) {
      if (!p.mouth) continue;
      const target = typing && speaker?.p === p ? 0.5 + 1.1 * Math.abs(Math.sin(t * 15 + p.id)) : 0.35;
      p.mouth.scale.y += (target - p.mouth.scale.y) * (1 - Math.exp(-dt * 18));
    }
    return out;
  }

  function dispose() {
    scene.remove(wPts, rPts);
    wGeo.dispose();
    rGeo.dispose();
    (wPts.material as THREE.Material).dispose();
    (rPts.material as THREE.Material).dispose();
    dot.dispose();
    chalk?.tex.dispose();
  }

  return { update, dispose };
}
