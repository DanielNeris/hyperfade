import test from 'brittle'
import {
  createHyperdriveEphemeralContext,
  createHyperdriveEphemeralGC
} from '../../lib/hyperdrive-adapter.js'
import { createMonotonicNow } from '../../lib/time.js'

function getNow() {
  return createMonotonicNow()()
}

test('hyperdrive-adapter: createHyperdriveEphemeralContext', (t) => {
  test('should return context with listMetas, saveMeta, onExpire', (t) => {
    const mockDrive = {}
    const ctx = createHyperdriveEphemeralContext(mockDrive, {
      prefix: '/test',
      filesToDelete: ['file.txt']
    })

    t.ok(typeof ctx.listMetas === 'function')
    t.ok(typeof ctx.saveMeta === 'function')
    t.ok(typeof ctx.onExpire === 'function')
  })
})

test('hyperdrive-adapter: saveMeta validation', (t) => {
  test('should throw error for invalid meta.id', async (t) => {
    const mockDrive = {
      async put() { }
    }

    const ctx = createHyperdriveEphemeralContext(mockDrive, {
      prefix: '/test',
      filesToDelete: []
    })

    await t.exception(async () => {
      await ctx.saveMeta({
        id: '../etc/passwd',
        createdAt: getNow(),
        updatedAt: getNow()
      })
    }, 'should reject path traversal in meta.id')

    await t.exception(async () => {
      await ctx.saveMeta({
        id: '',
        createdAt: getNow(),
        updatedAt: getNow()
      })
    }, 'should reject empty meta.id')

    await t.exception(async () => {
      await ctx.saveMeta({
        id: 'a'.repeat(256),
        createdAt: getNow(),
        updatedAt: getNow()
      })
    }, 'should reject meta.id longer than 255 chars')

    await t.exception(async () => {
      await ctx.saveMeta({
        id: 'invalid id with spaces',
        createdAt: getNow(),
        updatedAt: getNow()
      })
    }, 'should reject meta.id with invalid characters')
  })

  test('should accept valid meta.id', async (t) => {
    const mockDrive = {
      async put(path, buf) {
        t.ok(path.includes('valid-id'))
      }
    }

    const ctx = createHyperdriveEphemeralContext(mockDrive, {
      prefix: '/test',
      filesToDelete: []
    })

    await ctx.saveMeta({
      id: 'valid-id_123',
      createdAt: getNow(),
      updatedAt: getNow()
    })

    t.pass('should accept valid meta.id')
  })
})

test('hyperdrive-adapter: listMetas validation', async (t) => {
  const now = getNow()
  const validMeta = {
    id: 'valid-1',
    createdAt: now,
    updatedAt: now
  }

  const mockDrive = {
    async *readdir() {
      yield 'valid-1'
      yield 'invalid-1'
      yield 'invalid-2'
      yield 'invalid-3'
      yield 'invalid-4'
      yield 'invalid-5'
      yield 'invalid-6'
      yield 'invalid-7'
      yield 'invalid-8'
    },
    async get(path) {
      if (path.includes('valid-1')) {
        return Buffer.from(JSON.stringify(validMeta))
      }
      if (path.includes('invalid-1')) {
        return Buffer.from(JSON.stringify({ id: '../etc/passwd', createdAt: now, updatedAt: now }))
      }
      if (path.includes('invalid-2')) {
        return Buffer.from(JSON.stringify({ id: '', createdAt: now, updatedAt: now }))
      }
      if (path.includes('invalid-3')) {
        return Buffer.from(JSON.stringify({ id: 'valid-2', createdAt: NaN, updatedAt: now }))
      }
      if (path.includes('invalid-4')) {
        return Buffer.from(JSON.stringify({ id: 'valid-3', createdAt: now, updatedAt: Infinity }))
      }
      if (path.includes('invalid-5')) {
        return Buffer.from(JSON.stringify({ id: 'valid-4', createdAt: now, updatedAt: now, expiresAt: -1 }))
      }
      if (path.includes('invalid-6')) {
        return Buffer.from(JSON.stringify({ id: 'valid-5', createdAt: now, updatedAt: now, expiresAt: Date.now() + 200 * 365 * 24 * 60 * 60 * 1000 }))
      }
      if (path.includes('invalid-7')) {
        return Buffer.from(JSON.stringify({ id: 'valid-6', createdAt: now, updatedAt: now, unlockAt: -1 }))
      }
      if (path.includes('invalid-8')) {
        return Buffer.from(JSON.stringify({ id: 'valid-7', createdAt: now, updatedAt: now, unlockAt: Date.now() + 200 * 365 * 24 * 60 * 60 * 1000 }))
      }
      return null
    }
  }

  const ctx = createHyperdriveEphemeralContext(mockDrive, {
    prefix: '/test',
    filesToDelete: []
  })

  const metas = await ctx.listMetas()

  t.ok(metas.length >= 1, 'should return at least valid meta')
  const validMetaIds = metas.map(m => m.id)
  t.ok(validMetaIds.includes('valid-1'), 'should return valid meta')
  t.ok(!validMetaIds.includes('../etc/passwd'), 'should reject path traversal')
  t.ok(!validMetaIds.includes(''), 'should reject empty id')
})

test('hyperdrive-adapter: createHyperdriveEphemeralGC', (t) => {
  test('should return ctx, runOnce, auto', (t) => {
    const mockDrive = {
      async *readdir() { },
      async get() { return null }
    }

    const { ctx, runOnce, auto } = createHyperdriveEphemeralGC(mockDrive, {
      prefix: '/test',
      filesToDelete: []
    })

    t.ok(ctx)
    t.ok(typeof runOnce === 'function')
    t.ok(typeof auto.start === 'function')
    t.ok(typeof auto.stop === 'function')
    t.ok(typeof auto.isRunning === 'function')
  })
})

