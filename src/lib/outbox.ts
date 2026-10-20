// The offline outbox (browser only). Changes made without a connection are
// queued in localStorage and sent to /api/sync when we're back online.
//
// Rules that make replaying safe:
//  - several status taps on one item collapse into the last one
//  - new items carry a clientId; the server ignores a clientId it has seen
//  - the server skips a status tap if the status changed there after it (last
//    write wins); skipped changes are dropped and counted so the UI can say so

export type Op =
  | { opId: string; kind: "setStatus"; tripId: string; taskId: string; status: string; at: number }
  | { opId: string; kind: "addTask"; tripId: string; clientId: string; list: "BUY" | "PACK"; name: string; at: number };
// The `Op` union, minus its auto-filled fields, for callers.
export type NewOp = Op extends infer T ? (T extends Op ? Omit<T, "opId" | "at"> : never) : never;

export type SyncResult = { opId: string; result: "applied" | "duplicate" | "stale" | "missing" | "invalid" };

const KEY = "trailmate:outbox:v1";
const SKIPPED_KEY = "trailmate:outbox:skipped:v1";
export const OUTBOX_EVENT = "trailmate:outbox";

export function readOutbox(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Op[];
  } catch {
    return [];
  }
}

function writeOutbox(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // storage full / private mode: the change still happened on screen
  }
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

/** Queue a change; returns its opId. */
export function enqueue(op: NewOp): string {
  const full = { ...op, opId: crypto.randomUUID(), at: Date.now() } as Op;
  const ops = readOutbox().filter((o) => !(full.kind === "setStatus" && o.kind === "setStatus" && o.taskId === full.taskId));
  writeOutbox([...ops, full]);
  return full.opId;
}

/** The server's request limit is 500 ops; stay well under it. */
export const CHUNK_SIZE = 100;
// Answers that settle an op for good. Anything else (a result this version
// doesn't know) stays queued.
const SETTLED = new Set<SyncResult["result"]>(["applied", "duplicate", "stale", "missing", "invalid"]);
// The ones that mean "your offline change was not saved".
const NOT_SAVED = new Set<SyncResult["result"]>(["stale", "missing", "invalid"]);

/** Changes the server refused, waiting for the traveler to see the notice. */
export function readSkipped(): number {
  try {
    return Number(localStorage.getItem(SKIPPED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function clearSkipped() {
  try {
    localStorage.removeItem(SKIPPED_KEY);
  } catch {
    // storage unavailable: nothing was stored either
  }
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

function addSkipped(n: number) {
  if (n === 0) return;
  try {
    localStorage.setItem(SKIPPED_KEY, String(readSkipped() + n));
  } catch {
    // storage full / private mode: the notice is a nicety
  }
}

export type FlushResult = { applied: number; skipped: string[] };

let flushing: Promise<FlushResult> | null = null;

/**
 * Send everything queued, up to CHUNK_SIZE ops per request. Returns how many
 * changes the server applied and the opIds it refused (stale, missing or
 * invalid) — those are dropped, not retried, and counted for the notice.
 */
export function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const out: FlushResult = { applied: 0, skipped: [] };
    const ops = readOutbox();
    if (ops.length === 0 || !navigator.onLine) return out;
    try {
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ops: chunk }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) break; // server trouble: keep this chunk and the rest, try later
        const { results } = (await res.json()) as { results: SyncResult[] };
        const settled = new Set(results.filter((r) => SETTLED.has(r.result)).map((r) => r.opId));
        const skipped = results.filter((r) => NOT_SAVED.has(r.result)).map((r) => r.opId);
        // Keep ops added while we were sending, drop the ones the server settled.
        writeOutbox(readOutbox().filter((o) => !settled.has(o.opId)));
        addSkipped(skipped.length);
        out.applied += results.filter((r) => r.result === "applied").length;
        out.skipped.push(...skipped);
      }
    } catch {
      // offline / timeout: keep what's left
    } finally {
      flushing = null;
    }
    if (out.skipped.length) window.dispatchEvent(new Event(OUTBOX_EVENT));
    return out;
  })();
  return flushing;
}
