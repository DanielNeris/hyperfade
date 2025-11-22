import test from 'brittle'
import { isExpired, isUnlocked, isVisible } from '../../lib/meta.js'
import { createMonotonicNow } from '../../lib/time.js'

// Helper to get current time using monotonic clock
function getNow() {
  return createMonotonicNow()()
}

test('meta: isExpired', (t) => {
  test('should return true for null/undefined', (t) => {
    t.is(isExpired(null), true)
    t.is(isExpired(undefined), true)
  })

  test('should return false when expiresAt is not set', (t) => {
    const now = getNow()
    const meta = { id: '1', createdAt: now, updatedAt: now }
    t.is(isExpired(meta, now), false)
  })

  test('should return false when not expired', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 1000
    }
    t.is(isExpired(meta, now), false)
  })

  test('should return true when expired', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      expiresAt: now - 1000
    }
    t.is(isExpired(meta, now), true)
  })

  test('should return true when exactly at expiration time', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      expiresAt: now
    }
    t.is(isExpired(meta, now), true)
  })
})

test('meta: isUnlocked', (t) => {
  test('should return false for null/undefined', (t) => {
    t.is(isUnlocked(null), false)
    t.is(isUnlocked(undefined), false)
  })

  test('should return true when unlockAt is not set', (t) => {
    const now = getNow()
    const meta = { id: '1', createdAt: now, updatedAt: now }
    t.is(isUnlocked(meta, now), true)
  })

  test('should return false when not unlocked', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now + 1000
    }
    t.is(isUnlocked(meta, now), false)
  })

  test('should return true when unlocked', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now - 1000
    }
    t.is(isUnlocked(meta, now), true)
  })

  test('should return true when exactly at unlock time', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now
    }
    t.is(isUnlocked(meta, now), true)
  })
})

test('meta: isVisible', (t) => {
  test('should return false for null/undefined', (t) => {
    t.is(isVisible(null), false)
    t.is(isVisible(undefined), false)
  })

  test('should return true when unlocked and not expired', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now
    }
    t.is(isVisible(meta, now), true)
  })

  test('should return false when not unlocked', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now + 1000
    }
    t.is(isVisible(meta, now), false)
  })

  test('should return false when expired', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      expiresAt: now - 1000
    }
    t.is(isVisible(meta, now), false)
  })

  test('should return false when not unlocked and expired', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now + 1000,
      expiresAt: now - 1000
    }
    t.is(isVisible(meta, now), false)
  })

  test('should return true when unlocked and not expired with both timestamps', (t) => {
    const now = getNow()
    const meta = {
      id: '1',
      createdAt: now,
      updatedAt: now,
      unlockAt: now - 1000,
      expiresAt: now + 1000
    }
    t.is(isVisible(meta, now), true)
  })
})
