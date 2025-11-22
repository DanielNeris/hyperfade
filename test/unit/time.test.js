import test from 'brittle'
import { createMonotonicNow } from '../../lib/time.js'

test('time: createMonotonicNow', (t) => {
  test('should return a function', (t) => {
    const now = createMonotonicNow()
    t.ok(typeof now === 'function')
  })

  test('should return increasing timestamps', (t) => {
    const now = createMonotonicNow()
    const t1 = now()
    const t2 = now()
    t.ok(t2 >= t1, 'should be monotonic (non-decreasing)')
  })

  test('should not go backwards when clock is set backwards', (t) => {
    let mockTime = 1000
    const originalNow = Date.now
    Date.now = () => mockTime

    t.teardown(() => {
      Date.now = originalNow
    }, { order: Infinity })

    const now = createMonotonicNow({ maxBackwardsMs: 100 })

    const t1 = now() // Should be 1000
    t.is(t1, 1000)

    // Simulate clock going backwards by 50ms (within tolerance)
    mockTime = 950
    const t2 = now() // Should still return 1000 (locked to last value)
    t.is(t2, 1000, 'should not go backwards even if clock does')

    // Clock moves forward normally
    mockTime = 1100
    const t3 = now() // Should be 1100
    t.is(t3, 1100)
  })

  test('should not go backwards when clock jumps far into the past', (t) => {
    let mockTime = 10000
    const originalNow = Date.now
    Date.now = () => mockTime

    t.teardown(() => {
      Date.now = originalNow
    }, { order: Infinity })

    const now = createMonotonicNow({ maxBackwardsMs: 1000 })

    const t1 = now() // Should be 10000
    t.is(t1, 10000)

    // Simulate clock jumping far into the past (more than tolerance)
    mockTime = 5000 // 5000ms backwards, more than maxBackwardsMs (1000)
    const t2 = now() // Should still return 10000 (locked to last value)
    t.is(t2, 10000, 'should ignore large backwards jumps')

    // Clock moves forward normally
    mockTime = 11000
    const t3 = now() // Should be 11000
    t.is(t3, 11000)
  })

  test('should handle clock going forward normally', (t) => {
    let mockTime = 1000
    const originalNow = Date.now
    Date.now = () => mockTime

    t.teardown(() => {
      Date.now = originalNow
    }, { order: Infinity })

    const now = createMonotonicNow()

    const t1 = now()
    t.is(t1, 1000)

    mockTime = 2000
    const t2 = now()
    t.is(t2, 2000)

    mockTime = 3000
    const t3 = now()
    t.is(t3, 3000)
  })

  test('should use custom maxBackwardsMs tolerance', (t) => {
    let mockTime = 1000
    const originalNow = Date.now
    Date.now = () => mockTime

    t.teardown(() => {
      Date.now = originalNow
    }, { order: Infinity })

    // Custom tolerance of 500ms
    const now = createMonotonicNow({ maxBackwardsMs: 500 })

    const t1 = now() // 1000
    t.is(t1, 1000)

    // Small backwards jump within tolerance (400ms)
    mockTime = 600
    const t2 = now() // Should still be 1000 (within tolerance)
    t.is(t2, 1000)

    // Large backwards jump beyond tolerance (600ms > 500ms)
    mockTime = 400
    const t3 = now() // Should still be 1000 (beyond tolerance, but still locked)
    t.is(t3, 1000)
  })

  test('should prevent clock manipulation attacks', (t) => {
    let mockTime = 1000
    const originalNow = Date.now
    Date.now = () => mockTime

    t.teardown(() => {
      Date.now = originalNow
    }, { order: Infinity })

    const now = createMonotonicNow()

    // Normal progression
    const t1 = now()
    mockTime = 2000
    const t2 = now()
    t.ok(t2 > t1, 'should progress forward normally')

    // Attacker tries to set clock backwards
    mockTime = 500
    const t3 = now()
    t.ok(t3 >= t2, 'should not go backwards even if clock is manipulated')

    // Attacker tries to set clock to far future then back
    mockTime = 50000
    const t4 = now()
    t.ok(t4 >= t3, 'should handle forward jumps')

    mockTime = 1000 // Try to go back
    const t5 = now()
    t.ok(t5 >= t4, 'should not go backwards after forward jump')
  })

  test('should handle multiple instances independently', (t) => {
    const now1 = createMonotonicNow()
    const now2 = createMonotonicNow()

    const t1 = now1()
    const t2 = now2()

    // Both should return similar times (within a few ms)
    t.ok(Math.abs(t1 - t2) < 100, 'instances should be independent')
  })
})

