// Runs a long async operation while periodically "ticking" — used to refresh a job's lock
// and the ARI daemon's SystemStatus heartbeat during opaque long calls, so the DB stays
// fresh and the UI can tell a worker is alive vs hung. Worker-safe. The tick is
// fire-and-forget; tick errors are swallowed so they can't fail the wrapped operation.
export async function withHeartbeat<T>(
  intervalMs: number,
  tick: () => void | Promise<void>,
  fn: () => Promise<T>,
): Promise<T> {
  const timer = setInterval(() => {
    void Promise.resolve().then(tick).catch(() => {});
  }, intervalMs);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
