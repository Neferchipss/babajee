import * as THREE from "three";

// The second model's baked light (tools/blender/bake_shop_v2.py): Cycles rendered the
// shop's light (the dusk sky, the street lamp, the strips under the shelves, the
// pendants, the light bouncing between walnut and plaster) and stored what lands on
// each surface as a colour per face corner, COLOR_0, as light / scale. Here it is
// added to the light each surface gets, under its texture, in place of live lights.
// Glass and what glows by itself are left as they are.

export function applyBake(root: THREE.Object3D, gain = 1) {
  const scale = Number(root.getObjectByName("lightmaps")?.userData.scale ?? 0);
  if (!scale) return null;
  // Blender's bake is the light a white surface sends back; three wants the light
  // arriving (it divides by pi for a matte surface)
  const uniforms = { uBake: { value: scale * Math.PI * gain } };
  const patched = new Set<THREE.Material>();
  let meshes = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.geometry.attributes.color) return;
    meshes++;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m instanceof THREE.MeshPhysicalMaterial || patched.has(m)) continue;
      // the colour is light, not paint: three must not multiply the surface by it
      m.vertexColors = false;
      if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) continue;
      patched.add(m);
      const before = m.onBeforeCompile.bind(m);
      const key = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (sh, r) => {
        before(sh, r);
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec3 color;\nvarying vec3 vBake;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBake = color;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uBake;\nvarying vec3 vBake;")
          .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\nirradiance += vBake * uBake;");
      };
      m.customProgramCacheKey = () => key() + "|bake";
      m.needsUpdate = true;
    }
  });
  return {
    meshes,
    /** how bright the baked light is (1 = as rendered) */
    setGain(k: number) {
      uniforms.uBake.value = scale * Math.PI * k;
    },
  };
}
