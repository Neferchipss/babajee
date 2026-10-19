import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

// Ink outlines as a post pass: an edge detect on the scene's normals and depth
// (not geometry), shared by the doodle preview and the landing.
export class InkPass extends Pass {
  private target: THREE.WebGLRenderTarget;
  private normals = new THREE.MeshNormalMaterial();
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  enabled = true;
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, w: number, h: number) {
    super();
    this.target = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tNormal: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        res: { value: new THREE.Vector2(w, h) },
        near: { value: camera.near },
        far: { value: camera.far },
        thick: { value: 1.6 },
        ink: { value: new THREE.Color("#120a26") },
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tColor, tNormal, tDepth;
        uniform vec2 res; uniform float near, far, thick; uniform vec3 ink;
        varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
        void main(){
          vec2 px = thick / res;
          vec3 n0 = texture2D(tNormal, vUv).rgb;
          float d0 = lin(texture2D(tDepth, vUv).r);
          float edge = 0.0;
          vec2 o[4] = vec2[4](vec2(1.0,0.0), vec2(-1.0,0.0), vec2(0.0,1.0), vec2(0.0,-1.0));
          for (int i = 0; i < 4; i++) {
            vec2 u = vUv + o[i] * px;
            vec3 n = texture2D(tNormal, u).rgb;
            float d = lin(texture2D(tDepth, u).r);
            edge = max(edge, smoothstep(0.28, 0.6, length(n - n0)));
            edge = max(edge, smoothstep(0.012, 0.05, abs(d - d0) / max(d0, 0.5)));
          }
          vec4 c = texture2D(tColor, vUv);
          gl_FragColor = vec4(mix(c.rgb, ink, edge), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    this.mat.uniforms.res.value.set(w, h);
  }
  dispose() {
    this.target.dispose();
    this.normals.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!this.enabled) {
      this.mat.uniforms.thick.value = 0; // nothing to draw: pass the picture through
    } else {
      this.mat.uniforms.thick.value = 1.6 * (renderer.getPixelRatio() || 1);
      const prev = this.scene.overrideMaterial;
      const bg = this.scene.background;
      // particles would be drawn with the normal material too: leave them out of the edge map
      const hidden: THREE.Object3D[] = [];
      this.scene.traverse((o) => {
        if (o.visible && ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite)) {
          o.visible = false;
          hidden.push(o);
        }
      });
      this.scene.overrideMaterial = this.normals;
      this.scene.background = null;
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = prev;
      this.scene.background = bg;
      for (const o of hidden) o.visible = true;
    }
    this.mat.uniforms.near.value = this.camera.near;
    this.mat.uniforms.far.value = this.camera.far;
    this.mat.uniforms.tColor.value = read.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
  }
}
