// TEMPORARY latency instrumentation for the AI workflow.
//
// Enable with:  LATENCY_DEBUG=true npm run dev:server
//
// It prints the wall-clock time spent in each stage of a Gemini-backed request
// (text extraction, prompt creation, the Gemini call, MongoDB save) so we can
// confirm where the slowness comes from before deploying. These logs are
// OFF by default and should be removed once the bottleneck is confirmed.

let enabled;
function isEnabled() {
  if (enabled === undefined) enabled = process.env.LATENCY_DEBUG === 'true';
  return enabled;
}

export function createTracer(name) {
  let last = isEnabled() ? Date.now() : 0;
  let started = last;
  return {
    step(label) {
      if (!isEnabled()) return;
      const now = Date.now();
      console.log(`[PERF ${name}] +${now - last}ms  ${label}  (total ${now - started}ms)`);
      last = now;
    },
  };
}
