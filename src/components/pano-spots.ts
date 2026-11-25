// Where each category is in the shop panorama, seen from where the walk-in
// ends: on the side walls' bays (from the pano camera in
// tools/blender/shop_v3.blend), on the shelves behind the counter and on
// the counter, and on the five tables (those placed by eye on the painting).
// yaw: radians to the right of straight ahead; pitch: up.
export const PANO_SPOTS: { slug: string; label: string; yaw: number; pitch: number }[] = [
  { slug: "accessory", label: "Accessories", yaw: -0.096, pitch: -0.1309 },
  { slug: "ashtray", label: "Ash trays", yaw: 1.0036, pitch: -0.4363 },
  { slug: "blunt-pre-rolled-cone", label: "Pre-rolled cones", yaw: -0.224, pitch: 0.1018 },
  { slug: "blunt-wraps", label: "Blunt wraps", yaw: -1.0601, pitch: 0.0 },
  { slug: "bong", label: "Bongs", yaw: -1.9044, pitch: 0.0 },
  { slug: "bong-accessory", label: "Bong accessories", yaw: -1.3183, pitch: 0.0 },
  { slug: "cigars", label: "Cigars", yaw: -0.3054, pitch: -0.0727 },
  { slug: "cleaning-accessory", label: "Cleaning", yaw: 1.7638, pitch: 0.0 },
  { slug: "filter", label: "Filter tips", yaw: 0.224, pitch: 0.1018 },
  { slug: "grinder", label: "Grinders", yaw: -0.989, pitch: -0.4363 },
  { slug: "keychain", label: "Keychains", yaw: 0.0, pitch: 0.1309 },
  { slug: "lighter", label: "Lighters", yaw: 0.0, pitch: -0.5236 },
  { slug: "lighter-refills", label: "Lighter refills", yaw: 0.7786, pitch: 0.0 },
  { slug: "pipe", label: "Pipes", yaw: -2.3562, pitch: -0.4072 },
  { slug: "roach", label: "Roaches", yaw: 0.4451, pitch: 0.1018 },
  { slug: "rolling-paper", label: "Rolling papers", yaw: -0.4509, pitch: 0.1018 },
  { slug: "rolling-tobacco", label: "Rolling tobacco", yaw: 1.3661, pitch: 0.0 },
  { slug: "rolling-tray", label: "Rolling trays", yaw: -0.7094, pitch: 0.0 },
  { slug: "storage", label: "Storage", yaw: 2.3562, pitch: -0.4072 },
];
