import test from 'brittle'
import { runEphemeralGC } from '../../lib/gc.js'
import { createMonotonicNow } from '../../lib/time.js'

// Helper to get current time using monotonic clock
function getNow() {
  return createMonotonicNow()()
}

test('gc: runEphemeralGC', (t) => {
  test('should return zero expired when no metas', async (t) => {
    const ctx = {
      async listMetas() {
        return []
      },
      async saveMeta() { },
      async onExpire() { }
    }

    const result = await runEphemeralGC(ctx)
    t.is(result.expired, 0)
  })

  test('should skip null/undefined metas', async (t) => {
    const now = getNow()
    const ctx = {
      async listMetas() {
        return [null, undefined, { id: '1', createdAt: now, updatedAt: now }]
      },
      async saveMeta() { },
      async onExpire() { }
    }

    const result = await runEphemeralGC(ctx)
    t.is(result.expired, 0)
  })

  test('should expire metas with expiresAt in the past', async (t) => {
    const now = getNow()
    const expired = []

    const ctx = {
      async listMetas() {
        return [
          { id: 'keep', createdAt: now, updatedAt: now },
          { id: 'expire1', createdAt: now, updatedAt: now, expiresAt: now - 1000 },
          { id: 'expire2', createdAt: now, updatedAt: now, expiresAt: now - 2000 }
        ]
      },
      async saveMeta() { },
      async onExpire(meta) {
        expired.push(meta.id)
      }
    }

    const result = await runEphemeralGC(ctx, { nowFn: () => now })
    t.is(result.expired, 2)
    t.alike(expired.sort(), ['expire1', 'expire2'])
  })

  test('should not expire metas without expiresAt', async (t) => {
    const now = getNow()
    const expired = []

    const ctx = {
      async listMetas() {
        return [
          { id: 'keep1', createdAt: now, updatedAt: now },
          { id: 'keep2', createdAt: now, updatedAt: now }
        ]
      },
      async saveMeta() { },
      async onExpire(meta) {
        expired.push(meta.id)
      }
    }

    const result = await runEphemeralGC(ctx, { nowFn: () => now })
    t.is(result.expired, 0)
    t.is(expired.length, 0)
  })

  test('should not expire metas with expiresAt in the future', async (t) => {
    const now = getNow()
    const expired = []

    const ctx = {
      async listMetas() {
        return [
          { id: 'keep1', createdAt: now, updatedAt: now, expiresAt: now + 1000 },
          { id: 'keep2', createdAt: now, updatedAt: now, expiresAt: now + 2000 }
        ]
      },
      async saveMeta() { },
      async onExpire(meta) {
        expired.push(meta.id)
      }
    }

    const result = await runEphemeralGC(ctx, { nowFn: () => now })
    t.is(result.expired, 0)
    t.is(expired.length, 0)
  })

  test('should work with AsyncIterable listMetas', async (t) => {
    const now = getNow()
    const expired = []

    async function* listMetas() {
      yield { id: 'expire1', createdAt: now, updatedAt: now, expiresAt: now - 1000 }
      yield { id: 'keep', createdAt: now, updatedAt: now }
      yield { id: 'expire2', createdAt: now, updatedAt: now, expiresAt: now - 2000 }
    }

    const ctx = {
      listMetas,
      async saveMeta() { },
      async onExpire(meta) {
        expired.push(meta.id)
      }
    }

    const result = await runEphemeralGC(ctx, { nowFn: () => now })
    t.is(result.expired, 2)
    t.alike(expired.sort(), ['expire1', 'expire2'])
  })

  test('should work without onExpire callback', async (t) => {
    const now = getNow()

    const ctx = {
      async listMetas() {
        return [
          { id: 'expire1', createdAt: now, updatedAt: now, expiresAt: now - 1000 }
        ]
      },
      async saveMeta() { }
    }

    const result = await runEphemeralGC(ctx, { nowFn: () => now })
    t.is(result.expired, 1)
  })

  test('should use custom now timestamp', async (t) => {
    const baseTime = 1000000
    const expired = []

    const ctx = {
      async listMetas() {
        return [
          { id: 'expire', createdAt: baseTime, updatedAt: baseTime, expiresAt: baseTime + 1000 }
        ]
      },
      async saveMeta() { },
      async onExpire(meta) {
        expired.push(meta.id)
      }
    }

    // Use a timestamp after expiration
    const result = await runEphemeralGC(ctx, { nowFn: () => baseTime + 2000 })
    t.is(result.expired, 1)
    t.alike(expired, ['expire'])
  })
})
