// The offline outbox (browser only). Changes made without a connection are
// queued in localStorage and sent to /api/sync when we're back online.
//
// Rules that make replaying safe:
//  - several status taps on one item collapse into the last one
//  - new items carry a clientId; the server ignores a clientId it has seen
//  - the server skips a change if it already has a newer one (last write wins)

export type Op =
  | { opId: string; kind: "setStatus"; tripId: string; taskId: string; status: string; at: number }
  | { opId: string; kind: "addTask"; tripId: string; clientId: string; list: "BUY" | "PACK"; name: string; at: number };
// The `Op` union, minus its auto-filled fields, for callers.
export type NewOp = Op extends infer T ? (T extends Op ? Omit<T, "opId" | "at"> : never) : never;

export type SyncResult = { opId: string; result: "applied" | "duplicate" | "stale" | "missing" | "invalid" };

const KEY = "trailmate:outbox:v1";
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

export function enqueue(op: NewOp) {
  const full = { ...op, opId: crypto.randomUUID(), at: Date.now() } as Op;
  const ops = readOutbox().filter((o) => !(full.kind === "setStatus" && o.kind === "setStatus" && o.taskId === full.taskId));
  writeOutbox([...ops, full]);
}

let flushing: Promise<number> | null = null;

/** Send everything queued. Returns how many changes the server applied. */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    const ops = readOutbox();
    if (ops.length === 0 || !navigator.onLine) return 0;
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ops }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return 0; // server trouble: keep everything, try later
      const { results } = (await res.json()) as { results: SyncResult[] };
      const done = new Set(results.map((r) => r.opId));
      // Keep ops added while we were sending, drop the ones the server answered.
      writeOutbox(readOutbox().filter((o) => !done.has(o.opId)));
      return results.filter((r) => r.result === "applied").length;
    } catch {
      return 0; // offline / timeout: keep everything
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
