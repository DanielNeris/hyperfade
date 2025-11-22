import { runEphemeralGC } from './gc.js'
import { createMonotonicNow } from './time.js'

/**
 * @typedef {Object} EphemeralMeta
 * @property {string} id - Unique identifier
 */

/**
 * @typedef {Object} EphemeralGCContext
 * @property {() => Promise<EphemeralMeta[]> | AsyncIterable<EphemeralMeta>} listMetas
 * @property {(meta: EphemeralMeta) => Promise<void>} saveMeta
 * @property {(meta: EphemeralMeta) => Promise<void>} [onExpire]
 */

/**
 * @typedef {Object} EphemeralAutoGCController
 * @property {() => void} start - Start automatic GC
 * @property {() => void} stop - Stop automatic GC
 * @property {() => boolean} isRunning - Check if automatic GC is running
 */

/**
 * Creates an automatic garbage collection controller.
 *
 * @param {EphemeralGCContext} ctx - GC context
 * @param {Object} [options={}] - Options
 * @param {number} [options.intervalMs=60000] - Interval between GC runs in milliseconds
 * @param {() => number} [options.nowFn] - Clock function (defaults to createMonotonicNow())
 * @returns {EphemeralAutoGCController} Controller with start, stop, and isRunning methods
 * @throws {Error} If nowFn is not a function
 */
export function createEphemeralAutoGC(ctx, options = {}) {
  const intervalMs = options.intervalMs ?? 60_000
  const nowFn = options.nowFn ?? createMonotonicNow()

  if (typeof nowFn !== 'function') {
    throw new Error('[ephemeral] createEphemeralAutoGC: nowFn is required')
  }

  let timer = null
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 5

  function tick() {
    runEphemeralGC(ctx, { nowFn })
      .then(() => {
        consecutiveErrors = 0
      })
      .catch((err) => {
        consecutiveErrors++
        console.warn(
          `[ephemeral] auto-GC error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
          err
        )

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[ephemeral] Too many GC errors, stopping auto-GC')
          stop()
        }
      })
  }

  function start() {
    if (timer) return
    consecutiveErrors = 0
    timer = setInterval(tick, intervalMs)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  return { start, stop, isRunning: () => !!timer }
}
