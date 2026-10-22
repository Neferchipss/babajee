"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InkPass } from "./ink-pass";
import Logo from "./Logo";
import { createMagic } from "./shop-magic";
import { createWorld } from "./shop-world";
import "./shop-scene.css";

type Category = { slug: string; name: string; count: number };
type Spot = { name: string; label: string; href: string };

// The landing and the shop index in one: a 3D model of the street and the
// shop (public/models/shop.glb, built by tools/blender/build_shop.py) with the
// camera on rails. Scrolling moves it from across the street, through the
// door, to the middle of the shop, where scroll gives way to dragging to look
// around, and the fixtures carry labels that lead to their categories.
//
// The rails are the six cameras cam_00..cam_05 in the model; the door is the
// node door_leaf (swung open in the file, closed = no rotation); a fixture is
// an empty named hot_* whose extras.categories lists the category slugs; each
// lamp_* empty becomes a light (extras.kind: street, shop or window).
// With `intro` off (the /shop page) the camera simply starts at the end.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MODEL = `${BASE}/models/shop.glb`;
const DRACO = `${BASE}/draco/gltf/`; // decoder for the compressed model

// when each camera is reached, as a share of the scroll
const STOPS = [0, 0.2, 0.38, 0.55, 0.76, 1];
const LOOK_FROM = 0.93; // the box and the labels come in over the last stretch
const SETTLE = 0.7; // seconds at the very end before the view may be turned
const LABEL_H = 34; // px a label needs to itself, so crowded ones can be pushed apart

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export default function ShopScene({ categories, intro }: { categories: Category[]; intro: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const landing = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  const bubble = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const arrived = useRef(false); // once inside, scrolling back up does not rewind the walk
  const router = useRouter();
  const spotEls = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "flat">("loading");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [touched, setTouched] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  // scroll the page to `to` for them, easing in and out; any input of theirs stops it
  function glide(to: number, dur: number) {
    const from = window.scrollY;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return window.scrollTo(0, to);
    const t0 = performance.now();
    let stop = false;
    const cancel = () => {
      stop = true;
      for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(ev, cancel);
    };
    for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, cancel, { passive: true });
    const step = (now: number) => {
      if (stop) return;
      const p = clamp((now - t0) / dur);
      window.scrollTo(0, from + (to - from) * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2));
      if (p < 1) requestAnimationFrame(step);
      else cancel();
    };
    requestAnimationFrame(step);
  }

  // "Step inside": walk the whole way in
  function walkIn() {
    glide(document.documentElement.scrollHeight - window.innerHeight, 7500);
  }

  // the only way back out: unlatch, then play the walk in reverse
  function goBack() {
    const end = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, end); // the view is held at the end, so start the rewind from there
    arrived.current = false;
    glide(0, 6000);
  }

  useEffect(() => {
    const el = canvas.current;
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!el || !trackEl || !stageEl) return;
    let renderer: THREE.WebGLRenderer;
    try {
      // debug switches for the black-box hunt: ?hp=0 default GPU, ?aa=0 no canvas MSAA, ?fx=0 no post-processing
      const dbg = new URLSearchParams(window.location.search);
      renderer = new THREE.WebGLRenderer({
        canvas: el,
        antialias: dbg.get("aa") !== "0",
        powerPreference: dbg.get("hp") === "0" ? "default" : "high-performance",
      });
    } catch {
      return void queueMicrotask(() => setStatus("flat"));
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // night: a deep blue sky, thin fog, and every light comes from the model
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#060a16");
    scene.fog = new THREE.FogExp2("#0a1022", 0.016);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.15, 220);
    const hemi = new THREE.HemisphereLight("#2a3a66", "#1a1410", 0.55);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight("#7f95d6", 0.5);
    moon.position.set(-12, 24, 20);
    scene.add(moon);

    // neon and lit glass glow: bloom over the frame
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.3, 1.5);
    composer.addPass(bloom);
    // toon look (?toon=0 for the plain one): flat light bands + ink outlines
    const toon = new URLSearchParams(window.location.search).get("toon") !== "0";
    const fxOff = new URLSearchParams(window.location.search).get("fx") === "0";
    const inkPass = new InkPass(scene, camera, 2, 2);
    inkPass.enabled = toon;
    composer.addPass(inkPass);
    composer.addPass(new OutputPass());
    const ramp = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;

    // outside is cold and ordinary; inside is another world (see `inside` in tick)
    const OUT = {
      bg: new THREE.Color("#060a16"),
      fog: new THREE.Color("#0a1022"),
      sky: new THREE.Color("#2a3a66"),
      ground: new THREE.Color("#1a1410"),
    };
    const IN = {
      bg: new THREE.Color("#12082e"),
      fog: new THREE.Color("#1a0b3d"),
      sky: new THREE.Color("#6a3fc0"),
      ground: new THREE.Color("#3a1030"),
    };

    // the camera rails, filled in once the model has loaded
    let pos: THREE.CatmullRomCurve3 | null = null;
    let aim: THREE.CatmullRomCurve3 | null = null;
    let door: THREE.Object3D | null = null;
    const doorOpen = new THREE.Quaternion();
    const doorShut = new THREE.Quaternion();
    const spotAt: { name: string; at: THREE.Vector3 }[] = [];
    let world: ReturnType<typeof createWorld> | null = null;
    let magic: ReturnType<typeof createMagic> | null = null;
    let baseFov = 60;
    let ready = false;
    let cancelled = false;

    const draco = new DRACOLoader().setDecoderPath(DRACO);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(
      MODEL,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        scene.add(root);
        root.updateMatrixWorld(true);
        const eyes: THREE.Vector3[] = [];
        const targets: THREE.Vector3[] = [];
        const found: Spot[] = [];
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            let m = o.material as THREE.Material;
            if (toon && !(m as THREE.MeshToonMaterial).isMeshToonMaterial) {
              // same name and maps, so the neon / flame / chalkboard lookups still find them
              const old = m as THREE.MeshStandardMaterial;
              const t = new THREE.MeshToonMaterial({
                name: old.name,
                color: old.color,
                map: old.map,
                gradientMap: ramp,
                emissive: old.emissive,
                emissiveMap: old.emissiveMap,
                emissiveIntensity: old.emissiveIntensity,
                alphaMap: old.alphaMap,
                transparent: old.transparent,
                opacity: old.opacity,
                vertexColors: old.vertexColors,
              });
              t.userData = old.userData;
              old.dispose();
              o.material = m = t;
            }
            m.side = THREE.FrontSide;
            if (m.transparent) m.depthWrite = false;
          }
        });
        for (let i = 0; i < 6; i++) {
          const cam = root.getObjectByName(`cam_0${i}`) ?? gltf.cameras[i];
          if (!cam) return void setStatus("flat");
          const p = cam.getWorldPosition(new THREE.Vector3());
          const f = cam.getWorldDirection(new THREE.Vector3());
          eyes.push(p);
          targets.push(p.clone().addScaledVector(f, 8));
        }
        pos = new THREE.CatmullRomCurve3(eyes, false, "centripetal");
        aim = new THREE.CatmullRomCurve3(targets, false, "centripetal");
        door = root.getObjectByName("door_leaf") ?? null;
        if (door) doorOpen.copy(door.quaternion);
        world = createWorld(root, scene);
        magic = createMagic(root, scene, new Set(categories.map((c) => c.slug)));
        const have = new Set(categories.map((c) => c.slug));
        root.traverse((o) => {
          if (!o.name.startsWith("hot_")) return;
          const slug = String(o.userData.categories ?? "")
            .split(",")
            .find((s) => have.has(s));
          if (!slug) return;
          found.push({ name: o.name, label: String(o.userData.label ?? o.name), href: `/shop/${slug}` });
          spotAt.push({ name: o.name, at: o.getWorldPosition(new THREE.Vector3()) });
        });
        setSpots(found);
        ready = true;
        setStatus("ready");
        kick();
      },
      undefined,
      () => !cancelled && setStatus("flat"),
    );

    // view state
    let prog = intro ? 0 : 1;
    let yawOff = 0;
    let pitchOff = 0;
    let vyaw = 0;
    let vpitch = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastMove = 0;
    let touch = false;
    let visible = true;
    let raf = 0;
    // a category was chosen: stop drawing so the page change gets the whole
    // main thread (a frame of the scene can cost a slow phone tens of ms,
    // and the next page has to load between frames)
    let leaving = false;
    let last = performance.now();
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const qYaw = new THREE.Quaternion();
    const qPitch = new THREE.Quaternion();
    const qRoll = new THREE.Quaternion();
    const qBias = new THREE.Quaternion();
    const qSway = new THREE.Quaternion();
    let mx = 0; // pointer, -0.5..0.5 across the stage, eased
    let my = 0;
    let tx = 0;
    let ty = 0;
    let settled = 0; // how long the camera has been at rest at the end
    let canLook = false;
    let ribbon = false;
    arrived.current = false;
    const zAxis = new THREE.Vector3(0, 0, 1);
    const m4 = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);

    const size = () => {
      const w = stageEl.clientWidth;
      const h = stageEl.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      inkPass.setSize(Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()));
      bloom.resolution.set(w, h);
      camera.aspect = w / h;
      baseFov = w / h < 1 ? 78 : 60; // a taller view needs more room
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let target = 1;
      if (intro) {
        const r = trackEl.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        const scrolled = span > 0 ? clamp(-r.top / span) : 1;
        // reaching the end latches: from then on only the back button lets the walk run in reverse
        if (!arrived.current && prog >= 0.995 && scrolled >= 0.999) arrived.current = true;
        target = arrived.current ? 1 : scrolled;
        if (arrived.current !== ribbon) {
          ribbon = arrived.current;
          if (ribbon) document.documentElement.dataset.ribbon = "on";
          else delete document.documentElement.dataset.ribbon;
        }
      }
      prog += (target - prog) * (still ? 1 : 1 - Math.exp(-dt * 7));
      if (Math.abs(target - prog) < 1e-4) prog = target;

      // the view is locked until the camera has arrived and come to rest; then it frees up
      settled = prog >= 0.998 && target >= 0.998 ? settled + dt : 0;
      const now_ok = settled > SETTLE;
      if (now_ok !== canLook) {
        canLook = now_ok;
        setUnlocked(now_ok);
      }
      const free = canLook ? smooth(SETTLE, SETTLE + 0.6, settled) : 0;
      if (!dragging && (Math.abs(vyaw) > 1e-5 || Math.abs(vpitch) > 1e-5)) {
        yawOff += vyaw * dt * 1000;
        pitchOff += vpitch * dt * 1000;
        const decay = Math.exp(-dt / 0.32);
        vyaw *= decay;
        vpitch *= decay;
      }
      pitchOff = clamp(pitchOff, -0.7, 0.7);
      if (!canLook && !dragging) yawOff = pitchOff = vyaw = vpitch = 0;

      if (ready && pos && aim) {
        // where on the rails: the stops are not evenly spaced in scroll
        let i = 0;
        while (i < STOPS.length - 2 && prog > STOPS[i + 1]) i++;
        const u = (i + clamp((prog - STOPS[i]) / (STOPS[i + 1] - STOPS[i]))) / (STOPS.length - 1);
        pos.getPoint(u, camera.position);
        aim.getPoint(u, v);
        m4.lookAt(camera.position, v, up);
        q.setFromRotationMatrix(m4);
        qYaw.setFromAxisAngle(up, -yawOff * free);
        qPitch.setFromAxisAngle(xAxis, pitchOff * free);
        camera.quaternion.copy(qYaw).multiply(q).multiply(qPitch);
        // landing: turn the view a little left so the shop sits right of centre, under Baba's eyes
        const wide = stageEl.clientWidth / stageEl.clientHeight > 1.1;
        if (intro && wide) {
          qBias.setFromAxisAngle(up, 0.22 * (1 - smooth(0, 0.22, prog)));
          camera.quaternion.premultiply(qBias);
        }
        // landing: the view drifts on its own and leans a little towards the pointer
        if (intro) {
          const sway = 1 - smooth(0, 0.15, prog);
          mx += (tx - mx) * (1 - Math.exp(-dt * 2.5));
          my += (ty - my) * (1 - Math.exp(-dt * 2.5));
          qSway.setFromAxisAngle(up, (-mx * 0.07 + Math.sin(now / 4200) * 0.012) * sway);
          camera.quaternion.premultiply(qSway);
          qSway.setFromAxisAngle(xAxis, (my * 0.035 + Math.sin(now / 5300) * 0.006) * sway);
          camera.quaternion.multiply(qSway);
        }
        // how far into the other world: the entry is the doorstep, the vault is all the way in
        const inside = smooth(0.4, -3.2, camera.position.z);
        const bump = Math.sin(Math.PI * inside); // the moment of crossing
        const sec = now / 1000;
        scene.background = (scene.background as THREE.Color).copy(OUT.bg).lerp(IN.bg, inside);
        (scene.fog as THREE.FogExp2).color.copy(OUT.fog).lerp(IN.fog, inside);
        (scene.fog as THREE.FogExp2).density = 0.016 - 0.008 * inside;
        hemi.color.copy(OUT.sky).lerp(IN.sky, inside);
        hemi.groundColor.copy(OUT.ground).lerp(IN.ground, inside);
        hemi.intensity = 0.55 + 0.35 * inside;
        bloom.strength = 0.1 + 0.06 * inside;
        renderer.toneMappingExposure = 1.1 + 0.15 * inside;
        // crossing over is a lurch: the view rolls and the lens pulls wide, then it settles
        qRoll.setFromAxisAngle(zAxis, bump * 0.07 * Math.sin(sec * 2.3));
        camera.quaternion.multiply(qRoll);
        const fov = baseFov + bump * 9;
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        // the door swings open for you, and slams behind you
        if (door) {
          const swing = smooth(0.3, 0.52, prog) * (1 - Math.pow(smooth(0.78, 0.86, prog), 2));
          door.quaternion.slerpQuaternions(doorShut, doorOpen, swing);
        }
        world?.update(sec, dt, inside, camera);
        const said = magic?.update(sec, dt, inside, camera) ?? null;
        const bub = bubble.current;
        if (bub) {
          if (said && said.text) {
            v.copy(said.at).project(camera);
            const show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
            bub.dataset.on = show ? "true" : "false";
            if (bub.dataset.who !== said.label + said.text.length) {
              bub.dataset.who = said.label + said.text.length;
              (bub.querySelector(".scene-bubble-name") as HTMLElement).textContent = said.label;
              (bub.querySelector(".scene-bubble-text") as HTMLElement).textContent = said.text;
              const slug = said.slugs[0];
              bub.dataset.link = slug ? "true" : "false";
              bub.dataset.slug = slug ?? "";
              bub.tabIndex = slug ? 0 : -1;
            }
            bub.style.transform = `translate(${((v.x + 1) / 2) * stageEl.clientWidth}px, ${((1 - v.y) / 2) * stageEl.clientHeight}px) translate(-50%, -100%)`;
          } else bub.dataset.on = "false";
        }
        if (fxOff) renderer.render(scene, camera);
        else composer.render();
        camera.updateMatrixWorld();

        // labels on the fixtures, once the camera has settled
        const on = smooth(LOOK_FROM, 1, prog);
        const W = stageEl.clientWidth;
        const H = stageEl.clientHeight;
        const lit: { a: HTMLAnchorElement; x: number; y: number; w: number }[] = [];
        for (const s of spotAt) {
          const a = spotEls.current[s.name];
          if (!a) continue;
          v.copy(s.at).project(camera);
          const show = on > 0.05 && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
          a.style.opacity = show ? String(on) : "0";
          a.style.pointerEvents = show && on > 0.8 ? "auto" : "none";
          if (show) lit.push({ a, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, w: (a.textContent?.length ?? 8) * 7.4 + 30 });
          else a.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -50%)`;
        }
        // labels that would land on one another are pushed apart, so each one reads on its own
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < lit.length; i++) {
            for (let j = i + 1; j < lit.length; j++) {
              const p = lit[i];
              const q = lit[j];
              const dy = q.y - p.y;
              if (Math.abs(q.x - p.x) < (p.w + q.w) / 2 && Math.abs(dy) < LABEL_H) {
                const push = (LABEL_H - Math.abs(dy)) / 2 + 1;
                const dir = dy >= 0 ? 1 : -1;
                p.y -= dir * push;
                q.y += dir * push;
              }
            }
          }
        }
        for (const l of lit) l.a.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -50%)`;
      }
      // the landing words fade as the walk starts; the box comes in at the end
      if (landing.current) {
        const o = 1 - smooth(0, 0.1, prog);
        landing.current.style.opacity = String(o);
        landing.current.style.visibility = o > 0.01 ? "visible" : "hidden";
      }
      if (back.current) {
        const o = arrived.current ? smooth(SETTLE, SETTLE + 0.6, settled) : 0;
        back.current.style.opacity = String(o);
        back.current.style.visibility = o > 0.01 ? "visible" : "hidden";
      }
      if (box.current) {
        const o = smooth(LOOK_FROM, 1, prog);
        box.current.style.opacity = String(o);
        box.current.style.visibility = o > 0.01 ? "visible" : "hidden";
      }
      if (visible && !document.hidden && !leaving) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && !leaving) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (!canLook) return;
      touch = e.pointerType === "touch";
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      lastMove = performance.now();
      vyaw = vpitch = 0;
      el.setPointerCapture(e.pointerId);
      setTouched(true);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const per = (camera.fov * Math.PI) / 180 / el.clientHeight;
      const dx = (e.clientX - lastX) * per;
      const dy = touch ? 0 : (e.clientY - lastY) * per; // a finger's up and down scrolls the page
      lastX = e.clientX;
      lastY = e.clientY;
      yawOff += dx;
      pitchOff += dy;
      const dtm = Math.max(1, now - lastMove);
      vyaw = vyaw * 0.6 + (dx / dtm) * 0.4;
      vpitch = vpitch * 0.6 + (dy / dtm) * 0.4;
      lastMove = now;
    };
    const onUp = () => {
      dragging = false;
      if (performance.now() - lastMove > 80) vyaw = vpitch = 0;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!canLook) return;
      if (e.key === "ArrowLeft") yawOff -= 0.15;
      else if (e.key === "ArrowRight") yawOff += 0.15;
      else return;
      e.preventDefault();
      setTouched(true);
    };
    const onPointer = (e: PointerEvent) => {
      const r = stageEl.getBoundingClientRect();
      tx = clamp((e.clientX - r.left) / r.width, 0, 1) - 0.5;
      ty = clamp((e.clientY - r.top) / r.height, 0, 1) - 0.5;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    const onVisibility = () => kick();
    const onLeave = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const a = t?.closest<HTMLAnchorElement>("a[href]");
      const toCategory = a ? /\/shop\/[^/]+\/?$/.test(a.pathname) : !!t?.closest(".scene-bubble[data-slug]");
      if (!toCategory || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      leaving = true;
      cancelAnimationFrame(raf);
      raf = 0;
      // say where we're going while it opens
      const name = a
        ? (a.querySelector("span")?.textContent ?? a.textContent ?? "")
        : (t?.closest(".scene-bubble")?.querySelector(".scene-bubble-name")?.textContent ?? "");
      const label = stageEl.querySelector(".scene-leaving b");
      if (label) label.textContent = name.trim() || "the shelf";
      stageEl.dataset.leaving = "true";
    };
    // the capture phase, so it runs before the link starts the navigation
    stageEl.addEventListener("click", onLeave, true);

    const ro = new ResizeObserver(() => {
      size();
      kick();
    });
    ro.observe(stageEl);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    io.observe(trackEl);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    size();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stageEl.removeEventListener("click", onLeave, true);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      window.removeEventListener("pointermove", onPointer);
      delete document.documentElement.dataset.ribbon;
      magic?.dispose();
      world?.dispose();
      draco.dispose();
      inkPass.dispose();
      ramp.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [categories, intro]);

  return (
    <div className="scene" ref={track} data-intro={intro} data-status={status}>
      <div className="scene-stage" ref={stage}>
        <canvas
          ref={canvas}
          className="scene-canvas"
          tabIndex={0}
          role="img"
          aria-label="A 3D walk from the street into the Babajee shop. Scroll to walk in; at the end, drag or use the arrow keys to look around."
        />

        <div className="scene-vignette" aria-hidden="true" />

        {intro && (
          <div className="scene-landing" ref={landing}>
            <div className="scene-frame" aria-hidden="true" />
            <div className="scene-copy">
              <Logo priority className="scene-logo" />
              <p className="scene-tag">Papers, trays, glass and everything that goes with them.</p>
              <div className="scene-actions">
                <button type="button" className="btn btn-primary scene-cta" onClick={walkIn}>
                  Step inside
                </button>
                <Link href="/shop" className="scene-skip">
                  Skip to the shop <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
            <p className="scene-cue" aria-hidden="true">
              <span>{status === "loading" ? "Loading the shop…" : "Scroll to walk in"}</span>
              <i />
            </p>
          </div>
        )}

        {spots.map((s) => (
          <Link
            key={s.name}
            href={s.href}
            className="scene-spot"
            ref={(a) => {
              spotEls.current[s.name] = a;
            }}
          >
            {s.label}
          </Link>
        ))}

        <button
          type="button"
          ref={bubble}
          className="scene-bubble"
          data-on="false"
          tabIndex={-1}
          aria-live="polite"
          onClick={(e) => {
            const slug = e.currentTarget.dataset.slug;
            if (slug) router.push(`/shop/${slug}`);
          }}
        >
          <b className="scene-bubble-name" />
          <span className="scene-bubble-text" />
        </button>

        {intro && (
          <button type="button" ref={back} className="scene-back" onClick={goBack}>
            <span aria-hidden="true">&larr;</span> Back to the street
          </button>
        )}

        <p className="scene-hint" data-hidden={touched || status !== "ready" || !unlocked} aria-hidden="true">
          Drag to look around
        </p>

        <div className="scene-leaving" role="status" aria-live="polite">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M5 24Q24 6 43 24Q24 42 5 24Z" />
            <circle cx="24" cy="24" r="7" />
          </svg>
          <p>
            Opening <b />
          </p>
        </div>

        <nav className="scene-box" ref={box} aria-labelledby="scene-title">
          <p className="scene-crumb">Babajee &middot; The smoke shop</p>
          <h1 id="scene-title" className="scene-title">
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
      </div>
    </div>
  );
}
