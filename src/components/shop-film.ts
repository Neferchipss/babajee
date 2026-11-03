// The pitch video's walk up to the shop and through its door, scrubbed by scroll
// on the landing, then handed over to the 3D shop just as the camera passes the
// door frame (see ShopScene: FILM_*).
//
// The video is stored as stills (public/entry/f000.webp ... at 24 a second, 2048
// wide, made with ffmpeg from the pitch's entry.mp4), drawn on a canvas: a video
// element's seek is slow and unreliable when driven by scroll, worst on iPhones.
// Frames load coarse to fine (every 16th, then every 8th, ...) so scrolling works
// at once and fills in; until a frame is in, the nearest loaded one stands in.

export const FILM_FRAMES = 256;

export class EntryFilm {
  private frames: (HTMLImageElement | null)[] = new Array(FILM_FRAMES).fill(null);
  private ctx: CanvasRenderingContext2D;
  private drawn = -1;
  private w = 0;
  private h = 0;
  private dead = false;
  onFirst?: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private base: string,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    void this.load();
  }

  private async load() {
    const order: number[] = [];
    const seen = new Set<number>();
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < FILM_FRAMES; i += step) if (!seen.has(i)) (seen.add(i), order.push(i));
    }
    if (!seen.has(FILM_FRAMES - 1)) order.splice(1, 0, FILM_FRAMES - 1);
    // a few at a time: enough to keep the connection busy, not so many the first ones wait
    let next = 0;
    const worker = async () => {
      while (!this.dead && next < order.length) {
        const i = order[next++];
        const img = new Image();
        img.decoding = "async";
        img.src = `${this.base}/entry/f${String(i).padStart(3, "0")}.webp`;
        try {
          await img.decode();
        } catch {
          continue;
        }
        if (this.dead) return;
        this.frames[i] = img;
        if (i === 0) {
          this.drawn = -1;
          this.onFirst?.();
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  // the canvas follows its box at the screen's sharpness, capped at the frames' own
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const k = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * k));
    const h = Math.max(1, Math.round(r.height * k));
    if (w !== this.w || h !== this.h) {
      this.w = this.canvas.width = w;
      this.h = this.canvas.height = h;
      this.drawn = -1;
    }
  }

  ready() {
    return this.frames[0] !== null;
  }

  // t: 0..1 through the film
  draw(t: number) {
    const want = Math.round(Math.max(0, Math.min(1, t)) * (FILM_FRAMES - 1));
    // the nearest frame that is in, looking both ways
    let i = -1;
    for (let d = 0; d < FILM_FRAMES; d++) {
      if (this.frames[want - d]) {
        i = want - d;
        break;
      }
      if (this.frames[want + d]) {
        i = want + d;
        break;
      }
    }
    if (i < 0 || i === this.drawn) return;
    const img = this.frames[i]!;
    // cover: fill the box, cropping the long side, centred
    const s = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    this.ctx.drawImage(img, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
    this.drawn = i;
  }

  dispose() {
    this.dead = true;
    this.frames.fill(null);
  }
}
