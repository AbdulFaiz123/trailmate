// Shared fetch helper: timeout + one retry for every external call.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function getJson<T>(url: string, opts: { timeoutMs?: number; retries?: number; fetchImpl?: FetchLike } = {}): Promise<T> {
  const { timeoutMs = 8_000, retries = 1, fetchImpl = fetch } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break; // 4xx won't fix itself
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1_000));
  }
  throw lastError;
}
