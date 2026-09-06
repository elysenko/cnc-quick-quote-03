/**
 * requestAnimationFrame loop driving the laser head along the precomputed cut path.
 *
 * Progress is delta-time based (inches of cut per second), so the animation runs at
 * the same speed whatever frame rate the display delivers; the loop itself targets
 * 60 FPS by simply drawing once per animation frame.
 */
export class LaserAnimation {
  private frameId: number | null = null;
  private lastTimestamp = 0;
  private progress = 0;
  private pathLength = 0;
  private speed = 1;
  private running = false;

  constructor(private readonly onFrame: (progressLength: number) => void) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Cut length for the whole path plus how long a full pass should take. */
  configure(pathLength: number, durationSeconds = 7): void {
    this.pathLength = pathLength;
    this.speed = pathLength / Math.max(0.5, durationSeconds);
  }

  start(): void {
    if (this.running || this.pathLength <= 0) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Stop and reset to the first frame — the Print Bed button's "running" branch. */
  stop(): void {
    this.cancel();
    this.running = false;
    this.progress = 0;
    this.onFrame(0);
  }

  toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  destroy(): void {
    this.cancel();
    this.running = false;
  }

  /** Redraw the current frame without advancing (used after a resize). */
  redraw(): void {
    this.onFrame(this.progress);
  }

  private cancel(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(0.05, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    this.progress += this.speed * deltaSeconds;
    if (this.progress >= this.pathLength) this.progress = 0; // loop the pass
    this.onFrame(this.progress);
    this.frameId = requestAnimationFrame(this.tick);
  };
}
