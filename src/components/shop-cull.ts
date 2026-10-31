import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Fewer, bigger draws, and nothing drawn that cannot be seen.
//
// The model comes as ~600 small meshes, one per object and material: every
// one is a draw call, and the frame draws the scene up to three times (the
// image, the ambient occlusion's normals, the glass). So everything that never
// moves is merged, one mesh per material per piece of the scene: the room in
// eight wedges round its middle, the street in strips. The pieces keep the
// camera's frustum culling worth having; one mesh per material would not.
//
// And two zones, joined by the door: on the street, with the door shut, the
// inside cannot be seen past the facade; inside, once the door has shut behind
// you, the street cannot be seen either. Each is hidden while it cannot be
// seen. Things across the threshold (the passage, the window display) belong
// to both and are always drawn.
//
// Anything the site moves or looks up by name is left as it is.

const MOVES = /^(eye_|eyeball_|float_|planet_|flybook_|car_|ped_|curtain_|door_leaf|rose$|dome$|book_|bslot_|step_|ladder$|roll_|portrait_|grind_top|lflame_|chalk_board)/;

type Zone = "street" | "inside" | "both";

export function optimiseScene(root: THREE.Object3D, centre: THREE.Vector3) {
  root.updateMatrixWorld(true);
  const moves = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (MOVES.test(p.name)) return true;
    return false;
  };
  const box = new THREE.Box3();
  const mid = new THREE.Vector3();
  const zoneOf = (b: THREE.Box3): Zone => (b.min.z > -0.25 ? "street" : b.max.z < -1.3 ? "inside" : "both");
  const pieceOf = (zone: Zone, at: THREE.Vector3) => {
    if (zone === "street") return `x${Math.floor(at.x / 8)}`;
    const a = Math.atan2(at.z - centre.z, at.x - centre.x);
    return `w${Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8}`;
  };

  const groups = new Map<string, { mat: THREE.Material; zone: Zone; meshes: THREE.Mesh[] }>();
  const loose: THREE.Object3D[] = []; // left as they are, but still zoned
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.SkinnedMesh || o instanceof THREE.InstancedMesh) return;
    box.setFromObject(o);
    if (box.isEmpty()) return;
    const zone = zoneOf(box);
    o.userData.zone = zone;
    if (moves(o) || Array.isArray(o.material) || o.morphTargetInfluences) {
      loose.push(o);
      return;
    }
    box.getCenter(mid);
    const key = `${o.material.uuid}|${zone}|${pieceOf(zone, mid)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { mat: o.material, zone, meshes: [] }));
    g.meshes.push(o);
  });

  const holder = new THREE.Group();
  holder.name = "merged";
  root.add(holder);
  holder.matrixWorld.copy(root.matrixWorld);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  const zoned: { o: THREE.Object3D; zone: Zone }[] = loose.map((o) => ({ o, zone: o.userData.zone as Zone }));
  let before = 0;
  let after = 0;
  for (const g of groups.values()) {
    before += g.meshes.length;
    if (g.meshes.length < 2) {
      zoned.push({ o: g.meshes[0], zone: g.zone });
      after++;
      continue;
    }
    // only the attributes every one of them has, so they can be joined
    const names = Object.keys(g.meshes[0].geometry.attributes).filter((n) => g.meshes.every((m) => m.geometry.attributes[n]));
    const indexed = g.meshes.every((m) => m.geometry.index);
    const parts = g.meshes.map((m) => {
      const src = m.geometry;
      const geo = new THREE.BufferGeometry();
      for (const n of names) geo.setAttribute(n, src.attributes[n].clone());
      if (indexed) geo.setIndex(src.index!.clone());
      geo.applyMatrix4(m4.multiplyMatrices(toRoot, m.matrixWorld));
      return indexed ? geo : geo.index ? geo.toNonIndexed() : geo;
    });
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) {
      for (const m of g.meshes) zoned.push({ o: m, zone: g.zone });
      after += g.meshes.length;
      continue;
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.name = `merged_${g.meshes[0].name}`;
    mesh.renderOrder = g.meshes[0].renderOrder;
    holder.add(mesh);
    zoned.push({ o: mesh, zone: g.zone });
    after++;
    for (const m of g.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
  holder.updateMatrixWorld(true);

  const street = zoned.filter((z) => z.zone === "street").map((z) => z.o);
  const inside = zoned.filter((z) => z.zone === "inside").map((z) => z.o);
  let shown: "all" | "street" | "inside" = "all";
  // which side of the door can be seen: the street only, the inside only, or both
  function show(side: "all" | "street" | "inside") {
    if (side === shown) return;
    shown = side;
    for (const o of street) o.visible = side !== "inside";
    for (const o of inside) o.visible = side !== "street";
  }
  return { show, before, after };
}
