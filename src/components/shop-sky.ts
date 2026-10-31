import * as THREE from "three";

// The light and the sky of the shop's inside (see tools/blender/shop_rotunda.py
// for the names). The room is kept dim, like a museum after hours: each alcove
// is lit as a case of its own, and the one light from above is the rose window
// in the oculus. It lights the floor where you stand, and a follow-spot from it
// tracks the cursor (on a phone, the dot in the middle) across the shelves, a
// soft hot pool wherever you point, on the shelves or the floor. Overhead a
// slow nebula turns, the stars twinkle and now and then one falls.
//
//   dome        gets the moving sky painted on it
//   m_star*     the stars on the dome: each set twinkles on its own beat
//   rose        the rose window in the oculus, turned slowly
//   alcove_*    (extras.half) lit across that angle, by its hot_* label's angle
//   torch_*     where a flame sits, on the piers between the alcoves: the two
//               either side of the alcove in focus catch light
//   candle_*    (extras.alcove) a candle's wick on that alcove's shelves: lit with it
//
// Which way you face is never in doubt: the cases are lit warm towards Baba
// and cooler towards the door, rosy down one side and icy down the other, and
// the sky over each side follows (magenta over the rosy one, teal over the other).

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCentre;
uniform vec2 uSide; // towards the rosy side of the room, from above
uniform vec3 uMeteor; // where on the sky it starts (x, y) and how far along it is (z, < 0 when none)
uniform vec2 uMeteorDir;
varying vec3 vWorld;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

void main() {
  vec3 d = normalize(vWorld - uCentre);
  float up = clamp(d.y, 0.0, 1.0); // 0 at the rim, 1 at the top
  vec2 p = d.xz / (1.0 + d.y); // flattened from above: the top in the middle
  vec2 q = turn(p, uTime * 0.012);
  // which side of the room this bit of sky is over: 1 rosy, -1 icy (the clouds drift, this does not)
  float side = dot(normalize(d.xz + 1e-4), uSide);

  // the night: deep at the rim, richer towards the top
  vec3 col = mix(vec3(0.014, 0.006, 0.036), vec3(0.045, 0.016, 0.115), up);
  // nebula: a magenta cloud over one side, a teal one over the other, bright wisps where they meet
  float w = fbm(q * 2.4 + vec2(0.0, uTime * 0.01));
  float a = smoothstep(0.42, 0.85, fbm(q * 1.7 + w * 1.4)) * smoothstep(-0.7, 0.6, side);
  float b = smoothstep(0.46, 0.88, fbm(turn(q, 1.9) * 2.1 - w * 1.1 + 4.0)) * smoothstep(0.7, -0.6, side);
  col += vec3(0.62, 0.08, 0.40) * a * 0.6;
  col += vec3(0.04, 0.45, 0.50) * b * 0.5;
  col += vec3(1.0, 0.75, 0.95) * pow(a * b, 1.2) * 1.4;
  col += vec3(0.30, 0.18, 0.75) * smoothstep(0.55, 0.95, w) * 0.22;
  // the glow round the oculus
  col += vec3(1.0, 0.72, 0.38) * pow(up, 16.0) * 0.6;

  // a fine dust of small stars, twinkling
  vec2 g = q * 90.0;
  vec2 cell = floor(g);
  float r = h21(cell);
  if (r > 0.93) {
    vec2 c = cell + 0.5 + 0.35 * vec2(h21(cell + 3.1) - 0.5, h21(cell + 7.7) - 0.5);
    float s = 1.0 - smoothstep(0.0, 0.16, length(g - c));
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + 3.0 * h21(cell + 1.3)) + r * 40.0);
    col += vec3(1.0, 0.92, 0.82) * s * tw * (0.6 + 1.4 * (r - 0.93) / 0.07);
  }

  // a falling star: a bright head and a fading tail
  if (uMeteor.z >= 0.0) {
    vec2 head = uMeteor.xy + uMeteorDir * uMeteor.z * 0.9;
    vec2 tail = head - uMeteorDir * 0.28;
    vec2 pa = p - tail, ba = head - tail;
    float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float dist = length(pa - ba * k);
    float life = sin(3.14159 * clamp(uMeteor.z, 0.0, 1.0));
    col += vec3(1.0, 0.9, 0.75) * (1.0 - smoothstep(0.0, 0.006 + 0.004 * k, dist)) * k * k * life * 6.0;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const BEAM_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong; // 0 at the oculus, 1 at the far end
void main() {
  vAlong = 1.0 - uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  // the beam is stretched along its length: normals need the inverse transpose, or its
  // edges never fade out and end in a hard line
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uBright;
uniform float uTop;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAlong;
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float tip = 1.0 - smoothstep(0.55, 1.0, vAlong); // melts away before the alcove, no hard end
  float core = pow(abs(dot(normalize(vNormal), v)), 1.2); // full face-on, gone at the edges
  // thin near the oculus, fullest where it reaches the alcove
  float fall = 0.35 + 0.65 * smoothstep(uTop, uTop - 6.0, vWorld.y);
  float drift = 0.8 + 0.2 * sin(vWorld.y * 1.3 - uTime * 0.6) * sin(vWorld.y * 0.47 + uTime * 0.23);
  gl_FragColor = vec4(uTint * core * fall * drift * tip * uBright, 1.0);
}`;

// the museum light, added to every lit material in the model: inside an
// alcove, a soft downlight from the top of it, tinted by where it is in the
// ring; and a hot white pool wherever the follow-spot is pointed
const N_MAX = 24;
const MUSEUM_PARS = /* glsl */ `
uniform vec3 uMuCentre;
uniform vec3 uMuRange; // inner radius, outer radius, height of the lights
uniform vec4 uMuA[${N_MAX}]; // angle, half its width, how lit, unused
uniform vec4 uMuSpot; // the follow-spot: where it lands (xyz), how bright
uniform vec3 uMuTint[${N_MAX}];
uniform int uMuN;
varying vec3 vMuPos;
// the follow-spot: a soft pool round where it lands, on the shelves or the floor alike
vec3 museumSpot() {
  float sd = clamp(1.0 - length(vMuPos - uMuSpot.xyz) / 1.45, 0.0, 1.0);
  return vec3(1.0, 0.66, 0.34) * uMuSpot.w * sd * sd * (3.0 - 2.0 * sd); // warm, like the torches
}
vec3 museum() {
  vec3 L = museumSpot();
  vec3 rel = vMuPos - uMuCentre;
  float r = length(rel.xz);
  if (r < uMuRange.x || r > uMuRange.y || rel.y > uMuRange.z + 0.8) return L;
  float a = atan(rel.z, rel.x);
  float below = max(uMuRange.z - rel.y, 0.0);
  float down = 1.0 / (1.0 + 0.2 * below * below); // falls away hard towards the floor
  for (int i = 0; i < ${N_MAX}; i++) {
    if (i >= uMuN) break;
    vec4 A = uMuA[i];
    float da = abs(mod(a - A.x + 3.14159265, 6.2831853) - 3.14159265);
    if (da > A.y) continue;
    float across = 1.0 - smoothstep(A.y * 0.3, A.y * 0.95, da); // dark at the sides
    L += uMuTint[i] * A.z * across * down;
  }
  return L;
}`;

type Case = { name: string; angle: number; half: number; at: THREE.Vector3; tint: THREE.Color };

export function createSky(root: THREE.Object3D, scene: THREE.Scene) {
  const made: THREE.Material[] = [];
  const patched: THREE.Material[] = [];
  const stars: { m: THREE.MeshStandardMaterial; base: number; seed: number }[] = [];
  let rose: THREE.Object3D | null = null;
  let dome: THREE.Mesh | null = null;
  let top = 12;

  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const alcoves: { o: THREE.Object3D; half: number }[] = [];
  const torchAt: THREE.Vector3[] = [];
  const candleAt: { at: THREE.Vector3; alcove: string }[] = [];
  root.traverse((o) => {
    if (o.name === "rose") rose = o;
    if (o.name.startsWith("candle_") && o.userData.alcove) candleAt.push({ at: o.getWorldPosition(new THREE.Vector3()), alcove: String(o.userData.alcove) });
    if (/^torch_\d+$/.test(o.name)) torchAt.push(o.getWorldPosition(new THREE.Vector3()));
    if (o.name.startsWith("alcove_") && o.userData.half !== undefined) alcoves.push({ o, half: Number(o.userData.half) });
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === "dome") dome = o;
    if (o.name === "oculus_drum") top = new THREE.Box3().setFromObject(o).max.y;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (/^m_star/.test(m.name) && !stars.some((s) => s.m === m)) {
        stars.push({ m: m as THREE.MeshStandardMaterial, base: (m as THREE.MeshStandardMaterial).emissiveIntensity, seed: stars.length });
      }
    }
  });

  // the middle of the room, at the foot of the dome
  const centre = new THREE.Vector3();
  if (dome) {
    box.setFromObject(dome);
    centre.set((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
  }
  const domeFoot = dome ? box.min.y : 5;
  const radius = dome ? (box.max.x - box.min.x) / 2 : 4.8;

  // the cases, each found by its label; Baba's (bongs) is the front of the room
  const cases: Case[] = [];
  for (const { o, half } of alcoves) {
    const hot = root.getObjectByName("hot_" + o.name.slice("alcove_".length));
    if (!hot) continue;
    const at = hot.getWorldPosition(new THREE.Vector3());
    cases.push({ name: hot.name, angle: Math.atan2(at.z - centre.z, at.x - centre.x), half, at, tint: new THREE.Color() });
  }
  const front = cases.find((c) => c.name === "hot_bong")?.angle ?? -Math.PI / 2;
  const WARM = new THREE.Color("#ffc98a");
  const ROSY = new THREE.Color("#ff9fc0");
  const ICY = new THREE.Color("#9fd8ff");
  const PALE = new THREE.Color("#e6dccf");
  for (const c of cases) {
    const d = wrap(c.angle - front); // 0 under Baba, ±π at the door
    const k = Math.abs(d) / Math.PI;
    c.tint.copy(WARM).lerp(d > 0 ? ROSY : ICY, smooth01(k * 1.6)).lerp(PALE, smooth01((k - 0.6) / 0.4));
  }
  const rosy = new THREE.Vector2(Math.cos(front + Math.PI / 2), Math.sin(front + Math.PI / 2));

  // --- the museum light, added to every lit material ------------------------------------------
  const muA = Array.from({ length: N_MAX }, () => new THREE.Vector4());
  const muTint = Array.from({ length: N_MAX }, () => new THREE.Color(0, 0, 0));
  cases.forEach((c, i) => {
    muA[i].set(c.angle, c.half, 0, 0);
    muTint[i].copy(c.tint);
  });
  const mu = {
    uMuCentre: { value: centre },
    uMuRange: { value: new THREE.Vector3(radius - 0.2, radius + 1.2, domeFoot - 0.9) },
    uMuA: { value: muA },
    uMuTint: { value: muTint },
    uMuN: { value: Math.min(N_MAX, cases.length) },
    uMuSpot: { value: new THREE.Vector4(0, 2, 0, 0) },
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      // not the glass: it is lit by what it reflects and lets through
      if (!(m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshStandardMaterial) || m instanceof THREE.MeshPhysicalMaterial || patched.includes(m)) continue;
      patched.push(m);
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, mu);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vMuPos;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvMuPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\n" + MUSEUM_PARS)
          // and a little of the spot's own glow, so its pool still reads on the near-black floor
          .replace("#include <opaque_fragment>", "outgoingLight += diffuseColor.rgb * museum() + museumSpot() * 0.06;\n#include <opaque_fragment>");
      };
      m.customProgramCacheKey = () => "museum";
      m.needsUpdate = true;
    }
  });

  // --- the sky ---------------------------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCentre: { value: new THREE.Vector3(centre.x, domeFoot, centre.z) },
      uSide: { value: rosy },
      uMeteor: { value: new THREE.Vector3(0, 0, -1) },
      uMeteorDir: { value: new THREE.Vector2(1, 0) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.DoubleSide,
  });
  made.push(skyMat);
  if (dome) {
    const d = dome as THREE.Mesh;
    (d.material as THREE.Material).dispose();
    d.material = skyMat;
  }

  // --- the light from the oculus --------------------------------------------------------------
  // straight down: a pool where you stand
  const down = new THREE.SpotLight("#ffb874", 0, 20, 0.26, 0.85, 2);
  down.position.set(centre.x, top, centre.z);
  down.target.position.set(centre.x, 0, centre.z);
  // and the follow-spot: from the rose window onto whatever you are looking at
  const follow = new THREE.SpotLight("#ffa458", 0, 24, 0.1, 1, 2); // all penumbra: no hard rim where it falls
  follow.position.set(centre.x, top - 0.6, centre.z);
  scene.add(down, down.target, follow, follow.target);

  const beamGeo = new THREE.CylinderGeometry(0.22, 1, 1, 28, 1, true);
  beamGeo.translate(0, -0.5, 0); // the top at the origin, hanging down one unit
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color("#ffad5e") }, uBright: { value: 0 }, uTop: { value: top }, uTime: { value: 0 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true, // keeps it out of the ambient occlusion and the depth buffer
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  made.push(beamMat);
  // three small lamps hung in the dome, two either side of Baba and one over the door,
  // each throwing a dim beam; all three meet on the spot
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.9) });
  const lampGeo = new THREE.SphereGeometry(0.08, 16, 10);
  made.push(lampMat);
  const rigs = [Math.PI / 3, Math.PI, -Math.PI / 3].map((da) => {
    const a = front + da;
    // hung well clear of the dome: a beam that grazes it is cut off in a hard line
    const from = new THREE.Vector3(centre.x + Math.cos(a) * 2.1, top - 3.2, centre.z + Math.sin(a) * 2.1);
    const mesh = new THREE.Mesh(beamGeo, beamMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.copy(from);
    scene.add(mesh, lamp);
    return { from, mesh, lamp, dir: new THREE.Vector3(), len: 1 };
  });
  const beamAt = new THREE.Vector3();
  const beamTo = new THREE.Vector3();
  const beamWidth = 0.5;
  let beamOn = 0;
  let aimed = false;
  // where the cursor's ray last met the shelves or the floor (see pick), and whether it did this frame
  const hit = { at: new THREE.Vector3(), ok: false };
  const spotAt = new THREE.Vector3(); // the pool, easing after it

  // --- the torches ------------------------------------------------------------------------------
  // a flame is two soft sprites, an orange body and a bright core; two real lights
  // go to whichever torches burn brightest, so there are never more than two
  const flameTex = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.translate(32, 96);
    g.scale(1, 2.4);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(-32, -40, 64, 54);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const bodyMat = new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(1.5, 0.35, 2.6) /* a violet flame: Baba's fire, not a hearth */, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const coreMat = new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(2.2, 1.5, 2.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  made.push(bodyMat, coreMat);
  const flame = (at: THREE.Vector3, size: number, seed: number) => {
    const body = new THREE.Sprite(bodyMat);
    const core = new THREE.Sprite(coreMat);
    for (const sp of [body, core]) {
      sp.center.set(0.5, 0.2); // grows up out of the cup, or the wick
      sp.position.copy(at);
      sp.visible = false;
      sp.renderOrder = 3;
      scene.add(sp);
    }
    return { at, body, core, size, angle: Math.atan2(at.z - centre.z, at.x - centre.x), lit: 0, seed };
  };
  const torches = torchAt.map((at, i) => flame(at, 1, i * 1.37));
  // candles are small flames with no light of their own: the torches beside them light the case
  const candles = candleAt.map((c, i) => ({ ...flame(c.at, 0.42, i * 2.11 + 0.5), alcove: c.alcove }));
  const fires = [0, 1].map(() => {
    const l = new THREE.PointLight("#a46bff", 0, 5.5, 2);
    scene.add(l);
    return l;
  });

  // dust turning slowly in the beam
  const MOTES = 70;
  const motePos = new Float32Array(MOTES * 3);
  const moteCol = new Float32Array(MOTES * 3);
  const mote = Array.from({ length: MOTES }, (_, i) => ({
    s: hash(i * 97),
    ang: hash(i * 31) * Math.PI * 2,
    rad: Math.sqrt(hash(i * 13)),
    speed: 0.008 + 0.012 * hash(i * 5),
    tw: hash(i * 11) * 6.28,
  }));
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute("color", new THREE.BufferAttribute(moteCol, 3));
  const dot = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const moteMat = new THREE.PointsMaterial({ size: 0.045, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  made.push(moteMat);
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  const v = new THREE.Vector3();
  const side = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);
  let meteorAt = 6;
  let meteorT = -1;
  const meteorLen = 1.1;

  // focus: the hot_* name of the category the cursor (or the dot) is on, or ""
  function update(t: number, dt: number, inside: number, focus: string) {
    const on = clamp((inside - 0.5) / 0.5);
    skyMat.uniforms.uTime.value = t;

    // now and then a star falls across the dome
    if (on > 0.5 && t > meteorAt && meteorT < 0) {
      meteorT = 0;
      const a = hash(t) * Math.PI * 2;
      const r = 0.25 + 0.3 * hash(t + 1);
      (skyMat.uniforms.uMeteor.value as THREE.Vector3).set(Math.cos(a) * r, Math.sin(a) * r, 0);
      const da = a + Math.PI / 2 + (hash(t + 2) - 0.5);
      (skyMat.uniforms.uMeteorDir.value as THREE.Vector2).set(Math.cos(da), Math.sin(da));
    }
    if (meteorT >= 0) {
      meteorT += dt / meteorLen;
      if (meteorT > 1) {
        meteorT = -1;
        meteorAt = t + 5 + hash(t * 1.7) * 9;
      }
    }
    (skyMat.uniforms.uMeteor.value as THREE.Vector3).z = meteorT;
    for (const s of stars) s.m.emissiveIntensity = s.base * (0.55 + 0.45 * Math.sin(t * (1.1 + 0.7 * s.seed) + s.seed * 2.1));
    if (rose) (rose as THREE.Object3D).rotation.y += dt * 0.05;

    // the follow-spot trails the cursor across the shelves, a touch behind it like a
    // hand-held light, and fades when the cursor is off them
    if (hit.ok) {
      if (!aimed) spotAt.copy(hit.at); // the first time, it simply comes up there
      aimed = true;
      spotAt.lerp(hit.at, 1 - Math.exp(-dt * 9));
    }
    beamOn += ((hit.ok ? 1 : 0) - beamOn) * (1 - Math.exp(-dt * 4));
    hit.ok = false;
    const breath = 0.88 + 0.12 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1.0);
    // the cases: all softly lit, sinking a little while the spot is up so it stands out
    cases.forEach((c, i) => muA[i].set(c.angle, c.half, (0.95 - 0.35 * beamOn) * on, 0));
    (mu.uMuSpot.value as THREE.Vector4).set(spotAt.x, spotAt.y, spotAt.z, 0.5 * beamOn * on);

    // the torches either side of the alcove in focus flare up; the rest go out, more slowly
    const target = cases.find((c) => c.name === focus);
    const near = (edge: number) => torches.reduce((best, x) => (Math.abs(wrap(x.angle - edge)) < Math.abs(wrap(best.angle - edge)) ? x : best), torches[0]);
    const pair = target && torches.length ? [near(target.angle - target.half), near(target.angle + target.half)] : [];
    const burn = (x: (typeof torches)[number], want: number, quick: number) => {
      x.lit += (want - x.lit) * (1 - Math.exp(-dt * (want > x.lit ? quick : 5)));
      const show = x.lit > 0.01;
      x.body.visible = x.core.visible = show;
      if (!show) return;
      // a whoosh as it catches, then a restless flicker
      const catchUp = 1 + 0.4 * Math.sin(Math.PI * clamp(x.lit));
      const fl = 0.82 + 0.1 * Math.sin(t * 11 + x.seed) + 0.08 * Math.sin(t * 23.7 + x.seed * 3.1);
      const h = 0.46 * x.size * x.lit * catchUp * fl;
      x.body.scale.set(0.24 * x.size * x.lit * fl, h, 1);
      x.core.scale.set(0.1 * x.size * x.lit, h * 0.5, 1);
      x.body.position.set(x.at.x + Math.sin(t * 7 + x.seed) * 0.006 * x.size, x.at.y, x.at.z);
    };
    for (const x of torches) burn(x, pair.includes(x) ? on : 0, 16);
    // the candles catch one after another, a beat behind the torches
    for (const x of candles) burn(x, target && x.alcove === target.name ? on : 0, 9 + 3 * (x.seed % 1.5));
    const bright = [...torches].sort((a, b) => b.lit - a.lit);
    fires.forEach((l, i) => {
      const x = bright[i];
      if (!x || x.lit < 0.01) return void (l.intensity = 0);
      l.position.set(x.at.x, x.at.y + 0.18, x.at.z);
      l.intensity = 9 * x.lit * (0.85 + 0.1 * Math.sin(t * 13 + x.seed) + 0.05 * Math.sin(t * 29 + x.seed));
    });
    // the beams stop in the air well short of where they land: anywhere one pushes into
    // the wall, the piers or the arches it is cut off in a hard line, so each melts away
    // before it gets there; the pool does the lighting
    beamTo.copy(spotAt);
    for (const r of rigs) {
      beamAt.copy(r.from).lerp(beamTo, 0.74);
      r.dir.subVectors(beamAt, r.from);
      r.len = r.dir.length();
      r.dir.normalize();
      r.mesh.position.copy(r.from);
      r.mesh.quaternion.setFromUnitVectors(DOWN, r.dir);
      r.mesh.scale.set(beamWidth, r.len, beamWidth);
      r.mesh.visible = beamOn * on > 0.01;
      r.lamp.visible = on > 0.01;
    }
    beamMat.uniforms.uTime.value = t;
    beamMat.uniforms.uBright.value = 0.04 * beamOn * on * breath;
    follow.target.position.copy(beamTo);
    follow.angle = Math.atan(1.25 / follow.position.distanceTo(beamTo)) * 1.4;
    follow.intensity = 120 * beamOn * on;
    down.intensity = 70 * on * breath;

    mote.forEach((m, i) => {
      m.s = (m.s + m.speed * dt) % 1;
      m.ang += dt * 0.15;
      const rig = rigs[i % rigs.length];
      v.copy(rig.from).addScaledVector(rig.dir, rig.len * (0.15 + 0.85 * m.s));
      const r = beamWidth * (0.22 + 0.78 * m.s) * m.rad * 0.8;
      side.set(-rig.dir.z, 0, rig.dir.x).normalize();
      v.addScaledVector(side, Math.cos(m.ang) * r);
      v.y += Math.sin(m.ang) * r * 0.5;
      motePos[i * 3] = v.x;
      motePos[i * 3 + 1] = v.y;
      motePos[i * 3 + 2] = v.z;
      const glow = beamOn * on * (0.4 + 0.6 * Math.sin(t * 1.7 + m.tw) ** 2) * Math.sin(Math.PI * m.s);
      moteCol[i * 3] = glow;
      moteCol[i * 3 + 1] = glow * 0.9;
      moteCol[i * 3 + 2] = glow * 0.75;
    });
    moteGeo.attributes.position.needsUpdate = true;
    moteGeo.attributes.color.needsUpdate = true;
  }

  // where a ray from the eye lands: on the floor, or on the ring of alcoves below
  // the arches, whichever comes first. The follow-spot goes there next. Returns
  // the case it lands on (its hot_* name), or "" for the floor or nothing.
  function pick(ray: THREE.Ray) {
    const o = ray.origin;
    const d = ray.direction;
    if (d.y < 0) {
      const s = -o.y / d.y;
      const fx = o.x + d.x * s - centre.x;
      const fz = o.z + d.z * s - centre.z;
      if (fx * fx + fz * fz < radius * radius) {
        hit.at.set(fx + centre.x, 0, fz + centre.z);
        hit.ok = true;
        return "";
      }
    }
    const ox = o.x - centre.x;
    const oz = o.z - centre.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-6) return "";
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - radius * radius;
    const s = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;
    const y = o.y + d.y * s;
    if (s <= 0 || y < 0 || y > domeFoot - 0.2) return "";
    const ang = Math.atan2(oz + d.z * s, ox + d.x * s);
    // a little into the alcove, among the things on the shelves rather than at their front edge
    hit.at.set(centre.x + Math.cos(ang) * (radius + 0.25), y, centre.z + Math.sin(ang) * (radius + 0.25));
    hit.ok = true;
    return cases.find((k) => Math.abs(wrap(ang - k.angle)) < k.half)?.name ?? "";
  }

  function dispose() {
    scene.remove(down, down.target, follow, follow.target, motes);
    for (const r of rigs) scene.remove(r.mesh, r.lamp);
    for (const x of [...torches, ...candles]) scene.remove(x.body, x.core);
    scene.remove(...fires);
    flameTex.dispose();
    beamGeo.dispose();
    lampGeo.dispose();
    moteGeo.dispose();
    dot.dispose();
    for (const m of made) m.dispose();
    for (const m of patched) m.onBeforeCompile = () => {};
  }

  return { update, pick, dispose };
}

function smooth01(n: number) {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
}
