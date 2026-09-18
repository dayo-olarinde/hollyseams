/**
 * Run non-urgent work when the browser is otherwise done.
 *
 * Prefetching is only free when it does not compete with the request the user is waiting on. On a
 * phone over a slow network, three speculative requests fired in a mount effect saturate the
 * connection and slow down the one screen the tailor is actually looking at — the prefetch makes
 * the app feel *worse* in exchange for making a different tap feel better.
 *
 * `requestIdleCallback` is the platform's answer: it runs when the main thread has nothing else to
 * do. Safari gained it in 18.4, so the timeout fallback matters for the iPhones this app runs on;
 * a short timer is still strictly better than firing inside the effect.
 *
 * Returns a cancel function, because an idle callback that outlives the screen that asked for it
 * would warm cache entries nobody is going to look at.
 */
export function scheduleIdle(task: () => void, timeoutMs = 1500): () => void {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(task, 300);
  return () => window.clearTimeout(handle);
}
