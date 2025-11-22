/**
 * @typedef {Object} EphemeralMeta
 * @property {string} id - Unique identifier
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {number} [unlockAt] - Optional unlock timestamp
 * @property {number} [expiresAt] - Optional expiration timestamp
 */

const MAX_TIMESTAMP = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000

/**
 * Validates a timestamp is within reasonable bounds.
 *
 * @param {number} ts - Timestamp to validate
 * @param {string} fieldName - Name of the field
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {boolean} True if valid
 */
function validateTimestamp(ts, fieldName, min = 0, max = MAX_TIMESTAMP) {
  if (typeof ts !== 'number') return false
  if (!isFinite(ts)) return false
  if (ts < min || ts > max) return false
  return true
}

/**
 * Checks if a meta object has expired based on its expiresAt timestamp.
 *
 * @param {EphemeralMeta | null} meta - The meta object to check
 * @param {number} now - Current timestamp
 * @returns {boolean} True if expired, false otherwise
 * @throws {Error} If now is not a finite number
 */
export function isExpired(meta, now) {
  if (!meta) return true
  if (typeof now !== 'number' || !isFinite(now)) {
    throw new Error('[ephemeral] isExpired: now is required and must be finite')
  }
  if (typeof meta.expiresAt !== 'number') return false

  if (!validateTimestamp(meta.expiresAt, 'expiresAt')) {
    return false
  }

  return meta.expiresAt <= now
}

/**
 * Checks if a meta object is unlocked based on its unlockAt timestamp.
 *
 * @param {EphemeralMeta | null} meta - The meta object to check
 * @param {number} now - Current timestamp
 * @returns {boolean} True if unlocked, false otherwise
 * @throws {Error} If now is not a finite number
 */
export function isUnlocked(meta, now) {
  if (!meta) return false
  if (typeof now !== 'number' || !isFinite(now)) {
    throw new Error('[ephemeral] isUnlocked: now is required and must be finite')
  }
  if (typeof meta.unlockAt !== 'number') return true

  if (!validateTimestamp(meta.unlockAt, 'unlockAt')) {
    return true
  }

  return meta.unlockAt <= now
}

/**
 * Checks if a meta object is visible (unlocked and not expired).
 *
 * @param {EphemeralMeta | null} meta - The meta object to check
 * @param {number} now - Current timestamp
 * @returns {boolean} True if visible, false otherwise
 */
export function isVisible(meta, now) {
  return isUnlocked(meta, now) && !isExpired(meta, now)
}
