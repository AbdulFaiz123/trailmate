// Next.js calls register() once when the server starts. We use it to start
// the background job. Only in the Node.js runtime: the Edge runtime has no
// timers or database access.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
