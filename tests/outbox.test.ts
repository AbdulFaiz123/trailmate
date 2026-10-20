// Run with: npm test
// The outbox runs in the browser; give it just enough of one (it only touches
// these globals when called, so stubbing them after the import is fine).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { enqueue, flushOutbox, readOutbox, readSkipped, clearSkipped, CHUNK_SIZE, type SyncResult } from "../src/lib/outbox";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  window: new EventTarget(),
});
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

type Reply = (ops: { opId: string }[]) => Response;
let requests: { opId: string }[][] = [];
let reply: Reply = () => new Response("", { status: 500 });
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const { ops } = JSON.parse(String(init.body)) as { ops: { opId: string }[] };
  requests.push(ops);
  return reply(ops);
}) as typeof fetch;
const answer = (result: (opId: string, i: number) => SyncResult["result"]): Reply => (ops) =>
  Response.json({ results: ops.map((o, i) => ({ opId: o.opId, result: result(o.opId, i) })) });

const addItems = (n: number) => Array.from({ length: n }, (_, i) => enqueue({ kind: "addTask", tripId: "t", list: "BUY", name: `item ${i}`, clientId: `client-${i}-xxxx` }));

beforeEach(() => {
  store.clear();
  requests = [];
});

test("a big outbox goes in chunks the server accepts", async () => {
  addItems(250);
  reply = answer(() => "applied");
  const r = await flushOutbox();
  assert.deepEqual(requests.map((ops) => ops.length), [CHUNK_SIZE, CHUNK_SIZE, 50]);
  assert.equal(r.applied, 250);
  assert.equal(readOutbox().length, 0);
});

test("server trouble keeps the unsent chunks and the failed one, but not the ones already done", async () => {
  addItems(250);
  let call = 0;
  reply = (ops) => (++call === 2 ? new Response("boom", { status: 500 }) : answer(() => "applied")(ops));
  const r = await flushOutbox();
  assert.equal(r.applied, 100);
  assert.equal(readOutbox().length, 150, "chunks 2 and 3 wait for the next try");
  assert.equal(requests.length, 2, "stops at the first failure");
});

test("invalid, missing and stale ops are dropped (not retried forever) and counted for the notice", async () => {
  const ids = addItems(4);
  const results: SyncResult["result"][] = ["applied", "invalid", "missing", "stale"];
  reply = answer((_, i) => results[i]);
  const r = await flushOutbox();
  assert.equal(r.applied, 1);
  assert.deepEqual(r.skipped, ids.slice(1));
  assert.equal(readOutbox().length, 0);
  assert.equal(readSkipped(), 3);
  clearSkipped();
  assert.equal(readSkipped(), 0);
});

test("a result this version doesn't know keeps the op queued", async () => {
  addItems(1);
  reply = answer(() => "later" as SyncResult["result"]);
  await flushOutbox();
  assert.equal(readOutbox().length, 1);
});

test("several taps on one item collapse into the last", () => {
  enqueue({ kind: "setStatus", tripId: "t", taskId: "a", status: "BOUGHT" });
  const last = enqueue({ kind: "setStatus", tripId: "t", taskId: "a", status: "PACKED" });
  assert.deepEqual(readOutbox().map((o) => o.opId), [last]);
});
