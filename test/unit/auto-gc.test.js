import test from 'brittle'
import { createEphemeralAutoGC } from '../../lib/auto-gc.js'
import { createMonotonicNow } from '../../lib/time.js'

// Helper to get current time using monotonic clock
function getNow() {
  return createMonotonicNow()()
}

test('auto-gc: createEphemeralAutoGC', (t) => {
  test('should return controller with start, stop, isRunning', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    t.ok(typeof auto.start === 'function')
    t.ok(typeof auto.stop === 'function')
    t.ok(typeof auto.isRunning === 'function')
  })

  test('should return false for isRunning initially', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    t.is(auto.isRunning(), false)
  })

  test('should return true for isRunning after start', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    auto.start()
    t.is(auto.isRunning(), true)
    auto.stop()
  })

  test('should return false for isRunning after stop', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    auto.start()
    auto.stop()
    t.is(auto.isRunning(), false)
  })

  test('should be idempotent when calling start multiple times', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    auto.start()
    auto.start() // Should not create multiple timers
    t.is(auto.isRunning(), true)
    auto.stop()
  })

  test('should be idempotent when calling stop multiple times', (t) => {
    const ctx = {
      async listMetas() { return [] },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    auto.start()
    auto.stop()
    auto.stop() // Should not error
    t.is(auto.isRunning(), false)
  })

  test('should use default interval of 60 seconds', async (t) => {
    const now = getNow()
    let gcCalls = 0

    const ctx = {
      async listMetas() {
        gcCalls++
        return []
      },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx)
    auto.start()

    // Wait a bit to see if GC runs (but not long enough for default interval)
    await new Promise(resolve => setTimeout(resolve, 100))
    auto.stop()

    // Should not have run yet with default 60s interval
    t.is(gcCalls, 0)
  })

  test('should use custom interval', async (t) => {
    const now = getNow()
    let gcCalls = 0

    const ctx = {
      async listMetas() {
        gcCalls++
        return []
      },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx, { intervalMs: 50 })
    auto.start()

    // Wait for interval to pass
    await new Promise(resolve => setTimeout(resolve, 100))
    auto.stop()

    // Should have run at least once
    t.ok(gcCalls >= 1)
  })

  test('should handle GC errors gracefully', async (t) => {
    const errors = []
    const originalWarn = console.warn
    console.warn = (msg) => errors.push(msg)

    t.teardown(() => {
      console.warn = originalWarn
    }, { order: Infinity })

    const ctx = {
      async listMetas() {
        throw new Error('GC error')
      },
      async saveMeta() { }
    }

    const auto = createEphemeralAutoGC(ctx, { intervalMs: 50 })
    auto.start()

    t.teardown(() => {
      auto.stop()
    }, { order: -1 })

    await new Promise(resolve => setTimeout(resolve, 100))

    t.ok(errors.length >= 1)
    t.ok(errors[0].includes('auto-GC error'))
  })
})
