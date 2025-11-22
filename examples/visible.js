import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { isVisible, createHyperdriveEphemeralContext } from '../index.js'
import { createMonotonicNow } from '../lib/time.js'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * Example demonstrating unlockAt - messages that become visible after a delay.
 * 
 * This example:
 * 1. Creates a Hyperdrive instance
 * 2. Creates sessions with unlockAt timestamps
 * 3. Demonstrates that messages are not visible until unlock time
 * 4. Shows messages becoming visible after unlock
 * 
 * Based on Hyperdrive documentation:
 * https://docs.pears.com/building-blocks/hyperdrive
 * https://docs.pears.com/how-tos/create-a-full-peer-to-peer-filesystem-with-hyperdrive
 */
async function main() {
  // Create a temporary directory for this example
  const dir = mkdtempSync(join(tmpdir(), 'hyperfade-visible-'))
  console.log('📂 Using temporary directory:', dir)

  // Create Corestore instance (manages multiple Hypercores)
  const store = new Corestore(dir)

  // Create Hyperdrive instance (distributed file system)
  // Hyperdrive uses two Hypercores: one for metadata (Hyperbee) and one for content
  const drive = new Hyperdrive(store)
  await drive.ready()

  console.log('✅ Hyperdrive ready')
  console.log('   Key:', drive.key.toString('hex'))
  console.log('   Writable:', drive.writable)
  console.log('   Readable:', drive.readable)

  // Create ephemeral context to use saveMeta (includes security validation)
  const ctx = createHyperdriveEphemeralContext(drive, {
    prefix: '/sessions',
    metaFile: 'meta.json',
    filesToDelete: [] // Not using deletion in this example
  })

  // Use monotonic clock for security (prevents clock manipulation attacks)
  const now = createMonotonicNow()
  const currentTime = now()
  const sessionId = 'session-1'

  // Create a session that unlocks in 1 second
  const meta = {
    id: sessionId,
    createdAt: currentTime,
    updatedAt: currentTime,
    unlockAt: currentTime + 1000 // Unlocks in 1 second
  }

  console.log('\n📝 Creating locked session:', sessionId)
  console.log('   Unlocks at:', new Date(meta.unlockAt).toISOString())
  console.log('   Current time:', new Date(currentTime).toISOString())

  // Use ctx.saveMeta() to save meta (includes security validation)
  // This ensures meta.id is validated and sanitized
  await ctx.saveMeta(meta)

  // Write message file directly to Hyperdrive
  await drive.put(`/sessions/${sessionId}/message.txt`, Buffer.from('This message is locked!'))

  const loadedMeta = JSON.parse((await drive.get(`/sessions/${sessionId}/meta.json`)).toString('utf8'))

  console.log('\n👁️  Session visibility check (before unlock):')
  console.log('   Visible:', isVisible(loadedMeta, currentTime))
  console.log('   Unlocked:', loadedMeta.unlockAt <= currentTime)

  // Try to read message before unlock
  if (isVisible(loadedMeta, currentTime)) {
    const message = await drive.get(`/sessions/${sessionId}/message.txt`)
    console.log('   Message:', message.toString('utf8'))
  } else {
    console.log('   ⚠️  Message is locked - cannot read yet')
  }

  // Wait for unlock
  console.log('\n⏳ Waiting for unlock (1 second)...')
  await new Promise(resolve => setTimeout(resolve, 1500))

  // Get updated time from monotonic clock
  const laterTime = now()
  console.log('\n👁️  Session visibility check (after unlock):')
  console.log('   Visible:', isVisible(loadedMeta, laterTime))
  console.log('   Unlocked:', loadedMeta.unlockAt <= laterTime)

  // Read message after unlock
  if (isVisible(loadedMeta, laterTime)) {
    const message = await drive.get(`/sessions/${sessionId}/message.txt`)
    console.log('\n📨 Message content:', message.toString('utf8'))
    console.log('   ✅ Message is now visible and readable!')
  } else {
    console.log('   ⚠️  Message is still locked')
  }

  // Cleanup
  await drive.del(`/sessions/${sessionId}/meta.json`)
  await drive.del(`/sessions/${sessionId}/message.txt`)

  // Close drive and store
  await drive.close()
  await store.close()

  // Delete temporary directory
  rmSync(dir, { recursive: true, force: true })

  console.log('\n✨ Example completed!')
  console.log('\n📚 Learn more:')
  console.log('   - Hyperdrive API: https://docs.pears.com/building-blocks/hyperdrive')
  console.log('   - P2P Filesystem: https://docs.pears.com/how-tos/create-a-full-peer-to-peer-filesystem-with-hyperdrive')
}

main().catch(console.error)

