/**
 * Creates a monotonic "now" provider that never goes backwards.
 *
 * @param {Object} [options] - Options
 * @param {number} [options.maxBackwardsMs=1000] - Tolerance for backward clock jumps
 * @param {number} [options.maxForwardMs=3600000] - Maximum forward jump allowed (default: 1 hour)
 * @returns {() => number} Clock function that returns current timestamp
 */
export function createMonotonicNow(options = {}) {
  const maxBackwardsMs = options.maxBackwardsMs ?? 1000
  const maxForwardMs = options.maxForwardMs ?? 60 * 60 * 1000
  let last = Date.now()
  const startTime = last

  return function now() {
    const current = Date.now()

    if (current > startTime + maxForwardMs) {
      console.warn('[ephemeral] Suspicious clock forward jump detected')
      last = Math.min(current, startTime + maxForwardMs)
      return last
    }

    if (current + maxBackwardsMs < last) {
      return last
    }

    if (current >= last) {
      last = current
      return last
    }

    return last
  }
}
