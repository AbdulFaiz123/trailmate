// Next.js calls register() once when the server starts. We use it to start
// the background job. Only in the Node.js runtime: the Edge runtime has no
// timers or database access.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production" && !process.env.APP_PASSWORD) {
      console.error("\n  ⚠ APP_PASSWORD is not set: Trailmate will answer every request with 503 until you set it in .env.\n");
    }
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
