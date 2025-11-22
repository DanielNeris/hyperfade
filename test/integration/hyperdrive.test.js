import test from 'brittle'
import { createTestDrive } from '../helpers.js'
import {
  createHyperdriveEphemeralContext,
  createHyperdriveEphemeralGC
} from '../../lib/hyperdrive-adapter.js'
import { isExpired, isUnlocked, isVisible } from '../../lib/meta.js'
import { createMonotonicNow } from '../../lib/time.js'

function getNow() {
  return createMonotonicNow()()
}

const PREFIX = '/sessions'
const META_FILE = 'meta.json'

test('integration: Hyperdrive GC', (t) => {
  test('should expire meta and delete files from Hyperdrive', async (t) => {
    const { drive, cleanup } = await createTestDrive()
    t.teardown(cleanup, { order: Infinity })

    const now = getNow()
    const id = 'session-1'

    const meta = {
      id,
      createdAt: now - 20_000,
      updatedAt: now - 20_000,
      expiresAt: now - 1_000
    }

    // Write meta and payload to Hyperdrive
    await drive.put(`${PREFIX}/${id}/${META_FILE}`, Buffer.from(JSON.stringify(meta)))
    await drive.put(`${PREFIX}/${id}/payload.txt`, Buffer.from('hello ephemeral'))

    const ctx = createHyperdriveEphemeralContext(drive, {
      prefix: PREFIX,
      metaFile: META_FILE,
      filesToDelete: [META_FILE, 'payload.txt']
    })

    const { runOnce } = createHyperdriveEphemeralGC(drive, {
      prefix: PREFIX,
      metaFile: META_FILE,
      filesToDelete: [META_FILE, 'payload.txt'],
      intervalMs: 1000
    })

    const result = await runOnce()
    t.is(result.expired, 1, 'should expire 1 meta')

    // meta.json should have been deleted from Hyperdrive
    const buf = await drive.get(`${PREFIX}/${id}/${META_FILE}`)
    t.is(buf, null, 'meta.json should have been deleted from Hyperdrive')

    // payload should have been deleted
    const payload = await drive.get(`${PREFIX}/${id}/payload.txt`)
    t.is(payload, null, 'payload.txt should have been deleted from Hyperdrive')
  })
})

test('integration: Hyperdrive visibility', (t) => {
  test('should be visible when meta has no expiresAt/unlockAt', async (t) => {
    const { drive, cleanup } = await createTestDrive()
    t.teardown(cleanup, { order: Infinity })

    const now = getNow()
    const id = 'm1'

    const meta = {
      id,
      createdAt: now,
      updatedAt: now
    }

    await drive.put(`${PREFIX}/${id}/${META_FILE}`, Buffer.from(JSON.stringify(meta)))

    const buf = await drive.get(`${PREFIX}/${id}/${META_FILE}`)
    const loaded = JSON.parse(buf.toString('utf8'))

    t.is(isExpired(loaded, now), false)
    t.is(isUnlocked(loaded, now), true)
    t.is(isVisible(loaded, now), true)
  })

  test('should not be visible when unlockAt is in the future', async (t) => {
    const { drive, cleanup } = await createTestDrive()
    t.teardown(cleanup, { order: Infinity })

    const now = getNow()
    const id = 'm2'

    const meta = {
      id,
      createdAt: now,
      updatedAt: now,
      unlockAt: now + 5_000
    }

    await drive.put(`${PREFIX}/${id}/${META_FILE}`, Buffer.from(JSON.stringify(meta)))

    const buf = await drive.get(`${PREFIX}/${id}/${META_FILE}`)
    const loaded = JSON.parse(buf.toString('utf8'))

    t.is(isUnlocked(loaded, now), false)
    t.is(isVisible(loaded, now), false)

    const later = now + 5_001
    t.is(isUnlocked(loaded, later), true)
    t.is(isVisible(loaded, later), true)
  })

  test('should be visible until expiresAt', async (t) => {
    const { drive, cleanup } = await createTestDrive()
    t.teardown(cleanup, { order: Infinity })

    const now = getNow()
    const id = 'm3'

    const meta = {
      id,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 5_000
    }

    await drive.put(`${PREFIX}/${id}/${META_FILE}`, Buffer.from(JSON.stringify(meta)))

    const buf = await drive.get(`${PREFIX}/${id}/${META_FILE}`)
    const loaded = JSON.parse(buf.toString('utf8'))

    const before = now + 4_000
    t.is(isExpired(loaded, before), false)
    t.is(isVisible(loaded, before), true)

    const after = now + 5_001
    t.is(isExpired(loaded, after), true)
    t.is(isVisible(loaded, after), false)
  })
})

test('integration: Hyperdrive auto-GC', (t) => {
  test('should run GC automatically at intervals', async (t) => {
    const { drive, cleanup } = await createTestDrive()
    t.teardown(cleanup, { order: Infinity })

    const now = getNow()
    const id = 'auto-gc-test'

    const meta = {
      id,
      createdAt: now - 20_000,
      updatedAt: now - 20_000,
      expiresAt: now - 1_000
    }

    await drive.put(`${PREFIX}/${id}/${META_FILE}`, Buffer.from(JSON.stringify(meta)))
    await drive.put(`${PREFIX}/${id}/payload.txt`, Buffer.from('test'))

    const { auto } = createHyperdriveEphemeralGC(drive, {
      prefix: PREFIX,
      metaFile: META_FILE,
      filesToDelete: [META_FILE, 'payload.txt'],
      intervalMs: 100
    })

    t.teardown(() => {
      auto.stop()
    }, { order: -1 })

    auto.start()
    t.is(auto.isRunning(), true)

    // Wait for GC to run
    await new Promise(resolve => setTimeout(resolve, 150))

    // Files should be deleted
    const buf = await drive.get(`${PREFIX}/${id}/${META_FILE}`)
    t.is(buf, null, 'meta.json should have been deleted by auto-GC')

    const payload = await drive.get(`${PREFIX}/${id}/payload.txt`)
    t.is(payload, null, 'payload.txt should have been deleted by auto-GC')
  })
})

