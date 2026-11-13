// Where each category's shelf is in the shop panorama, seen from where the
// walk-in ends (Blender: tools/blender/shop_v2.blend, the hot_* markers seen
// from cam_05). yaw: radians to the right of straight ahead; pitch: up.
export const PANO_SPOTS: { slug: string; label: string; yaw: number; pitch: number }[] = [
  { slug: "accessory", label: "Accessories", yaw: -0.4316, pitch: 0.0577 },
  { slug: "ashtray", label: "Ash trays", yaw: 0.5229, pitch: -0.3517 },
  { slug: "blunt-pre-rolled-cone", label: "Pre-rolled cones", yaw: -1.2114, pitch: 0.1078 },
  { slug: "blunt-wraps", label: "Blunt wraps", yaw: -1.703, pitch: 0.1141 },
  { slug: "bong", label: "Bongs", yaw: -0.3033, pitch: 0.0606 },
  { slug: "bong-accessory", label: "Bong accessories", yaw: -0.6226, pitch: 0.0673 },
  { slug: "cigars", label: "Cigars", yaw: 1.703, pitch: 0.1141 },
  { slug: "cleaning-accessory", label: "Cleaning", yaw: 0.4358, pitch: 0.0576 },
  { slug: "filter", label: "Filter tips", yaw: -0.3295, pitch: -0.31 },
  { slug: "grinder", label: "Grinders", yaw: 0.3295, pitch: -0.31 },
  { slug: "keychain", label: "Keychains", yaw: 2.1413, pitch: 0.097 },
  { slug: "lighter", label: "Lighters", yaw: 0.5229, pitch: -0.2176 },
  { slug: "lighter-refills", label: "Lighter refills", yaw: 0.8467, pitch: 0.0864 },
  { slug: "pipe", label: "Pipes", yaw: -0.8467, pitch: 0.0864 },
  { slug: "roach", label: "Roaches", yaw: 0.6226, pitch: 0.0673 },
  { slug: "rolling-paper", label: "Rolling papers", yaw: -0.5229, pitch: -0.2853 },
  { slug: "rolling-tobacco", label: "Rolling tobacco", yaw: 1.2114, pitch: 0.1078 },
  { slug: "rolling-tray", label: "Rolling trays", yaw: -2.1413, pitch: 0.097 },
  { slug: "storage", label: "Storage", yaw: 0.3079, pitch: 0.0605 },
];
