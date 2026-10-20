import type { VariantSettings, VariantResult } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

interface Job {
  request: WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;
  isStale: () => boolean;
  resolve: (r: WorkerResponse & { ok: true }) => void;
  reject: (e: Error) => void;
}

export class StaleError extends Error {
  constructor() {
    super("stale");
  }
}

/** Kleiner Worker-Pool: mehrere Bilder werden parallel berechnet, veraltete Jobs werden übersprungen. */
class WorkerPool {
  private workers: { worker: Worker; busy: boolean }[] = [];
  private queue: Job[] = [];
  private pending = new Map<number, { job: Job; slot: { worker: Worker; busy: boolean } }>();
  private nextId = 1;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      const slot = { worker, busy: false };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(slot, e.data);
      worker.onerror = (e) => this.onCrash(slot, e.message);
      this.workers.push(slot);
    }
  }

  private onMessage(slot: { worker: Worker; busy: boolean }, res: WorkerResponse) {
    const entry = this.pending.get(res.id);
    this.pending.delete(res.id);
    slot.busy = false;
    if (entry) {
      if (res.ok) entry.job.resolve(res);
      else entry.job.reject(new Error(res.error));
    }
    this.pump();
  }

  private onCrash(slot: { worker: Worker; busy: boolean }, message: string) {
    for (const [id, entry] of this.pending) {
      if (entry.slot === slot) {
        this.pending.delete(id);
        entry.job.reject(new Error(message || "Worker-Fehler"));
      }
    }
    slot.busy = false;
    this.pump();
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      let job = this.queue.shift();
      while (job && job.isStale()) {
        job.reject(new StaleError());
        job = this.queue.shift();
      }
      if (!job) return;
      slot.busy = true;
      const id = this.nextId++;
      this.pending.set(id, { job, slot });
      slot.worker.postMessage({ id, ...job.request } as WorkerRequest);
    }
  }

  run(request: Job["request"], isStale: () => boolean): Promise<WorkerResponse & { ok: true }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, isStale, resolve, reject });
      this.pump();
    });
  }
}

let pool: WorkerPool | null = null;
function getPool(): WorkerPool {
  if (!pool) {
    const cores = navigator.hardwareConcurrency || 4;
    pool = new WorkerPool(Math.max(1, Math.min(4, cores - 1)));
  }
  return pool;
}

export async function probeImage(blob: Blob): Promise<{ width: number; height: number }> {
  const res = await getPool().run({ kind: "probe", blob }, () => false);
  if (res.kind !== "probe") throw new Error("Unerwartete Antwort");
  return { width: res.width, height: res.height };
}

export async function processImage(
  blob: Blob,
  settings: VariantSettings,
  isStale: () => boolean,
): Promise<VariantResult> {
  const res = await getPool().run({ kind: "process", blob, settings }, isStale);
  if (res.kind !== "process") throw new Error("Unerwartete Antwort");
  return { blob: res.blob, width: res.width, height: res.height, size: res.blob.size };
}
