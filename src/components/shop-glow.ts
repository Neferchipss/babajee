import * as THREE from "three";

// The second model's (tools/blender/build_shop_v2.py) shelf light: warm strips
// hidden under the front of every shelf, as in the pitch video. Rather than a
// light per strip, it is a shader term, like the rotunda's museum light
// (shop-sky.ts): every lit surface inside a shelving unit gets warm light from
// the strip just above it, strongest right under it and fading towards the
// shelf below, so the stock glows and the room around it stays dark.
//
// Each unit is a glow_* empty in the model with
//   box     its extent, Blender x0 y0 z0 x1 y1 z1 (Z up)
//   floor   the height of its lowest shelf (nothing below it is lit)
//   strips  the heights the strips hang at, lowest first

const N_MAX = 24; // units
const S_MAX = 6; // strips in a unit

const PARS = /* glsl */ `
#define GLOW_N ${N_MAX}
#define GLOW_S ${S_MAX}
uniform vec3 uGlowMin[GLOW_N];
uniform vec3 uGlowMax[GLOW_N];
uniform float uGlowFloor[GLOW_N];
uniform float uGlowH[GLOW_N * GLOW_S];
uniform int uGlowCount;
uniform vec3 uGlowColor;
uniform float uGlowFall;
varying vec3 vGlowPos;
float shelfGlow() {
  vec3 p = vGlowPos;
  for (int i = 0; i < GLOW_N; i++) {
    if (i >= uGlowCount) break;
    if (any(lessThan(p, uGlowMin[i])) || any(greaterThan(p, uGlowMax[i])) || p.y < uGlowFloor[i]) continue;
    for (int s = 0; s < GLOW_S; s++) {
      float h = uGlowH[i * GLOW_S + s];
      if (h <= 0.0) break;
      // the first strip above this point is the one lighting it
      if (h >= p.y) return 0.2 + 0.8 * exp(-(h - p.y) / uGlowFall);
    }
    return 0.0;
  }
  return 0.0;
}`;

export function createShelfGlow(root: THREE.Object3D, strength = 1) {
  const min = Array.from({ length: N_MAX }, () => new THREE.Vector3(1e9, 1e9, 1e9));
  const max = Array.from({ length: N_MAX }, () => new THREE.Vector3(-1e9, -1e9, -1e9));
  const floor = new Array<number>(N_MAX).fill(0);
  const heights = new Array<number>(N_MAX * S_MAX).fill(0);
  let count = 0;
  root.traverse((o) => {
    if (!/^glow_\d+$/.test(o.name) || count >= N_MAX) return;
    const box = o.userData.box as number[] | undefined;
    const strips = o.userData.strips as number[] | undefined;
    if (!box || box.length !== 6 || !strips) return;
    // Blender (x, y, z) is three (x, z, -y)
    min[count].set(box[0], box[2], -box[4]);
    max[count].set(box[3], box[5], -box[1]);
    floor[count] = Number(o.userData.floor ?? box[2]);
    strips.slice(0, S_MAX).forEach((h, s) => (heights[count * S_MAX + s] = h));
    count++;
  });

  const uniforms = {
    uGlowMin: { value: min },
    uGlowMax: { value: max },
    uGlowFloor: { value: floor },
    uGlowH: { value: heights },
    uGlowCount: { value: count },
    uGlowColor: { value: new THREE.Color("#ffb468").multiplyScalar(strength) },
    uGlowFall: { value: 0.2 }, // metres for the light to fall to a third
  };

  const patched = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      // not glass (lit by what it reflects) and not what glows by itself
      if (!(m instanceof THREE.MeshStandardMaterial) || m instanceof THREE.MeshPhysicalMaterial || patched.has(m)) continue;
      if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) continue;
      patched.add(m);
      const before = m.onBeforeCompile.bind(m);
      const key = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (sh, r) => {
        before(sh, r);
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGlowPos;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvGlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\n" + PARS)
          .replace("#include <opaque_fragment>", "outgoingLight += diffuseColor.rgb * uGlowColor * shelfGlow();\n#include <opaque_fragment>");
      };
      m.customProgramCacheKey = () => key() + "|glow";
      m.needsUpdate = true;
    }
  });

  return {
    count,
    /** how bright the strips are (1 = as made) */
    setStrength(k: number) {
      uniforms.uGlowColor.value.set("#ffb468").multiplyScalar(k);
    },
  };
}
