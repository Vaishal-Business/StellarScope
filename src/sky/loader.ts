/**
 * Prioritised, de-duplicated, abortable image loader. Decoding happens off the main
 * thread via createImageBitmap; bitmaps are vertically flipped so they can be uploaded
 * with texture.flipY = false (ImageBitmap ignores flipY in WebGL).
 */
type Job = {
  url: string;
  priority: number;
  ctrl: AbortController;
  resolve: (b: ImageBitmap | null) => void;
  reject: (e: unknown) => void;
  promise: Promise<ImageBitmap | null>;
  started: boolean;
};

export class ImageLoader {
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private active = 0;
  loaded = 0;
  failed = 0;
  bytes = 0;
  onChange?: () => void;

  constructor(private maxConcurrent = 10) {}

  get pending() {
    return this.jobs.size;
  }

  load(url: string, priority: number): Promise<ImageBitmap | null> {
    const existing = this.jobs.get(url);
    if (existing) {
      existing.priority = Math.min(existing.priority, priority);
      return existing.promise;
    }
    let resolve!: Job["resolve"];
    let reject!: Job["reject"];
    const promise = new Promise<ImageBitmap | null>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = { url, priority, ctrl: new AbortController(), resolve, reject, promise, started: false };
    this.jobs.set(url, job);
    this.queue.push(job);
    this.pump();
    this.onChange?.();
    return promise;
  }

  /** Re-prioritise / cancel: anything not in `wanted` is dropped (queued) or aborted (in flight). */
  retain(wanted: Map<string, number>) {
    for (const job of [...this.jobs.values()]) {
      const p = wanted.get(job.url);
      if (p === undefined) {
        job.ctrl.abort();
        this.jobs.delete(job.url);
        this.queue = this.queue.filter((j) => j !== job);
        job.reject(new DOMException("cancelled", "AbortError"));
      } else {
        job.priority = p;
      }
    }
    this.pump();
    this.onChange?.();
  }

  private pump() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.active < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift()!;
      this.run(job);
    }
  }

  private async run(job: Job) {
    job.started = true;
    this.active++;
    try {
      const res = await fetch(job.url, { signal: job.ctrl.signal, mode: "cors", cache: "force-cache" });
      if (res.status === 404) {
        job.resolve(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      this.bytes += blob.size;
      const bmp = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none" });
      this.loaded++;
      job.resolve(bmp);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") this.failed++;
      job.reject(e);
    } finally {
      this.active--;
      this.jobs.delete(job.url);
      this.pump();
      this.onChange?.();
    }
  }

  dispose() {
    for (const j of this.jobs.values()) j.ctrl.abort();
    this.jobs.clear();
    this.queue = [];
  }
}
