import * as THREE from "three";

// The life of the shop's inside (see tools/blender/shop_world.py for how the
// things are named in the model). Nothing here is needed to see the shop: if
// this does nothing, the model is simply still.
//
//   eye_*       an empty with children *_iris and *_lid: the iris slides to
//               look at the camera, the lid blinks, and all of them are shut
//               until you cross the threshold, then open from the door outward
//   eyeball_*   turns to face the camera on its cord
//   float_*     drifts, bobs and turns
//   planet_*    turns slowly
//   smoke_*     empties that incense smoke rises from
//   curtain_l/r slide apart when you come near, uncovering the eyes behind
//   lamp_*      become lights; extras.kind picks the colour

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// a small deterministic scatter, so a reload looks the same
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type Eye = {
  root: THREE.Object3D;
  iris: THREE.Object3D | null;
  lid: THREE.Object3D | null;
  reachX: number;
  reachZ: number;
  wakeAt: number; // how far in (0..1) before it opens: near the door first
  peek: boolean; // only wakes once the curtain is parting
  open: number; // 0 shut .. 1 open
  blinkAt: number;
  blinkT: number;
  seed: number;
};

type Lamp = { at: THREE.Vector3; kind: string; base: number; seed: number };

const KIND: Record<string, { color: string; intensity: number; distance: number }> = {
  street: { color: "#ffc27a", intensity: 38, distance: 13 }, // the street is dim; the shop is not
  window: { color: "#ffb066", intensity: 46, distance: 10 },
  shop: { color: "#ffd29a", intensity: 16, distance: 6.5 },
  // inside, only washes of colour: the room is kept dim so the lit alcoves and the sky stand out
  magenta: { color: "#ff3fa4", intensity: 5, distance: 6 },
  teal: { color: "#25e0d0", intensity: 4.5, distance: 6 },
  violet: { color: "#8a5cff", intensity: 10, distance: 8 },
};
// Point lights are the costly part, and changing how many there are stalls
// while every shader recompiles. So there is one fixed set: it lights the
// street while you are out there, goes dark as you cross the threshold, and
// comes up again on the lamps inside.
const BUDGET = 16;

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

export function createWorld(root: THREE.Object3D, scene: THREE.Scene) {
  const eyes: Eye[] = [];
  const eyeballs: { o: THREE.Object3D; base: THREE.Vector3; seed: number }[] = [];
  const floaters: { o: THREE.Object3D; base: THREE.Vector3; seed: number; book: boolean }[] = [];
  const planets: THREE.Object3D[] = [];
  const smoke: THREE.Vector3[] = [];
  const steam: THREE.Vector3[] = [];
  const neon: { m: THREE.MeshStandardMaterial; base: number }[] = [];
  const movers: { o: THREE.Object3D; y: number; dir: number; speed: number; stand: boolean; car: boolean; legs: THREE.Object3D[]; phase: number }[] = [];
  const mandala: THREE.MeshStandardMaterial[] = [];
  const lamps: Lamp[] = [];
  let curtainL: THREE.Object3D | null = null;
  let curtainR: THREE.Object3D | null = null;
  const curtainBase = { l: 0, r: 0 };
  const doorway = new THREE.Vector3(0.6, 1.2, -11);

  // --- find the parts -----------------------------------------------------------------------
  const found: THREE.Object3D[] = [];
  root.traverse((o) => found.push(o));
  let n = 0;
  for (const o of found) {
    const name = o.name;
    if (o.userData.kind === "eye" && name.startsWith("eye_")) {
      const iris = o.children.find((c) => c.name === `${name}_iris`) ?? null;
      const lid = o.children.find((c) => c.name === `${name}_lid`) ?? null;
      const w = o.getWorldPosition(new THREE.Vector3());
      eyes.push({
        root: o,
        iris,
        lid,
        reachX: Number(iris?.userData.reach_x ?? 0),
        reachZ: Number(iris?.userData.reach_z ?? 0),
        wakeAt: 0.08 + 0.8 * clamp(-w.z / 11),
        peek: name.startsWith("eye_peek"),
        open: 0,
        blinkAt: 2 + hash(n) * 6,
        blinkT: -1,
        seed: n,
      });
      lid?.scale.setY(1); // shut until the shop wakes
    } else if (/^eyeball_\d+$/.test(name)) {
      eyeballs.push({ o, base: o.position.clone(), seed: n });
    } else if (name.startsWith("float_")) {
      floaters.push({ o, base: o.position.clone(), seed: n, book: name.startsWith("float_book") });
    } else if (name.startsWith("planet_")) {
      planets.push(o);
    } else if (name.startsWith("smoke_")) {
      smoke.push(o.getWorldPosition(new THREE.Vector3()));
    } else if (/^(car|ped)_\d+$/.test(name)) {
      movers.push({
        o,
        y: o.position.y,
        dir: Number(o.userData.dir ?? 0),
        speed: Number(o.userData.speed ?? 0),
        stand: Number(o.userData.stand ?? 0) === 1,
        car: name.startsWith("car"),
        legs: o.children.filter((c) => /_l[lr]$/.test(c.name)),
        phase: hash(n) * 6.28,
      });
    } else if (name.startsWith("steam_")) {
      steam.push(o.getWorldPosition(new THREE.Vector3()));
    } else if (name === "curtain_l") {
      curtainL = o;
      curtainBase.l = o.position.x;
    } else if (name === "curtain_r") {
      curtainR = o;
      curtainBase.r = o.position.x;
    } else if (name.startsWith("lamp_")) {
      const kind = String(o.userData.kind ?? "shop");
      const k = KIND[kind] ?? KIND.shop;
      lamps.push({ at: o.getWorldPosition(new THREE.Vector3()), kind, base: k.intensity, seed: n });
    }
    if (o instanceof THREE.Mesh) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (/^m_neon_/.test(m.name) && !neon.some((x) => x.m === m)) neon.push({ m: m as THREE.MeshStandardMaterial, base: (m as THREE.MeshStandardMaterial).emissiveIntensity });
        if (m.name.includes("mandala_glow") && !mandala.includes(m as THREE.MeshStandardMaterial)) mandala.push(m as THREE.MeshStandardMaterial);
      }
    }
    n++;
  }
  // if a side has more lamps than the budget, the plain shop lamps go first
  const order = (l: Lamp) => ({ street: 0, window: 1, violet: 2, magenta: 3, teal: 4, shop: 5 })[l.kind] ?? 5;
  lamps.sort((a, b) => order(a) - order(b));
  const outLamps = lamps.filter((l) => l.at.z > -1.4); // the door is at z = 0, the room beyond it
  const inLamps = lamps.filter((l) => l.at.z <= -1.4);
  const lights = Array.from({ length: Math.min(BUDGET, Math.max(outLamps.length, inLamps.length)) }, () => {
    const light = new THREE.PointLight("#ffffff", 0, 1, 2);
    scene.add(light);
    return light;
  });
  const lit: (Lamp | undefined)[] = [];

  // --- smoke and dust ------------------------------------------------------------------------
  const dot = softDot();
  const PER = 36;
  const smokePos = new Float32Array(smoke.length * PER * 3);
  const smokeCol = new Float32Array(smoke.length * PER * 3);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute("color", new THREE.BufferAttribute(smokeCol, 3));
  const smokeMat = new THREE.PointsMaterial({
    size: 0.2,
    map: dot,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const smokePts = new THREE.Points(smokeGeo, smokeMat);
  smokePts.frustumCulled = false;
  scene.add(smokePts);

  // steam from the drains in the road, for the street outside
  const SP = 26;
  const steamPos = new Float32Array(steam.length * SP * 3);
  const steamCol = new Float32Array(steam.length * SP * 3);
  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  steamGeo.setAttribute("color", new THREE.BufferAttribute(steamCol, 3));
  const steamMat = new THREE.PointsMaterial({ size: 0.9, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const steamPts = new THREE.Points(steamGeo, steamMat);
  steamPts.frustumCulled = false;
  scene.add(steamPts);
  let flickerAt = 5;
  let flickerT0 = -9;

  const DUST = 170;
  const dustPos = new Float32Array(DUST * 3);
  const dustCol = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (hash(i) - 0.5) * 8;
    dustPos[i * 3 + 1] = 0.3 + hash(i + 400) * 6;
    dustPos[i * 3 + 2] = -0.5 - hash(i + 800) * 10.3;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.045,
    map: dot,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const dustPts = new THREE.Points(dustGeo, dustMat);
  dustPts.frustumCulled = false;
  scene.add(dustPts);

  // --- per frame ---------------------------------------------------------------------------------
  const local = new THREE.Vector3();
  const tmp = new THREE.Object3D();
  const camPos = new THREE.Vector3();

  function update(t: number, dt: number, inside: number, camera: THREE.Camera) {
    camera.getWorldPosition(camPos);
    const curtain = smooth(11, 7.4, camPos.distanceTo(doorway)) * smooth(0.3, 0.8, inside);
    if (curtainL) curtainL.position.x = curtainBase.l - 0.58 * curtain;
    if (curtainR) curtainR.position.x = curtainBase.r + 0.58 * curtain;

    // the eyes
    for (const e of eyes) {
      const awake = inside > e.wakeAt && (!e.peek || curtain > 0.45);
      const goal = awake ? 1 : 0;
      e.open += (goal - e.open) * (1 - Math.exp(-dt * (awake ? 7 : 5)));
      e.blinkAt -= dt;
      if (awake && e.blinkAt <= 0 && e.blinkT < 0) e.blinkT = 0;
      let lid = 1 - e.open; // 1 shut
      if (e.blinkT >= 0) {
        e.blinkT += dt / 0.2;
        lid = Math.max(lid, Math.sin(Math.min(1, e.blinkT) * Math.PI));
        if (e.blinkT >= 1) {
          e.blinkT = -1;
          e.blinkAt = 2.5 + hash(e.seed + Math.floor(t)) * 6;
        }
      }
      e.lid?.scale.setY(Math.max(0.02, lid));
      if (e.iris && e.open > 0.15) {
        local.copy(camPos);
        e.root.worldToLocal(local);
        const len = local.length() || 1;
        const front = local.z > 0 ? 1 : 0.3; // behind the eye, it only glances
        const ox = clamp((local.x / len) * 2.4, -1, 1) * e.reachX * front;
        const oy = clamp((local.y / len) * 2.4, -1, 1) * e.reachZ * front;
        const k = 1 - Math.exp(-dt * 9);
        e.iris.position.x += (ox - e.iris.position.x) * k;
        e.iris.position.y += (oy - e.iris.position.y) * k;
      }
    }

    // eyeballs on their cords turn to look, and sway a little
    for (const b of eyeballs) {
      b.o.position.y = b.base.y + Math.sin(t * 0.9 + b.seed) * 0.035;
      b.o.position.x = b.base.x + Math.sin(t * 0.6 + b.seed * 2) * 0.03;
      tmp.position.copy(b.o.position);
      tmp.lookAt(camPos);
      b.o.quaternion.slerp(tmp.quaternion, 1 - Math.exp(-dt * (inside > 0.2 ? 3.5 : 0.5)));
    }

    for (const f of floaters) {
      f.o.position.y = f.base.y + Math.sin(t * 0.6 + f.seed * 1.7) * 0.09;
      f.o.rotation.y += dt * (0.12 + 0.1 * hash(f.seed));
      if (f.book) f.o.rotation.z = Math.sin(t * 0.8 + f.seed) * 0.18;
    }
    for (const p of planets) p.rotation.y += dt * 0.06;

    const pulse = 1.3 + Math.sin(t * 1.1) * 0.7;
    for (const m of mandala) m.emissiveIntensity = pulse;

    const within = inside > 0.55;
    const side = within ? inLamps : outLamps;
    const fade = within ? smooth(0.55, 0.85, inside) : 1 - smooth(0.3, 0.55, inside);
    lights.forEach((light, i) => {
      const l = side[i];
      if (lit[i] !== l) {
        lit[i] = l;
        if (l) {
          const k = KIND[l.kind] ?? KIND.shop;
          light.position.copy(l.at);
          light.color.set(k.color);
          light.distance = k.distance;
        }
      }
      if (!l) return void (light.intensity = 0);
      const flick = l.kind === "street" || l.kind === "window" ? 1 : 0.9 + 0.1 * Math.sin(t * (1.3 + hash(l.seed)) + l.seed);
      light.intensity = l.base * flick * fade;
    });

    // the street: cars cross, people walk, one stays at the window
    for (const m of movers) {
      if (m.stand) {
        m.o.position.y = m.y + Math.sin(t * 1.2 + m.phase) * 0.004;
        m.o.rotation.x = Math.sin(t * 0.7 + m.phase) * 0.012;
        continue;
      }
      m.o.position.x += m.dir * m.speed * dt;
      const edge = m.car ? 26 : 22;
      if (m.o.position.x * m.dir > edge) m.o.position.x = -m.dir * (edge + hash(t + m.phase) * (m.car ? 22 : 8));
      if (!m.car) {
        m.phase += dt * m.speed * 5.4;
        m.o.position.y = m.y + Math.abs(Math.sin(m.phase)) * 0.03;
        m.legs.forEach((leg, i) => (leg.rotation.z = Math.sin(m.phase) * 0.55 * (i ? 1 : -1)));
      }
    }

    // outside: steam rising off the road, and the sign now and then stuttering
    steamMat.visible = inside < 0.95;
    for (let s = 0; s < steam.length; s++) {
      for (let p = 0; p < SP; p++) {
        const i = s * SP + p;
        const life = 5 + hash(i + 200) * 3;
        const u = ((t * 0.55 + hash(i + 300) * life) % life) / life;
        steamPos[i * 3] = steam[s].x + Math.sin(u * 5 + i) * 0.35 * u + 0.25 * u * u;
        steamPos[i * 3 + 1] = steam[s].y + u * 2.1;
        steamPos[i * 3 + 2] = steam[s].z + Math.cos(u * 4 + i * 1.7) * 0.3 * u;
        const a = Math.pow(1 - u, 1.8) * smooth(0, 0.15, u) * 0.11 * (1 - inside);
        steamCol[i * 3] = a * 0.8;
        steamCol[i * 3 + 1] = a * 0.9;
        steamCol[i * 3 + 2] = a * 1.0;
      }
    }
    steamGeo.attributes.position.needsUpdate = true;
    steamGeo.attributes.color.needsUpdate = true;
    if (t > flickerAt) {
      flickerT0 = t;
      flickerAt = t + 7 + hash(t * 3.3) * 9;
    }
    const fu = t - flickerT0;
    const sign = fu >= 0 && fu < 0.45 ? (Math.sin(fu * 70) > -0.2 ? 1 : 0.12) * (fu > 0.3 ? 0.6 + 0.4 * (fu - 0.3) / 0.15 : 1) : 1;
    for (const n of neon) n.m.emissiveIntensity = n.base * sign;

    // smoke, from each burner
    smokeMat.opacity = inside;
    smokeMat.visible = inside > 0.05;
    for (let s = 0; s < smoke.length; s++) {
      for (let p = 0; p < PER; p++) {
        const i = s * PER + p;
        const life = 5 + hash(i) * 2;
        const age = (t * 0.9 + hash(i + 50) * life) % life;
        const u = age / life;
        smokePos[i * 3] = smoke[s].x + Math.sin(u * 7 + i) * 0.12 * u + Math.sin(t * 0.5 + i) * 0.03;
        smokePos[i * 3 + 1] = smoke[s].y + u * 1.9;
        smokePos[i * 3 + 2] = smoke[s].z + Math.cos(u * 6 + i * 1.3) * 0.12 * u;
        const a = Math.pow(1 - u, 1.6) * smooth(0, 0.08, u) * 0.5;
        smokeCol[i * 3] = a * 0.7;
        smokeCol[i * 3 + 1] = a * 0.55;
        smokeCol[i * 3 + 2] = a * 1.0;
      }
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.color.needsUpdate = true;

    // dust, drifting and glinting
    dustMat.visible = inside > 0.05;
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.02;
      dustPos[i * 3 + 1] += dt * (0.015 + 0.02 * hash(i + 9));
      if (dustPos[i * 3 + 1] > 6.5) dustPos[i * 3 + 1] = 0.3;
      const g = (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.8 + hash(i)) + i), 3)) * inside;
      dustCol[i * 3] = g * 1.0;
      dustCol[i * 3 + 1] = g * 0.85;
      dustCol[i * 3 + 2] = g * 0.7;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;
  }

  function dispose() {
    for (const l of lights) scene.remove(l);
    scene.remove(smokePts, dustPts, steamPts);
    steamGeo.dispose();
    steamMat.dispose();
    smokeGeo.dispose();
    dustGeo.dispose();
    smokeMat.dispose();
    dustMat.dispose();
    dot.dispose();
  }

  return { update, dispose };
}
