"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { InkPass } from "./ink-pass";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Logo from "./Logo";
import "./doodle-view.css";

// A look at the doodle-edition geometry (tools/blender/build_doodle.py): the
// lane and the shop, with flat banded shading and ink outlines so it reads
// the way the final art will. Scroll walks down the lane to the door (the path
// is the model's cam_00..cam_03); drag to look around. The outline is an edge
// detect on the scene's normals and depth, not geometry.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

export default function DoodleView() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [ink, setInk] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const inkRef = useRef(true);

  useEffect(() => {
    inkRef.current = ink;
  }, [ink]);

  useEffect(() => {
    const el = canvas.current;
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!el || !trackEl || !stageEl) return;
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f6cfe0");
    scene.fog = new THREE.Fog("#f6cfe0", 40, 120);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
    scene.add(new THREE.HemisphereLight("#fff4ff", "#9a78b8", 1.25));
    const sun = new THREE.DirectionalLight("#fffaf0", 2.6);
    sun.position.set(-14, 30, -8);
    scene.add(sun);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const inkPass = new InkPass(scene, camera, 2, 2);
    composer.addPass(inkPass);
    composer.addPass(new OutputPass());

    // three flat bands of light, as a marker drawing would have
    const ramp = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;

    let pos: THREE.CatmullRomCurve3 | null = null;
    let aim: THREE.CatmullRomCurve3 | null = null;
    let cancelled = false;
    const draco = new DRACOLoader().setDecoderPath(`${BASE}/draco/gltf/`);
    new GLTFLoader().setDRACOLoader(draco).load(
      `${BASE}/models/doodle.glb`,
      (gltf) => {
        if (cancelled) return;
        scene.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        const eyes: THREE.Vector3[] = [];
        const tgts: THREE.Vector3[] = [];
        for (let i = 0; i < 4; i++) {
          const c = gltf.scene.getObjectByName(`cam_0${i}`);
          if (!c) return void setStatus("failed");
          const p = c.getWorldPosition(new THREE.Vector3());
          eyes.push(p);
          tgts.push(p.clone().addScaledVector(c.getWorldDirection(new THREE.Vector3()), 8));
        }
        pos = new THREE.CatmullRomCurve3(eyes, false, "centripetal");
        aim = new THREE.CatmullRomCurve3(tgts, false, "centripetal");
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const old = o.material as THREE.MeshStandardMaterial;
          o.material = new THREE.MeshToonMaterial({
            color: old.color,
            gradientMap: ramp,
            transparent: old.transparent,
            opacity: old.opacity,
            emissive: old.emissive,
            emissiveIntensity: old.emissiveIntensity,
          });
        });
        setStatus("ready");
      },
      undefined,
      () => !cancelled && setStatus("failed"),
    );

    // view state: scroll walks the path, a drag looks around
    let prog = 0;
    let yaw = 0;
    let pitch = 0;
    let settled = 0;
    let canLook = false;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    let raf = 0;
    let last = performance.now();
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const qy = new THREE.Quaternion();
    const qp = new THREE.Quaternion();
    const m4 = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const xa = new THREE.Vector3(1, 0, 0);

    const size = () => {
      const w = stageEl.clientWidth;
      const h = stageEl.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      inkPass.setSize(Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = trackEl.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const target = span > 0 ? clamp(-r.top / span) : 0;
      prog += (target - prog) * (1 - Math.exp(-dt * 6));
      // the view is locked until the camera has arrived and rested a moment
      settled = prog >= 0.998 && target >= 0.998 ? settled + dt : 0;
      const ok = settled > 0.7;
      if (ok !== canLook) {
        canLook = ok;
        setUnlocked(ok);
      }
      if (!canLook && !dragging) yaw = pitch = 0;
      if (copy.current) {
        const o = clamp(1 - prog / 0.08);
        copy.current.style.opacity = String(o);
        copy.current.style.visibility = o > 0.01 ? "visible" : "hidden";
      }
      if (pos && aim) {
        pos.getPoint(prog, camera.position);
        aim.getPoint(prog, v);
        m4.lookAt(camera.position, v, up);
        q.setFromRotationMatrix(m4);
        qy.setFromAxisAngle(up, -yaw);
        qp.setFromAxisAngle(xa, pitch);
        camera.quaternion.copy(qy).multiply(q).multiply(qp);
        inkPass.enabled = inkRef.current;
        composer.render();
      }
      raf = requestAnimationFrame(tick);
    };
    const down = (e: PointerEvent) => {
      if (!canLook) return;
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const per = (camera.fov * Math.PI) / 180 / el.clientHeight;
      yaw += (e.clientX - lx) * per;
      pitch = clamp(pitch + (e.clientY - ly) * per, -0.9, 0.9);
      lx = e.clientX;
      ly = e.clientY;
    };
    const up_ = () => (dragging = false);
    const ro = new ResizeObserver(size);
    ro.observe(stageEl);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up_);
    el.addEventListener("pointercancel", up_);
    size();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up_);
      el.removeEventListener("pointercancel", up_);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      draco.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="doodle" ref={track} data-status={status}>
      <div className="doodle-stage" ref={stage}>
        <canvas ref={canvas} className="doodle-canvas" aria-label="A preview of the doodle-style lane and shop" />
        <div className="doodle-copy" ref={copy}>
          <Logo priority className="doodle-logo" />
          <p>Papers, trays, glass and everything that goes with them.</p>
        </div>
        <div className="doodle-bar">
          <span>Doodle lane · geometry only</span>
          <button type="button" onClick={() => setInk((v) => !v)} aria-pressed={ink}>
            Ink {ink ? "on" : "off"}
          </button>
        </div>
        <p className="doodle-hint">
          {status === "loading" && "Loading…"}
          {status === "failed" && "Could not load the model."}
          {status === "ready" && (unlocked ? "Drag to look around" : "Scroll to walk down the lane")}
        </p>
      </div>
    </div>
  );
}
