"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import pano from "@/assets/shop/pano.jpg";

type Category = { slug: string; name: string; count: number };

// The shop index: a 360° panorama of the shop (an equirectangular image,
// 2:1) you can drag to look around, with the categories listed in a box over
// it. Later, items in the pano will be tagged as categories; the view's yaw
// and pitch (radians, 0/0 = the middle of the image) are what a tag will
// be placed by.
//
// The viewer is a single WebGL2 quad: each pixel casts a ray from the camera
// and reads the panorama where that ray points, so there is no sphere mesh
// and no 3D library. Without WebGL the image just sits there as a picture.

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform vec2 res;
uniform float yaw;
uniform float pitch;
uniform float f; // tan(vertical fov / 2)
uniform float roll; // the camera turned clockwise about its own axis
out vec4 color;
const float PI = 3.14159265;
void main() {
  vec2 s = (gl_FragCoord.xy * 2.0 - res) / res.y;
  float cr = cos(roll), sr = sin(roll);
  s = vec2(s.x * cr + s.y * sr, -s.x * sr + s.y * cr);
  // ray in camera space, looking down w (= -z)
  float x = s.x * f, y = s.y * f, w = 1.0;
  // tilt up/down, then turn left/right
  float cp = cos(pitch), sp = sin(pitch);
  float y1 = y * cp + w * sp;
  float w1 = -y * sp + w * cp;
  float cy = cos(yaw), sy = sin(yaw);
  float x2 = x * cy + w1 * sy;
  float w2 = -x * sy + w1 * cy;
  vec3 d = normalize(vec3(x2, y1, w2));
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  color = texture(tex, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI));
}`;

const MIN_FOV = 0.6; // radians, vertical
const MAX_FOV = 1.75;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const RAD = Math.PI / 180;

// Which way the back of the phone points, from its orientation angles
// (alpha, beta, gamma: the W3C Z-X'-Y'' rotation, world Z up), and how far
// the screen is turned about that line (roll). Returns the heading (radians,
// clockwise from the sensor's own "north", which is arbitrary on most phones,
// hence the calibration below), the elevation and the roll. The screen's
// rotation (portrait or landscape) decides which edge of the phone is "up".
function facing(e: DeviceOrientationEvent, screenAngle: number) {
  const a = (e.alpha ?? 0) * RAD;
  const b = (e.beta ?? 0) * RAD;
  const g = (e.gamma ?? 0) * RAD;
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
  // a vector in the phone's frame, turned into the world's
  const world = (x: number, y: number, z: number) => {
    const x1 = x * cg + z * sg; // about Y by gamma
    const z1 = -x * sg + z * cg;
    const y2 = y * cb - z1 * sb; // about X by beta
    const z2 = y * sb + z1 * cb;
    return [x1 * ca - y2 * sa, x1 * sa + y2 * ca, z2]; // about Z by alpha
  };
  const [fx, fy, fz] = world(0, 0, -1); // the camera looks out of the back
  const t = screenAngle * RAD;
  const [ux, uy, uz] = world(Math.sin(t), Math.cos(t), 0); // the screen's up
  // roll: the screen's up against the level "up" for that heading
  const h = Math.hypot(fx, fy);
  let roll = 0;
  if (h > 0.05) {
    const l = [(-fz * fx) / h, (-fz * fy) / h, h]; // level up
    const r = [fy / h, -fx / h, 0]; // level right (forward x world up)
    roll = Math.atan2(ux * r[0] + uy * r[1] + uz * r[2], ux * l[0] + uy * l[1] + uz * l[2]);
  }
  return { heading: Math.atan2(fx, fy), elevation: Math.asin(clamp(fz, -1, 1)), roll };
}

type Ask = { requestPermission?: () => Promise<PermissionState> };
const orientationApi = () =>
  typeof window !== "undefined" ? (window.DeviceOrientationEvent as unknown as Ask | undefined) : undefined;

export default function ShopPano({ categories }: { categories: Category[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(false);
  const [touched, setTouched] = useState(false);
  // gyro: offered only on touch screens that have motion sensors
  const [canGyro, setCanGyro] = useState(false);
  const [gyro, setGyro] = useState(false);
  const gyroApi = useRef<(on: boolean) => void>(() => {});
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return void setFlat(true);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return void setFlat(true);
    gl.useProgram(prog);
    // one triangle that covers the screen
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {
      res: gl.getUniformLocation(prog, "res"),
      yaw: gl.getUniformLocation(prog, "yaw"),
      pitch: gl.getUniformLocation(prog, "pitch"),
      f: gl.getUniformLocation(prog, "f"),
      roll: gl.getUniformLocation(prog, "roll"),
    };

    // the view
    let yaw = 0;
    let pitch = -0.08;
    let roll = 0;
    let fov = el.clientWidth < el.clientHeight ? 1.6 : 1.4;
    let vyaw = 0; // drag momentum, radians per ms
    let vpitch = 0;
    let lastInput = performance.now();
    let loaded = false;
    let visible = true;
    let frame = 0;
    let last = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let pinch = 0;
    let lastMove = 0;
    // gyro: the view follows the phone; offsets keep it from jumping when
    // it is switched on, and let a drag recentre it
    let gyroOn = false;
    let gyroOff: { yaw: number; pitch: number } | null = null;
    let gyroHeard = 0;

    const tex = gl.createTexture();
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // left and right edges meet
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      loaded = true;
      setReady(true);
      kick();
    };
    img.src = pano.src;

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      gl.viewport(0, 0, el.width, el.height);
      kick();
    };

    const draw = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      let moving = false;
      if (!dragging && (Math.abs(vyaw) > 1e-6 || Math.abs(vpitch) > 1e-6)) {
        // let go mid-swipe: the view coasts to a stop
        yaw += vyaw * dt;
        pitch += vpitch * dt;
        const decay = Math.exp(-dt / 320);
        vyaw *= decay;
        vpitch *= decay;
        moving = true;
      } else if (!dragging && !gyroOn && !still && now - lastInput > 4000) {
        yaw += 0.00006 * dt; // a slow turn when left alone
        moving = true;
      }
      pitch = clamp(pitch, -1.25, 1.25);
      gl.uniform2f(u.res, el.width, el.height);
      gl.uniform1f(u.yaw, yaw);
      gl.uniform1f(u.pitch, pitch);
      gl.uniform1f(u.f, Math.tan(fov / 2));
      gl.uniform1f(u.roll, roll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (moving && visible) kick();
      else last = 0;
    };
    // draw on the next frame (once), unless one is already coming
    const kick = () => {
      if (loaded && !frame) frame = requestAnimationFrame(draw);
    };

    // dragging, with one finger or the mouse; two fingers pinch to zoom
    const perPx = () => fov / el.clientHeight;
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = true;
      vyaw = vpitch = 0;
      lastInput = lastMove = performance.now();
      setTouched(true);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const now = performance.now();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) fov = clamp(fov * (pinch / d), MIN_FOV, MAX_FOV);
        pinch = d;
      } else {
        // grab the scene: it moves with the pointer
        const dyaw = -(e.clientX - prev.x) * perPx();
        const dpitch = (e.clientY - prev.y) * perPx();
        yaw += dyaw;
        pitch += dpitch;
        if (gyroOn && gyroOff) {
          gyroOff.yaw += dyaw;
          gyroOff.pitch += dpitch;
        } else {
          const dt = Math.max(1, now - lastMove);
          vyaw = vyaw * 0.6 + (dyaw / dt) * 0.4;
          vpitch = vpitch * 0.6 + (dpitch / dt) * 0.4;
        }
      }
      lastInput = lastMove = now;
      kick();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      if (pointers.size) return;
      dragging = false;
      // a pause before letting go means no coasting; nor with the gyro on
      if (gyroOn || performance.now() - lastMove > 80) vyaw = vpitch = 0;
      lastInput = performance.now();
      kick();
    };
    // trackpad pinch (and ctrl + wheel) zooms; a plain wheel scrolls the page
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      fov = clamp(fov * Math.exp(e.deltaY * 0.01), MIN_FOV, MAX_FOV);
      lastInput = performance.now();
      kick();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = fov * 0.12;
      if (e.key === "ArrowLeft") yaw -= step;
      else if (e.key === "ArrowRight") yaw += step;
      else if (e.key === "ArrowUp") pitch += step;
      else if (e.key === "ArrowDown") pitch -= step;
      else if (e.key === "+" || e.key === "=") fov = clamp(fov * 0.85, MIN_FOV, MAX_FOV);
      else if (e.key === "-") fov = clamp(fov / 0.85, MIN_FOV, MAX_FOV);
      else return;
      e.preventDefault();
      vyaw = vpitch = 0;
      lastInput = performance.now();
      setTouched(true);
      kick();
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      if (!gyroOn || e.beta == null || e.gamma == null) return;
      gyroHeard = performance.now();
      // older iPhones only have the deprecated window.orientation
      const legacy = (window as { orientation?: number }).orientation;
      const view = facing(e, screen.orientation?.angle ?? legacy ?? 0);
      const { heading, elevation } = view;
      roll = view.roll;
      // the first reading lines the phone up with the current view
      gyroOff ??= { yaw: yaw - heading, pitch: pitch - elevation };
      yaw = heading + gyroOff.yaw;
      pitch = elevation + gyroOff.pitch;
      lastInput = gyroHeard;
      kick();
    };
    gyroApi.current = (on) => {
      gyroOn = on;
      gyroOff = null;
      vyaw = vpitch = 0;
      roll = 0; // level again when it is switched off
      kick();
      setGyro(on);
      if (!on) return window.removeEventListener("deviceorientation", onOrient);
      setTouched(true);
      window.addEventListener("deviceorientation", onOrient);
      // no readings at all: there is no sensor after all, so drop the button
      const asked = performance.now();
      window.setTimeout(() => {
        if (gyroOn && gyroHeard < asked) {
          gyroApi.current(false);
          setCanGyro(false);
        }
      }, 1500);
    };
    setCanGyro(window.matchMedia("(pointer: coarse)").matches && !!orientationApi());

    const ro = new ResizeObserver(size);
    ro.observe(el);
    // no drawing while the pano is scrolled out of sight
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    io.observe(el);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKey);
      window.removeEventListener("deviceorientation", onOrient);
      gyroOn = false;
      img.onload = null;
      // free what this run made, but keep the context: a canvas has only
      // one, and the effect may run again on the same canvas
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    };
  }, []);

  // iOS only hands out motion data after asking, from inside the tap itself
  function toggleGyro() {
    if (gyro) return gyroApi.current(false);
    const ask = orientationApi()?.requestPermission;
    if (!ask) return gyroApi.current(true);
    ask
      .call(window.DeviceOrientationEvent)
      .then((p) => (p === "granted" ? gyroApi.current(true) : setCanGyro(false)))
      .catch(() => setCanGyro(false));
  }

  return (
    <div className="pano">
      <div className="pano-stage" data-ready={ready} data-flat={flat} style={{ "--pano": `url(${pano.src})` } as React.CSSProperties}>
        <canvas
          ref={canvas}
          className="pano-view"
          tabIndex={0}
          role="img"
          aria-label="A 360° view inside the Babajee shop. Drag, or use the arrow keys, to look around."
        />
        <p className="pano-hint" data-hidden={touched || !ready || flat} aria-hidden="true">
          Drag to look around
        </p>
        {canGyro && (
          <button
            type="button"
            className="pano-gyro"
            aria-pressed={gyro}
            onClick={toggleGyro}
            aria-label={gyro ? "Stop looking around by moving your phone" : "Look around by moving your phone"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8" y="3" width="8" height="18" rx="2" />
              <path d="M4 8a9 9 0 0 0 0 8M20 8a9 9 0 0 1 0 8" />
            </svg>
            <span>Gyro</span>
          </button>
        )}
      </div>

      <nav className="pano-box" aria-labelledby="pano-title">
        <p className="pano-crumb">Babajee &middot; The smoke shop</p>
        <h1 id="pano-title" className="pano-title">
          Shop
        </h1>
        <p className="pano-lede">
          {categories.length} categories &middot; {total} products
        </p>
        <ul className="pano-list">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/shop/${c.slug}`} className="pano-cat">
                <span className="pano-cat-name">{c.name}</span>
                <span className="pano-cat-count">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
