// A small model of how eyes actually move, shared by the band and the third
// eye. Real eyes do not glide after a target: they jump to it (a saccade:
// fast, after a short reaction delay, landing slightly short), track it
// smoothly only while it moves slowly (pursuit, which has a speed limit and
// falls behind a fast pointer until another jump catches up), and, once
// settled, flick by tiny amounts (microsaccades) so they never look frozen.
//
// Positions are normalised: (0, 0) looks straight ahead and a length of 1 is
// the furthest the iris may travel. Callers turn that into pixels.

export type Vec = { x: number; y: number };

const SACCADE_AT = 0.14; // error that triggers a jump rather than pursuit
const PURSUIT_SPEED = 1.8; // pursuit's speed limit, in lengths per second
const PURSUIT_TAU = 0.11; // seconds for pursuit to close most of the gap
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Where an eye at (cx, cy) should look for a target at (tx, ty), in px.
// Saturates softly with distance, so the gaze is smooth through the centre
// instead of flipping direction when the pointer crosses the eye.
export function aim(cx: number, cy: number, tx: number, ty: number, falloff: number): Vec {
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return { x: 0, y: 0 };
  const mag = len / Math.hypot(len, falloff);
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

export class Gaze {
  pos: Vec = { x: 0, y: 0 };
  private micro: Vec = { x: 0, y: 0 };
  private microAt = 0;
  private sac: { from: Vec; to: Vec; t0: number; dur: number } | null = null;
  private pendingSince = 0;
  private latency = 0;
  private last = 0;
  private opts: { micro: boolean; onSaccade?: (amplitude: number) => void };

  constructor(opts: { micro: boolean; onSaccade?: (amplitude: number) => void } = { micro: true }) {
    this.opts = opts;
  }

  // Advance to `now` (ms) towards `want`; returns where the eye looks.
  step(now: number, want: Vec): Vec {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;

    if (this.sac) {
      const t = Math.min(1, (now - this.sac.t0) / this.sac.dur);
      const e = 1 - (1 - t) ** 3; // fast start, soft landing
      this.pos = {
        x: this.sac.from.x + (this.sac.to.x - this.sac.from.x) * e,
        y: this.sac.from.y + (this.sac.to.y - this.sac.from.y) * e,
      };
      if (t >= 1) {
        this.sac = null;
        this.microAt = now + rand(250, 700);
      }
    } else {
      const ex = want.x - this.pos.x;
      const ey = want.y - this.pos.y;
      const err = Math.hypot(ex, ey);
      if (err > SACCADE_AT) {
        // react after a short, slightly random delay, then jump
        if (!this.pendingSince) {
          this.pendingSince = now;
          this.latency = rand(70, 150);
        }
        if (now - this.pendingSince >= this.latency) {
          this.pendingSince = 0;
          const land = rand(0.88, 0.97); // saccades land a touch short
          const to = { x: this.pos.x + ex * land, y: this.pos.y + ey * land };
          // bigger jumps take longer (the "main sequence")
          this.sac = { from: { ...this.pos }, to, t0: now, dur: 28 + 55 * err };
          this.opts.onSaccade?.(err);
        }
      } else {
        this.pendingSince = 0;
      }
      // pursuit: follow smoothly, but no faster than eyes can track; an eye
      // about to jump holds still rather than drifting off first
      if (!this.sac && !this.pendingSince && err > 0.0005) {
        const k = 1 - Math.exp(-dt / PURSUIT_TAU);
        const cap = PURSUIT_SPEED * dt;
        const move = Math.min(err * k, cap);
        this.pos = { x: this.pos.x + (ex / err) * move, y: this.pos.y + (ey / err) * move };
      }
    }

    // microsaccades: tiny flicks every so often while the eye is settled
    if (this.opts.micro && !this.sac && now >= this.microAt) {
      this.micro = { x: rand(-0.035, 0.035), y: rand(-0.03, 0.03) };
      this.microAt = now + rand(450, 1600);
    }
    const out = { x: this.pos.x + this.micro.x, y: this.pos.y + this.micro.y };
    const len = Math.hypot(out.x, out.y);
    return len > 1 ? { x: out.x / len, y: out.y / len } : out;
  }
}

// Sent by the third eye as it chooses ({ phase: "roll" }) and once it has
// ({ phase: "pick", href }), so the face can look along with it.
export const SEE_EVENT = "bb:see";
