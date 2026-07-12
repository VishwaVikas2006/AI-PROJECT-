// Prevents two identical Gemini-backed requests from firing at the same time.
// If a request for `key` is already in flight, the caller awaits the same
// promise instead of spawning a second, duplicate API call. This keeps the
// Free Tier quota from being wasted by double-clicks or concurrent calls.

const inFlight = new Map();

export function withInFlightLock(key, fn) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
