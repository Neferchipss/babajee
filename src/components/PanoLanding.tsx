"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import pano from "@/assets/shop/pano-daydream.webp";
import panoDusk from "@/assets/shop/pano-dusk.webp";
import Logo from "./Logo";
import { clearShopNote, peekShopNote, SHOP_NOTE_EVENT, TO_STREET } from "./scene-note";
import front from "@/assets/shop/front-daydream.webp";
import frontTall from "@/assets/shop/front-daydream-tall.webp";
import frontDusk from "@/assets/shop/front-dusk.webp";
import frontDuskTall from "@/assets/shop/front-dusk-tall.webp";
import { PANO_SPOTS } from "./pano-spots";
import "./shop-scene.css";
import "./pano-landing.css";
import { thumb } from "@/lib/product-photos";

// The landing: the shopfront (a still for now; the walk-in will come back as
// a scrubbed film), with two ways on: "Explore the shop" steps through the
// door into the painted shop, a 360° panorama you drag to look around. Each category's shelf
// carries a label that opens it. The panorama was painted over a blockout of
// the 3D shop, so the labels sit where that shop had its shelves
// (pano-spots.ts).

type Category = { slug: string; name: string; count: number };
type Pick = { slug: string; name: string; cat: string; image: string };
const PEEK = 4; // products that pop out of a shelf
const LINGER = 900; // ms a shelf's products stay out after the aim moves off

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// the walk from the shopfront to the counter (3.5s): a wide one, and a tall
// one for phones; each ends on the panorama's first view for its shape
// Two looks of the same shop: Daydream (bright screenprint) and dusk (shady
// teal and purple, shown in dark mode). Each has its shopfront (wide and
// tall), its walk-ins and its panorama; the shelves sit in the same places.
type Look = "day" | "dusk";
const ART = {
  day: { pano: pano.src, front: front.src, frontTall: frontTall.src, walk: `${BASE}/walkin/walkin.mp4`, walkTall: `${BASE}/walkin/walkin-tall.mp4`, back: `${BASE}/walkin/walkin-rev.mp4`, backTall: `${BASE}/walkin/walkin-tall-rev.mp4` },
  dusk: { pano: panoDusk.src, front: frontDusk.src, frontTall: frontDuskTall.src, walk: `${BASE}/walkin/walkin-dusk.mp4`, walkTall: `${BASE}/walkin/walkin-dusk-tall.mp4`, back: `${BASE}/walkin/walkin-dusk-rev.mp4`, backTall: `${BASE}/walkin/walkin-dusk-tall-rev.mp4` },
} as const;
const lookNow = (): Look => {
  const h = document.documentElement;
  return h.dataset.mode === "dark" && h.dataset.look !== "daydream" ? "dusk" : "day";
};
const TALL = "(max-aspect-ratio: 4/5)";
// the films are 3.5s; played a little faster, the walk takes 2.5s
const WALK_RATE = 3.5 / 2.5;
// the view on stepping in, across the screen's short side: the walk-in's last
// frame (wide screens 1.75, tall ones 1.4), and it stays so once inside
const fovFor = (tall: boolean) => (tall ? 1.4 : 1.75);
// and once settled inside: a touch closer than the film's last frame
const fovInside = (tall: boolean) => (tall ? 1.18 : 1.34);
// and where it settles looking: phones a touch down (more floor and counter, less ceiling)
const pitchInside = (tall: boolean) => (tall ? -0.08 : 0);
const MIN_FOV = 0.6;
const MAX_FOV = 2.1;

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// each pixel casts a ray from the camera and reads the panorama where it points
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform vec2 res;
uniform float yaw;
uniform float pitch;
uniform float f;
uniform float roll;
out vec4 color;
const float PI = 3.14159265;
void main() {
  // the field of view spans the screen's short side, so a tall phone sees as much as a wide screen
  vec2 s = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y);
  float cr = cos(roll), sr = sin(roll);
  s = vec2(s.x * cr + s.y * sr, -s.x * sr + s.y * cr);
  float x = s.x * f, y = s.y * f, w = 1.0;
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

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

const RAD = Math.PI / 180;

// Which way the back of the phone points (heading clockwise from the
// sensor's own north, which is arbitrary on most phones, hence the offset
// taken when the gyro is switched on), how far up, and how far the screen is
// turned about that line. The screen's rotation decides which edge is "up".
function facing(e: DeviceOrientationEvent, screenAngle: number) {
  const a = (e.alpha ?? 0) * RAD;
  const b = (e.beta ?? 0) * RAD;
  const g = (e.gamma ?? 0) * RAD;
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
  const world = (x: number, y: number, z: number) => {
    const x1 = x * cg + z * sg;
    const z1 = -x * sg + z * cg;
    const y2 = y * cb - z1 * sb;
    const z2 = y * sb + z1 * cb;
    return [x1 * ca - y2 * sa, x1 * sa + y2 * ca, z2];
  };
  const [fx, fy, fz] = world(0, 0, -1); // the camera looks out of the back
  const t = screenAngle * RAD;
  const [ux, uy, uz] = world(Math.sin(t), Math.cos(t), 0); // the screen's up
  const hz = Math.hypot(fx, fy);
  let roll = 0;
  if (hz > 0.05) {
    const l = [(-fz * fx) / hz, (-fz * fy) / hz, hz]; // level up
    const r = [fy / hz, -fx / hz, 0]; // level right
    roll = Math.atan2(ux * r[0] + uy * r[1] + uz * r[2], ux * l[0] + uy * l[1] + uz * l[2]);
  }
  return { heading: Math.atan2(fx, fy), elevation: Math.asin(clamp(fz, -1, 1)), roll };
}

type Ask = { requestPermission?: () => Promise<PermissionState> };
const orientationApi = () =>
  typeof window !== "undefined" ? (window.DeviceOrientationEvent as unknown as Ask | undefined) : undefined;

export default function PanoLanding({ categories, shelves = {} }: { categories: Category[]; shelves?: Record<string, Pick[]> }) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // in the shop (Explore), or out front
  const enteredRef = useRef(false);
  const landing = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  // the walk in playing: the words go, the film runs, then the shop
  const [walking, setWalking] = useState(false);
  const spotEls = useRef<Record<string, HTMLAnchorElement | null>>({});
  const peekEls = useRef<Record<string, HTMLDivElement | null>>({});
  const dot = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "flat">("loading");
  const [inside, setInside] = useState(false);
  const [touched, setTouched] = useState(false);
  // gyro: offered on touch screens with motion sensors, once inside
  const [canGyro, setCanGyro] = useState(false);
  const [gyro, setGyro] = useState(false);
  const gyroApi = useRef<(on: boolean) => void>(() => {});
  // read inside the frame loop without restarting it
  const touchedRef = useRef(false);
  useEffect(() => {
    touchedRef.current = touched;
  }, [touched]);

  const have = new Map(categories.map((c) => [c.slug, c]));
  const spots = PANO_SPOTS.filter((s) => have.has(s.slug));
  const total = categories.reduce((n, c) => n + c.count, 0);

  function toggleGyro() {
    if (gyro) return gyroApi.current(false);
    const ask = orientationApi()?.requestPermission;
    if (!ask) return gyroApi.current(true);
    ask
      .call(window.DeviceOrientationEvent)
      .then((p) => (p === "granted" ? gyroApi.current(true) : setCanGyro(false)))
      .catch(() => setCanGyro(false));
  }

  // "Explore the shop": the walk in plays, then the shop takes over from its
  // last frame (the panorama's first view). No film (reduced motion, or it
  // won't play): straight in.
  // play one of the films over the shopfront, then call done (once)
  function playFilm(src: string, started: () => void, done: () => void) {
    const v = film.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      started();
      return done();
    }
    if (!v.src.endsWith(src)) v.src = src;
    v.defaultPlaybackRate = v.playbackRate = WALK_RATE;
    v.currentTime = 0;
    let begun = false;
    let over = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      started();
    };
    const end = () => {
      if (over) return;
      over = true;
      begin();
      done();
    };
    v.onplaying = begin;
    v.onended = end;
    v.play().catch(end);
    // never strand anyone on a stalled film
    window.setTimeout(end, 8000);
  }

  // "Explore the shop": the walk in, then the shop takes over from its last
  // frame (the panorama's first view)
  function explore() {
    const tall = window.matchMedia(TALL).matches;
    playFilm(
      tall ? ART[look].walkTall : ART[look].walk,
      () => setWalking(true),
      () => {
        enter(true);
        window.setTimeout(() => setWalking(false), 600);
      },
    );
  }

  // back: the walk in, backwards, out to the shopfront
  function leave() {
    const tall = window.matchMedia(TALL).matches;
    playFilm(
      tall ? ART[look].backTall : ART[look].back,
      () => {
        setWalking(true);
        enter(false);
      },
      () => setWalking(false),
    );
  }

  // through the door, and back out
  function enter(on: boolean) {
    enteredRef.current = on;
    setInside(on);
    if (on) window.setTimeout(() => canvas.current?.focus({ preventScroll: true }), 50);
  }

  // inside, the site's bar is back on top (once it has rendered): the view
  // fits under it, whatever bar it is (phones and desktop differ)
  useEffect(() => {
    const top = inside && track.current ? track.current.getBoundingClientRect().top + window.scrollY : 0;
    document.documentElement.style.setProperty("--pano-bar", `${Math.max(0, top)}px`);
    window.dispatchEvent(new Event("resize"));
  }, [inside]);

  // home (the logo, or Home in the menu) while inside: walk back out
  const leaveRef = useRef<() => void>(() => {});
  useEffect(() => {
    leaveRef.current = () => {
      if (enteredRef.current) leave();
    };
  });
  useEffect(() => {
    const out = () => leaveRef.current();
    window.addEventListener(TO_STREET, out);
    return () => window.removeEventListener(TO_STREET, out);
  }, []);

  // "Explore the shop" from the profile menu: start inside, not out front
  // (on this page already, it says so with an event)
  useEffect(() => {
    const check = () => {
      if (!peekShopNote()) return;
      clearShopNote();
      enter(true);
    };
    check();
    window.addEventListener(SHOP_NOTE_EVENT, check);
    return () => window.removeEventListener(SHOP_NOTE_EVENT, check);
  }, []);

  // which look: follows light/dark (and Daydream), live
  const [lookSeen, setLook] = useState<Look | null>(null);
  const look: Look = lookSeen ?? "day";
  // the screen's shape (which walk-in and shopfront), and whether the walk-in may load yet
  const [tall, setTall] = useState(false);
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(TALL);
    const on = () => setTall(mq.matches);
    on();
    mq.addEventListener("change", on);
    // after the page has painted, unless the visitor asked to save data
    const saving = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    const go = () => !saving && window.setTimeout(() => setWarm(true), 1200);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("load", go);
    };
  }, []);
  useEffect(() => {
    const read = () => setLook(lookNow());
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-look"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !lookSeen) return;
    let gone = false; // this run was replaced (the look changed): a late image must not land
    const gl = el.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return void setStatus("flat");

    // the bar on top: the view sits under it

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
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

    let texReady = false;
    const tex = gl.createTexture();
    const img = new Image();
    img.decoding = "async";
    let texAsked = false;
    const loadTex = () => {
      if (texAsked || gone) return;
      texAsked = true;
      img.src = ART[lookSeen].pano;
      img.decode().then(
      () => {
        if (gone) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        texReady = true;
        setStatus("ready");
      },
      () => !gone && setStatus("flat"),
      );
    };
    // out front, the shopfront is what matters: the shop loads just after
    const soon = () => window.setTimeout(loadTex, 600);
    if (enteredRef.current) loadTex();
    else if (document.readyState === "complete") soon();
    else window.addEventListener("load", soon, { once: true });


    // where the view looks, and how wide; dragging moves the target, the view eases to it
    const tallNow = () => window.matchMedia(TALL).matches;
    const view = { yaw: 0, pitch: 0, fov: fovFor(tallNow()), roll: 0 };
    const aim = { yaw: 0, pitch: 0, zoom: fovInside(tallNow()) };
    let w = 0;
    let h = 0;
    const size = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      el.width = Math.max(1, Math.round(w * k));
      el.height = Math.max(1, Math.round(h * k));
    };
    size();
    window.addEventListener("resize", size);

    // dragging to look around, once inside
    let drag: { x: number; y: number; yaw: number; pitch: number; id: number } | null = null;
    let wasInside = false;
    const down = (e: PointerEvent) => {
      if (!wasInside) return;
      drag = { x: e.clientX, y: e.clientY, yaw: aim.yaw, pitch: aim.pitch, id: e.pointerId };
      downAt = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      setTouched(true);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const per = (2 * Math.tan(view.fov / 2)) / Math.min(w, h); // radians a pixel is worth
      const ny = drag.yaw - (e.clientX - drag.x) * per;
      const np = clamp(drag.pitch + (e.clientY - drag.y) * per, -1.1, 1.1);
      if (gyroOn && gyroOff) {
        gyroOff.yaw += ny - aim.yaw;
        gyroOff.pitch += np - aim.pitch;
      }
      aim.yaw = ny;
      aim.pitch = np;
    };

    // the gyro: the view follows the phone; the offset taken when it comes on
    // keeps the view where it was instead of jumping to the sensor's north
    let gyroOn = false;
    let gyroOff: { yaw: number; pitch: number } | null = null;
    let gyroRoll = 0;
    let gyroHeard = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (!gyroOn || e.beta == null || e.gamma == null) return;
      gyroHeard = performance.now();
      const legacy = (window as { orientation?: number }).orientation;
      const v = facing(e, screen.orientation?.angle ?? legacy ?? 0);
      gyroOff ??= { yaw: aim.yaw - v.heading, pitch: aim.pitch - v.elevation };
      aim.yaw = v.heading + gyroOff.yaw;
      aim.pitch = clamp(v.elevation + gyroOff.pitch, -1.4, 1.4);
      gyroRoll = v.roll;
    };
    gyroApi.current = (on) => {
      gyroOn = on;
      gyroOff = null;
      gyroRoll = 0;
      setGyro(on);
      if (!on) return window.removeEventListener("deviceorientation", onOrient);
      setTouched(true);
      window.addEventListener("deviceorientation", onOrient);
      // no readings at all (a laptop, or sensors blocked): give up quietly
      const asked = performance.now();
      window.setTimeout(() => {
        if (gyroOn && gyroHeard < asked) {
          gyroApi.current(false);
          setCanGyro(false);
        }
      }, 1500);
    };
    setCanGyro(window.matchMedia("(pointer: coarse)").matches && !!orientationApi());
    // a tap or click that didn't drag opens the shelf being aimed at
    let downAt: { x: number; y: number } | null = null;
    let aimed: HTMLAnchorElement | null = null;
    // each label's step away from the others (px), and that step eased on screen
    const shift: Record<string, number> = {};
    const eased: Record<string, number> = {};
    let openSlug = "";
    let openUntil = 0;
    let overPeek = "";
    const peekOver = (e: PointerEvent) => {
      // over a label itself, or over its fan of products: that shelf is aimed at
      const pk = e.target instanceof Element ? e.target.closest<HTMLElement>(".scene-peek, .pano-spot") : null;
      overPeek = pk?.dataset.slug ?? "";
    };
    window.addEventListener("pointerover", peekOver, { passive: true });
    const up = (e: PointerEvent) => {
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
      drag = null;
      downAt = null;
      if (wasInside && moved < 6 && aimed) aimed.click();
    };
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let mouse: { x: number; y: number } | null = null;
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const onUi = e.target instanceof Element && !!e.target.closest("a, button");
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && !onUi;
      mouse = over ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
      const c = cursor.current;
      if (!c) return;
      const show = String(over && wasInside);
      if (c.dataset.show !== show) c.dataset.show = show;
      if (mouse) c.style.translate = `${mouse.x}px ${mouse.y}px`;
    };
    window.addEventListener("pointermove", hover, { passive: true });
    const wheel = (e: WheelEvent) => {
      if (!wasInside || !e.ctrlKey) return; // a pinch on a trackpad zooms; plain wheel scrolls the page
      e.preventDefault();
      aim.zoom = clamp(aim.zoom * Math.exp(e.deltaY * 0.01), MIN_FOV, MAX_FOV);
    };
    const key = (e: KeyboardEvent) => {
      if (!wasInside) return;
      const k = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, 0.15], ArrowDown: [0, -0.15] }[e.key];
      if (!k) return;
      e.preventDefault();
      aim.yaw += k[0];
      aim.pitch = clamp(aim.pitch + k[1], -1.1, 1.1);
      setTouched(true);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("keydown", key);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const isIn = enteredRef.current;
      if (isIn !== wasInside) {
        wasInside = isIn;
        // stepping in: from close on the counter, the room opens out
        // stepping in: always facing the counter, as the walk-in ends, then
        // easing to the view inside
        if (isIn) {
          view.yaw = aim.yaw = 0;
          view.pitch = 0;
          aim.pitch = pitchInside(tallNow());
          view.roll = 0;
          gyroOff = null;
          view.fov = fovFor(tallNow());
          aim.zoom = fovInside(tallNow());
        }
      }

      // through the door the view widens from close on the counter to the room
      const target = isIn ? aim.zoom : view.fov;
      const k = still ? 1 : 1 - Math.exp(-dt * 9);
      view.fov += (target - view.fov) * k;
      view.yaw += (aim.yaw - view.yaw) * k;
      view.pitch += (aim.pitch - view.pitch) * k;
      view.roll += ((isIn && gyroOn ? gyroRoll : 0) - view.roll) * k;
      // a slow drift to the right until they take over
      if (isIn && !drag && !gyroOn && !still && !touchedRef.current) aim.yaw += dt * 0.04;

      if (isIn && !texAsked) loadTex();
      if (!texReady || !isIn) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.viewport(0, 0, el.width, el.height);
      gl.uniform2f(u.res, el.width, el.height);
      gl.uniform1f(u.yaw, view.yaw);
      gl.uniform1f(u.pitch, view.pitch);
      const f = Math.tan(view.fov / 2);
      gl.uniform1f(u.f, f);
      gl.uniform1f(u.roll, view.roll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // the labels, where their shelves are on screen
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const cr = Math.cos(view.roll), sr = Math.sin(view.roll);
      const at = fine ? mouse : { x: w / 2, y: h / 2 };
      let best: HTMLAnchorElement | null = null;
      let bestD = 64; // px: how close the aim must come to a shelf's label
      const placed: { a: HTMLAnchorElement; px: number; py: number; slug: string }[] = [];
      for (const s of PANO_SPOTS) {
        const a = spotEls.current[s.slug];
        if (!a) continue;
        // the shelf's direction, into the camera's frame (the shader's turn, undone)
        const dx = Math.cos(s.pitch) * Math.sin(s.yaw);
        const dy = Math.sin(s.pitch);
        const dz = Math.cos(s.pitch) * Math.cos(s.yaw);
        const x = dx * cy - dz * sy;
        const w1 = dx * sy + dz * cy;
        const y = dy * cp - w1 * sp;
        const z = dy * sp + w1 * cp;
        const show = isIn && z > 0.2;
        if (!show) {
          a.style.opacity = "0";
          a.style.pointerEvents = "none";
          continue;
        }
        const qx = x / z / f;
        const qy = y / z / f;
        const sx = qx * cr - qy * sr;
        const syy = qx * sr + qy * cr;
        const m = Math.min(w, h);
        const px = w / 2 + (sx * m) / 2;
        const py = h / 2 - (syy * m) / 2;
        placed.push({ a, px, py, slug: s.slug });
      }

      // labels that would land on one another step apart, up or down, so each
      // reads on its own; the shift eases, so they slide rather than jump
      placed.sort((p1, p2) => p1.px - p2.px);
      const boxes: { l: number; r: number; t: number; b: number }[] = [];
      for (const q of placed) {
        const lw = (q.a.offsetWidth || 80) / 2 + 3;
        const lh = (q.a.offsetHeight || 20) / 2 + 2;
        const prev = shift[q.slug] ?? 0;
        // try the place it had, then its own, then further up and down
        const tries = [prev, 0];
        for (let k = 1; k <= 6; k++) tries.push(-k * lh * 2, k * lh * 2);
        let dyBest = tries[tries.length - 1];
        for (const dyTry of tries) {
          const t = q.py + dyTry - lh;
          const b = q.py + dyTry + lh;
          if (!boxes.some((o) => q.px - lw < o.r && q.px + lw > o.l && t < o.b && b > o.t)) {
            dyBest = dyTry;
            break;
          }
        }
        shift[q.slug] = dyBest;
        boxes.push({ l: q.px - lw, r: q.px + lw, t: q.py + dyBest - lh, b: q.py + dyBest + lh });
        const ease = eased[q.slug] ?? dyBest;
        eased[q.slug] = ease + (dyBest - ease) * (still ? 1 : 1 - Math.exp(-dt * 14));
      }

      for (const q of placed) {
        const { a } = q;
        const px = q.px;
        const py = q.py + (eased[q.slug] ?? 0);
        const onScreen = px > -60 && px < w + 60 && py > -30 && py < h + 30;
        a.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) rotate(${(-view.roll).toFixed(3)}rad) scale(var(--aim-scale, 1))`;
        a.style.opacity = onScreen ? "1" : "0";
        a.style.pointerEvents = onScreen ? "auto" : "none";
        if (at && onScreen) {
          const d = Math.hypot(px - at.x, py - at.y);
          if (d < bestD) {
            bestD = d;
            best = a;
          }
        }
      }
      // over a fan's own products counts as aiming at its shelf
      if (!best && overPeek) best = spotEls.current[overPeek] ?? null;
      if (best !== aimed) {
        if (aimed) delete aimed.dataset.aim;
        if (best) best.dataset.aim = "true";
        aimed = best;
      }
      const aimSlug = best?.dataset.slug ?? "";
      if (aimSlug) {
        openSlug = aimSlug;
        openUntil = now + LINGER;
      }
      else if (now > openUntil) openSlug = "";
      for (const sp of PANO_SPOTS) {
        const pk = peekEls.current[sp.slug];
        const a = spotEls.current[sp.slug];
        if (!pk || !a) continue;
        const isOpen = isIn && sp.slug === openSlug && a.style.opacity === "1";
        if (isOpen) {
          // the label's own place, read back from its transform
          const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(a.style.transform);
          if (m) {
            const below = String(+m[2] < 150);
            if (pk.dataset.below !== below) pk.dataset.below = below;
            pk.style.transform = `translate(${m[1]}px, ${m[2]}px) rotate(${(-view.roll).toFixed(3)}rad)`;
          }
        }
        if (pk.dataset.open !== String(isOpen)) pk.dataset.open = String(isOpen);
      }
      const lit = String(!!best);
      if (dot.current) {
        if (dot.current.dataset.aim !== lit) dot.current.dataset.aim = lit;
        const hide = String(!isIn);
        if (dot.current.dataset.hidden !== hide) dot.current.dataset.hidden = hide;
      }
      if (cursor.current && cursor.current.dataset.on !== lit) cursor.current.dataset.on = lit;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      gone = true;
      window.removeEventListener("load", soon);
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      window.removeEventListener("resize", size);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("pointermove", hover);
      window.removeEventListener("pointerover", peekOver);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("keydown", key);
      window.removeEventListener("deviceorientation", onOrient);
      gyroOn = false;
    };
  }, [lookSeen]);

  return (
    <div className="scene pano" ref={track} data-status={status} data-inside={inside || undefined}>
      <div className="scene-stage">
        <canvas
          ref={canvas}
          className="pano-canvas"
          tabIndex={0}
          role="img"
          aria-label="The Babajee shop, painted all round you. Drag or use the arrow keys to look around; each shelf's label opens its category."
        />

        <div className="pano-front" ref={landing} aria-hidden={inside || undefined} data-walking={walking || undefined}>
          {/* phones get the tall shopfront: sky for the logo, the door in the middle, pavement for the buttons */}
          <picture>
            {lookSeen && <source media="(max-aspect-ratio: 4/5)" srcSet={ART[look].frontTall} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {lookSeen && <img className="pano-front-art" src={ART[look].front} alt="The Babajee shopfront" draggable={false} />}
          </picture>
          <video
            ref={film}
            className="pano-walk"
            src={lookSeen ? (tall ? ART[look].walkTall : ART[look].walk) : undefined}
            muted
            playsInline
            preload={warm ? "auto" : "none"}
            aria-hidden="true"
          />
          <div className="pano-front-copy">
            <Logo priority className="pano-front-logo" />
            <p className="pano-front-tag">Papers, trays, glass and everything that goes with them.</p>
            <div className="pano-front-actions">
              <button type="button" className="pano-btn pano-btn--go" onClick={explore} tabIndex={inside || walking ? -1 : 0}>
                Explore the shop
              </button>
              <Link href="/shop" className="pano-btn" tabIndex={inside ? -1 : 0}>
                Shop products
              </Link>
            </div>
          </div>
        </div>

        {spots.map((s) => (
          <Link
            key={s.slug}
            href={`/shop/${s.slug}`}
            className="pano-spot"
            data-slug={s.slug}
            ref={(a) => {
              spotEls.current[s.slug] = a;
            }}
          >
            {have.get(s.slug)?.name ?? s.label}
          </Link>
        ))}

        {/* each shelf's products, fanned out over its label when it is aimed at */}
        {spots.map((s) => {
          const picks = (shelves[s.slug] ?? []).slice(0, PEEK);
          if (!picks.length) return null;
          const mid = (picks.length - 1) / 2;
          return (
            <div
              key={s.slug}
              className="scene-peek pano-peek"
              data-open="false"
              data-slug={s.slug}
              ref={(d) => {
                peekEls.current[s.slug] = d;
              }}
            >
              <div className="scene-peek-fan">
                {picks.map((p, i) => (
                  <Link
                    key={p.slug}
                    href={`/shop/${p.cat}?p=${p.slug}`}
                    className="scene-peek-item"
                    title={p.name}
                    style={{ "--i": i, "--r": `${(i - mid) * 7}deg`, "--y": `${Math.abs(i - mid) ** 2 * 7}px` } as React.CSSProperties}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(p.image)} alt="" draggable={false} loading="lazy" />
                    <span className="sr-only">{p.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {/* the aim: touch has a dot in the middle, a mouse has the eye */}
        <span ref={dot} className="scene-dot" data-hidden="true" aria-hidden="true" />
        <span ref={cursor} className="scene-cursor" data-show="false" aria-hidden="true" />

        <p className="scene-hint pano-hint" data-hidden={touched || !inside} aria-hidden="true">
          Drag to look around
        </p>
        {inside && canGyro ? (
          <button
            type="button"
            className="scene-gyro pano-gyro"
            aria-pressed={gyro}
            onClick={toggleGyro}
            aria-label={gyro ? "Stop looking around by moving your phone" : "Look around by moving your phone"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
              <path d="M3 9a10 10 0 0 0 0 6M21 9a10 10 0 0 1 0 6" strokeLinecap="round" />
            </svg>
            <span>{gyro ? "Gyro on" : "Gyro"}</span>
          </button>
        ) : null}
        {inside ? (
          <button type="button" className="pano-out" onClick={leave} aria-label="Back outside">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : null}
        {inside ? (
          <Link href="/shop" className="pano-all">
            See every product <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : null}

        {status === "flat" && (
          <nav className="scene-box" aria-labelledby="pano-title">
            <h1 id="pano-title" className="scene-title">
              Shop
            </h1>
            <p className="scene-lede">
              {categories.length} categories &middot; {total} products
            </p>
            <ul className="scene-list">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/shop/${c.slug}`} className="scene-cat">
                    <span>{c.name}</span>
                    <span className="scene-cat-count">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
