import { runEphemeralGC } from './gc.js'
import { createEphemeralAutoGC } from './auto-gc.js'
import { createMonotonicNow } from './time.js'

const MAX_META_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Sanitizes a path component to prevent path traversal attacks.
 *
 * @param {any} component - Path component to sanitize
 * @returns {string | null} Component if valid, null if invalid
 */
function sanitizePathComponent(component) {
  if (typeof component !== 'string') return null
  if (component.includes('..') || component.includes('/') || component.includes('\\')) {
    return null
  }
  if (component.length === 0 || component.length > 255) return null
  return component
}

/**
 * Validates a meta ID format.
 *
 * @param {any} id - ID to validate
 * @returns {boolean} True if valid
 */
function validateMetaId(id) {
  if (typeof id !== 'string') return false
  if (id.length === 0 || id.length > 255) return false
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false
  return true
}

/**
 * @typedef {Object} EphemeralMeta
 * @property {string} id - Unique identifier
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {number} [unlockAt] - Optional unlock timestamp
 * @property {number} [expiresAt] - Optional expiration timestamp
 */

/**
 * @typedef {Object} HyperdriveEphemeralOptions
 * @property {string} prefix - Prefix for document paths
 * @property {string} [metaFile='meta.json'] - Name of the meta file
 * @property {string[]} filesToDelete - List of files to delete when meta expires
 * @property {number} [intervalMs=60000] - Interval for auto-GC in milliseconds
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
 * Creates a GC context for Hyperdrive-based ephemeral storage.
 *
 * @param {Object} drive - Hyperdrive instance
 * @param {HyperdriveEphemeralOptions} [options={}] - Configuration options
 * @returns {EphemeralGCContext} GC context with listMetas, saveMeta, and onExpire
 */
export function createHyperdriveEphemeralContext(drive, options = {}) {
  const prefix = options.prefix
  const metaFile = options.metaFile ?? 'meta.json'
  const filesToDelete = options.filesToDelete

  return {
    listMetas: () => listMetasFromHyperdrive(drive, prefix, metaFile),
    saveMeta: (meta) => saveMetaToHyperdrive(drive, prefix, metaFile, meta),
    onExpire: (meta) => deleteFilesFromHyperdrive(drive, prefix, filesToDelete, meta),
  }
}

/**
 * Creates a complete ephemeral GC setup for Hyperdrive.
 *
 * @param {Object} drive - Hyperdrive instance
 * @param {HyperdriveEphemeralOptions} [options={}] - Configuration options
 * @returns {{
 *   ctx: EphemeralGCContext,
 *   runOnce: () => Promise<EphemeralGCResult>,
 *   auto: import('./auto-gc.js').EphemeralAutoGCController
 * }}
 */
export function createHyperdriveEphemeralGC(drive, options = {}) {
  const ctx = createHyperdriveEphemeralContext(drive, options)
  const nowFn = createMonotonicNow()

  const auto = createEphemeralAutoGC(ctx, {
    intervalMs: options.intervalMs ?? 60_000,
    nowFn,
  })

  async function runOnce() {
    return runEphemeralGC(ctx, { nowFn })
  }

  return {
    ctx,
    runOnce,
    auto,
  }
}

/**
 * Lists all meta files from a Hyperdrive directory.
 *
 * @param {Object} drive - Hyperdrive instance
 * @param {string} prefix - Directory prefix
 * @param {string} metaFile - Name of meta file
 * @returns {Promise<EphemeralMeta[]>} Array of meta objects
 */
async function listMetasFromHyperdrive(drive, prefix, metaFile) {
  const metas = []
  const it = drive.readdir ? drive.readdir(prefix) : null
  if (!it) return metas

  const nowFn = createMonotonicNow()
  const now = nowFn()

  for await (const entry of it) {
    const id = typeof entry === 'string' ? entry : entry.name
    if (!id) continue

    const path = `${prefix}/${id}/${metaFile}`
    const buf = await drive.get(path)
    if (!buf) continue

    if (buf.length > MAX_META_SIZE) {
      console.warn(`[ephemeral] Meta file too large: ${path} (${buf.length} bytes)`)
      continue
    }

    try {
      const meta = JSON.parse(bufferToString(buf))

      if (!meta || typeof meta !== 'object') {
        console.warn(`[ephemeral] Invalid meta structure (not an object): ${path}`)
        continue
      }

      if (!meta.id || typeof meta.id !== 'string') {
        console.warn(`[ephemeral] Invalid meta.id (missing or not string): ${path}`)
        continue
      }

      if (!validateMetaId(meta.id)) {
        console.warn(`[ephemeral] Invalid meta.id format found in Hyperdrive: ${path}`)
        continue
      }

      if (meta.createdAt !== undefined && (typeof meta.createdAt !== 'number' || !isFinite(meta.createdAt))) {
        console.warn(`[ephemeral] Invalid createdAt in meta: ${path}`)
        continue
      }
      if (meta.updatedAt !== undefined && (typeof meta.updatedAt !== 'number' || !isFinite(meta.updatedAt))) {
        console.warn(`[ephemeral] Invalid updatedAt in meta: ${path}`)
        continue
      }

      if (meta.expiresAt !== undefined) {
        if (typeof meta.expiresAt !== 'number' || !isFinite(meta.expiresAt)) {
          console.warn(`[ephemeral] Invalid expiresAt in meta: ${path}`)
          continue
        }
        if (meta.expiresAt < 0 || meta.expiresAt > now + 100 * 365 * 24 * 60 * 60 * 1000) {
          console.warn(`[ephemeral] expiresAt out of bounds in meta: ${path}`)
          continue
        }
      }

      if (meta.unlockAt !== undefined) {
        if (typeof meta.unlockAt !== 'number' || !isFinite(meta.unlockAt)) {
          console.warn(`[ephemeral] Invalid unlockAt in meta: ${path}`)
          continue
        }
        if (meta.unlockAt < 0 || meta.unlockAt > now + 100 * 365 * 24 * 60 * 60 * 1000) {
          console.warn(`[ephemeral] unlockAt out of bounds in meta: ${path}`)
          continue
        }
      }

      metas.push(meta)
    } catch (err) {
      console.warn(`[ephemeral] Failed to parse meta file: ${path}`, err.message)
    }
  }

  return metas
}

/**
 * Saves a meta object to Hyperdrive.
 *
 * @param {Object} drive - Hyperdrive instance
 * @param {string} prefix - Directory prefix
 * @param {string} metaFile - Name of meta file
 * @param {EphemeralMeta} meta - Meta object to save
 * @returns {Promise<void>}
 * @throws {Error} If meta.id or metaFile is invalid
 */
async function saveMetaToHyperdrive(drive, prefix, metaFile, meta) {
  if (!validateMetaId(meta.id)) {
    throw new Error('Invalid meta.id: must be a non-empty string (max 255 chars, alphanumeric/hyphen/underscore only)')
  }

  const id = sanitizePathComponent(meta.id)
  if (!id) throw new Error('Invalid meta.id')

  const metaFileName = sanitizePathComponent(metaFile)
  if (!metaFileName) throw new Error('Invalid metaFile')

  const path = `${prefix}/${id}/${metaFileName}`
  const buf = Buffer.from(JSON.stringify(meta))
  await drive.put(path, buf)
}

/**
 * Deletes files from Hyperdrive when a meta expires.
 *
 * @param {Object} drive - Hyperdrive instance
 * @param {string} prefix - Directory prefix
 * @param {string[]} filesToDelete - List of file names to delete
 * @param {EphemeralMeta} meta - Meta object that expired
 * @returns {Promise<void>}
 */
async function deleteFilesFromHyperdrive(drive, prefix, filesToDelete, meta) {
  if (!validateMetaId(meta.id)) {
    console.warn(`[ephemeral] Invalid meta.id in deleteFilesFromHyperdrive: ${meta.id}`)
    return
  }

  const id = sanitizePathComponent(meta.id)
  if (!id) return

  const base = `${prefix}/${id}`

  const sanitizedFiles = filesToDelete
    .map((name) => sanitizePathComponent(name))
    .filter((name) => name !== null)

  const results = await Promise.allSettled(
    sanitizedFiles.map((name) => drive.del(`${base}/${name}`))
  )

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    console.warn(`[ephemeral] Failed to delete ${failures.length} files for ${id}`)
    failures.forEach((failure) => {
      const failureIndex = results.indexOf(failure)
      if (failureIndex >= 0 && failureIndex < sanitizedFiles.length) {
        const fileName = sanitizedFiles[failureIndex]
        console.warn(`[ephemeral] Failed to delete ${base}/${fileName}:`, failure.reason?.message || failure.reason)
      } else {
        console.warn(`[ephemeral] Failed to delete file (index ${failureIndex}):`, failure.reason?.message || failure.reason)
      }
    })
  }

  if (drive.exists) {
    await new Promise(resolve => setTimeout(resolve, 100))

    for (const name of sanitizedFiles) {
      try {
        const exists = await drive.exists(`${base}/${name}`)
        if (exists) {
          try {
            await drive.del(`${base}/${name}`)
            await new Promise(resolve => setTimeout(resolve, 50))
            const stillExists = await drive.exists(`${base}/${name}`)
            if (stillExists) {
              console.warn(`[ephemeral] File ${name} still exists after retry for ${id}`)
            }
          } catch (retryErr) {
            console.warn(`[ephemeral] Retry deletion failed for ${base}/${name}:`, retryErr.message)
          }
        }
      } catch (err) {
        console.warn(`[ephemeral] Could not verify deletion of ${base}/${name}:`, err.message)
      }
    }
  }
}

/**
 * Converts a buffer to a string, handling various buffer types.
 *
 * @param {Buffer | ArrayBuffer | any} buf - Buffer to convert
 * @returns {string} String representation
 */
function bufferToString(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('utf8')
  if (buf && buf.buffer && buf.byteLength !== undefined) {
    return Buffer.from(buf.buffer, buf.byteOffset ?? 0, buf.byteLength).toString('utf8')
  }
  return String(buf)
}
