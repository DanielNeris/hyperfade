import { isExpired } from './meta.js'
import { createMonotonicNow } from './time.js'

/**
 * @typedef {Object} EphemeralMeta
 * @property {string} id - Unique identifier
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {number} [unlockAt] - Optional unlock timestamp
 * @property {number} [expiresAt] - Optional expiration timestamp
 */

/**
 * @typedef {Object} EphemeralGCContext
 * @property {() => Promise<EphemeralMeta[]> | AsyncIterable<EphemeralMeta>} listMetas
 * @property {(meta: EphemeralMeta) => Promise<void>} saveMeta
 * @property {(meta: EphemeralMeta) => Promise<void>} [onExpire]
 */

/**
 * @typedef {Object} EphemeralGCResult
 * @property {number} expired - Number of expired metas
 */

/**
 * Runs garbage collection on ephemeral metas.
 *
 * @param {EphemeralGCContext} ctx - GC context
 * @param {Object} [options={}] - Options
 * @param {() => number} [options.nowFn] - Clock function (defaults to createMonotonicNow())
 * @returns {Promise<EphemeralGCResult>} Result with count of expired metas
 */
export async function runEphemeralGC(ctx, options = {}) {
  const nowFn = options.nowFn ?? createMonotonicNow()
  const now = nowFn()
  const metas = await normalizeList(ctx.listMetas)
  let expired = 0

  for (const meta of metas) {
    if (!meta) continue
    if (!isExpired(meta, now)) continue

    if (ctx.onExpire) {
      await ctx.onExpire(meta)
    }

    expired++
  }

  return { expired }
}

/**
 * Normalizes a list function result to an array.
 *
 * @param {() => Promise<EphemeralMeta[]> | AsyncIterable<EphemeralMeta>} fn - Function that returns metas
 * @returns {Promise<EphemeralMeta[]>} Array of metas
 * @throws {Error} If result is not Promise or AsyncIterable
 */
async function normalizeList(fn) {
  try {
    const result = fn()

    if (result && typeof result.then === 'function') {
      return await result
    }

    if (!result || typeof result[Symbol.asyncIterator] !== 'function') {
      throw new Error('[ephemeral] listMetas must return Promise<Array> or AsyncIterable')
    }

    const list = []
    for await (const item of result) {
      list.push(item)
    }
    return list
  } catch (err) {
    console.error('[ephemeral] Error in normalizeList:', err)
    throw err
  }
}
