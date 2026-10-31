import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// The surfaces of the shop's inside get real textures (public/textures, made by
// tools/textures/make_textures.py from generated pictures): marble floors and
// table tops, plaster walls, lacquered wood, brushed brass, a velvet runner.
// The products keep their plain colours.
//
// The textures are laid on from the world, not from the models' UVs: each is
// projected along the three axes and blended by which way the surface faces.
// So a wall, a shelf edge and a floor all get it the right way up and at the
// same size, and merged meshes (shop-cull.ts) are no trouble. This runs after
// the museum light (shop-sky.ts) has patched the same materials, and keeps it.

// rough scales the texture's own roughness map (1 = as made); refl is how strongly
// it reflects the room (see reflect below)
type Surface = { tex: string; tint?: string; size: number; rough: number; bump: number; metal?: number; refl?: number };

// material (by its name in the model) -> texture, how many metres one tile covers
const SURFACES: Record<string, Surface> = {
  m_marble_ivory: { tex: "marble_ivory", size: 1.6, rough: 1, bump: 0.2, refl: 0.3 },
  m_marble_table: { tex: "marble_ivory", tint: "#d8cfc4", size: 2.8, rough: 0.6, bump: 0.15, refl: 0.25 }, // larger veins than the floor's, and polished brighter
  m_marble_taupe: { tex: "marble_ivory", tint: "#b3a590", size: 1.6, rough: 1.1, bump: 0.2, refl: 0.3 },
  m_marble_grey: { tex: "marble_black", tint: "#9a9399", size: 1.2, rough: 1, bump: 0.2, refl: 0.8 },
  m_marble_black: { tex: "marble_black", size: 1.2, rough: 1, bump: 0.2, refl: 0.9 },
  m_marble: { tex: "marble_ivory", size: 1.2, rough: 1, bump: 0.2, refl: 0.7 },
  m_plum: { tex: "plaster_plum", tint: "#9a7090", size: 2.4, rough: 1, bump: 0.5 },
  m_indigo: { tex: "plaster_plum", tint: "#6a5a9a", size: 2.4, rough: 1, bump: 0.5 },
  m_niche_back: { tex: "plaster_plum", tint: "#5a4458", size: 2.0, rough: 1, bump: 0.5 },
  m_plum_light: { tex: "wood_lacquer", tint: "#e6c0c8", size: 1.1, rough: 1, bump: 0.35, refl: 0.4 },
  m_lacquer: { tex: "wood_lacquer", tint: "#6a5058", size: 1.1, rough: 0.9, bump: 0.35, refl: 0.45 },
  m_cedar: { tex: "wood_lacquer", tint: "#ffd2a8", size: 0.9, rough: 1.3, bump: 0.35 },
  m_brass: { tex: "brass", size: 0.6, rough: 1, bump: 0.3, metal: 1 },
  m_gold: { tex: "brass", tint: "#ffe2a0", size: 0.6, rough: 0.85, bump: 0.3, metal: 1 },
  m_runner: { tex: "velvet", size: 0.9, rough: 1, bump: 0.6 },
};

const VERT_PARS = /* glsl */ `
varying vec3 vTriPos;
varying vec3 vTriNrm;`;
const VERT_MAIN = /* glsl */ `
vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriNrm = normalize(mat3(modelMatrix) * objectNormal);`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uTriMap;
uniform sampler2D uTriNormal;
uniform sampler2D uTriRough;
uniform float uTriRoughScale;
uniform vec3 uTriTint;
uniform float uTriSize;
uniform float uTriBump;
varying vec3 vTriPos;
varying vec3 vTriNrm;
vec3 triWeights() {
  vec3 w = pow(abs(normalize(vTriNrm)), vec3(4.0));
  return w / (w.x + w.y + w.z);
}`;

// the colour: the three projections, blended
const FRAG_MAP = /* glsl */ `
{
  vec3 tw = triWeights();
  vec3 p = vTriPos / uTriSize;
  vec3 tc = texture2D(uTriMap, p.zy).rgb * tw.x + texture2D(uTriMap, p.xz).rgb * tw.y + texture2D(uTriMap, p.xy).rgb * tw.z;
  diffuseColor.rgb *= tc * uTriTint;
}`;

// how rough: the texture's own roughness map, blended the same way
const FRAG_ROUGH = /* glsl */ `
{
  vec3 tw = triWeights();
  vec3 p = vTriPos / uTriSize;
  float r = texture2D(uTriRough, p.zy).g * tw.x + texture2D(uTriRough, p.xz).g * tw.y + texture2D(uTriRough, p.xy).g * tw.z;
  roughnessFactor = clamp(r * uTriRoughScale, 0.04, 1.0);
}`;

// the relief: each projection's normal map tilts the surface along the two
// axes it was laid along, then that is turned into the view's frame
const FRAG_NORMAL = /* glsl */ `
{
  vec3 tw = triWeights();
  vec3 p = vTriPos / uTriSize;
  vec3 s = sign(vTriNrm);
  vec2 nx = texture2D(uTriNormal, p.zy).xy * 2.0 - 1.0;
  vec2 ny = texture2D(uTriNormal, p.xz).xy * 2.0 - 1.0;
  vec2 nz = texture2D(uTriNormal, p.xy).xy * 2.0 - 1.0;
  vec3 d = vec3(0.0, nx.y, nx.x * s.x) * tw.x + vec3(ny.x * s.y, 0.0, ny.y) * tw.y + vec3(nz.x * s.z, nz.y, 0.0) * tw.z;
  normal = normalize(normal + (viewMatrix * vec4(d * uTriBump, 0.0)).xyz);
}`;

// the table tops: a true mirror of the room laid over the marble, strongest
// at a glancing angle and where the stone is most polished
const FRAG_MIRROR = /* glsl */ `
{
  vec4 mp = uMirrorMat * vec4(vTriPos, 1.0);
  vec2 muv = mp.xy / mp.w + normal.xy * 0.015;
  vec3 seen = texture2D(uMirror, muv).rgb;
  float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = mix(0.06, 0.75, pow(1.0 - facing, 4.0));
  float polish = clamp(1.0 - roughnessFactor * 2.5, 0.0, 1.0);
  // what is reflected takes the place of some of the stone's own light, as on a real
  // polished top; adding it on instead makes the top look lit from inside
  outgoingLight = mix(outgoingLight, seen, fres * polish * uMirrorOn);
}`;

export function applyTextures(root: THREE.Object3D, renderer: THREE.WebGLRenderer) {
  // the table tops (all at one height) can mirror the room; see mirrorTables below
  const mirror = {
    uMirror: { value: null as THREE.Texture | null },
    uMirrorMat: { value: new THREE.Matrix4() },
    uMirrorOn: { value: 0 },
  };
  let tableMat: THREE.Material | null = null;
  let tableTop = 0;
  const loader = new THREE.TextureLoader();
  const loaded = new Map<string, { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture }>();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (name: string) => {
    let t = loaded.get(name);
    if (t) return t;
    const map = loader.load(`/textures/${name}.webp`);
    map.colorSpace = THREE.SRGBColorSpace;
    const normal = loader.load(`/textures/${name}_n.webp`);
    const rough = loader.load(`/textures/${name}_r.webp`);
    for (const x of [map, normal, rough]) {
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.anisotropy = aniso;
    }
    loaded.set(name, (t = { map, normal, rough }));
    return t;
  };

  const done = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const s = SURFACES[m.name];
      if (!s || done.has(m) || !(m instanceof THREE.MeshStandardMaterial)) continue;
      done.add(m);
      const t = load(s.tex);
      // the material's own colour would tint the texture twice: the texture brings the colour now
      m.color.set("#ffffff");
      m.roughness = 1; // the roughness map decides
      if (s.metal !== undefined) m.metalness = s.metal;
      const uniforms = {
        uTriMap: { value: t.map },
        uTriNormal: { value: t.normal },
        uTriRough: { value: t.rough },
        uTriRoughScale: { value: s.rough },
        uTriTint: { value: new THREE.Color(s.tint ?? "#ffffff") },
        uTriSize: { value: s.size },
        uTriBump: { value: s.bump },
      };
      const isTable = m.name === "m_marble_table";
      if (isTable) {
        tableMat = m;
        tableTop = Math.max(tableTop, new THREE.Box3().setFromObject(o).max.y);
      }
      const before = m.onBeforeCompile.bind(m);
      const key = m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (sh, r) => {
        before(sh, r);
        Object.assign(sh.uniforms, uniforms);
        if (isTable) {
          Object.assign(sh.uniforms, mirror);
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform sampler2D uMirror;\nuniform mat4 uMirrorMat;\nuniform float uMirrorOn;")
            .replace("#include <opaque_fragment>", FRAG_MIRROR + "\n#include <opaque_fragment>");
        }
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\n" + VERT_PARS)
          .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + VERT_MAIN);
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\n" + FRAG_PARS)
          .replace("#include <map_fragment>", "#include <map_fragment>\n" + FRAG_MAP)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + FRAG_ROUGH)
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + FRAG_NORMAL);
      };
      m.customProgramCacheKey = () => key() + (isTable ? "|tri|mirror" : "|tri");
      m.needsUpdate = true;
    }
  });

  return {
    // a picture of the room all round, from where you stand: polished marble
    // and lacquer reflect it, so the shelves, the glow and the torches show in them
    reflect(env: THREE.Texture) {
      for (const m of done) {
        const s = SURFACES[m.name];
        if (!s?.refl || !(m instanceof THREE.MeshStandardMaterial)) continue;
        m.envMap = env;
        m.envMapIntensity = s.refl;
        m.needsUpdate = true;
      }
    },
    // Mirrors the room in the table tops. It draws the scene once more, from
    // below the tops looking up, at half size, so it is for desktops; call
    // update(camera) each frame before the frame is drawn.
    mirrorTables(scene: THREE.Scene, width: number, height: number) {
      if (!tableMat) return null;
      const mat = tableMat;
      const plane = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: width, textureHeight: height, clipBias: 0.002, multisample: 0 });
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = tableTop + 0.0005;
      plane.updateMatrixWorld(true);
      const toLocal = plane.matrixWorld.clone().invert();
      const tm = (plane.material as THREE.ShaderMaterial).uniforms.textureMatrix.value as THREE.Matrix4;
      mirror.uMirror.value = plane.getRenderTarget().texture;
      mirror.uMirrorOn.value = 1;
      return {
        update(camera: THREE.Camera) {
          mat.visible = false; // the tops must not be in their own reflection
          plane.onBeforeRender(renderer, scene, camera, plane.geometry, plane.material as THREE.Material, null as unknown as THREE.Group);
          mat.visible = true;
          mirror.uMirrorMat.value.multiplyMatrices(tm, toLocal);
        },
        setSize(w: number, h: number) {
          plane.getRenderTarget().setSize(w, h);
        },
        dispose() {
          mirror.uMirrorOn.value = 0;
          plane.dispose();
        },
      };
    },
    dispose() {
      for (const t of loaded.values()) {
        t.map.dispose();
        t.normal.dispose();
        t.rough.dispose();
      }
    },
  };
}
