import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { createHyperdriveEphemeralGC } from '../index.js'
import { createMonotonicNow } from '../lib/time.js'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * Example demonstrating automatic deletion with expiresAt.
 * 
 * This example:
 * 1. Creates a Hyperdrive instance
 * 2. Creates sessions with expiration timestamps
 * 3. Uses automatic GC to clean up expired sessions
 * 4. Demonstrates file deletion after expiration
 * 
 * Based on Hyperdrive documentation:
 * https://docs.pears.com/building-blocks/hyperdrive
 * https://docs.pears.com/how-tos/create-a-full-peer-to-peer-filesystem-with-hyperdrive
 */
async function main() {
  // Create a temporary directory for this example
  const dir = mkdtempSync(join(tmpdir(), 'hyperfade-delete-'))
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

  // Create ephemeral GC setup
  // This will automatically delete expired sessions
  const { ctx, runOnce, auto } = createHyperdriveEphemeralGC(drive, {
    prefix: '/sessions',
    metaFile: 'meta.json',
    filesToDelete: ['meta.json', 'audio.m4a', 'payload.txt'], // All files to delete on expiration
    intervalMs: 5000 // Run GC every 5 seconds for demo
  })

  // Use monotonic clock for security (prevents clock manipulation attacks)
  const now = createMonotonicNow()
  const currentTime = now()
  const sessionId = 'session-1'

  // Create a session that will expire in 2 seconds
  const meta = {
    id: sessionId,
    createdAt: currentTime,
    updatedAt: currentTime,
    expiresAt: currentTime + 2000 // Expires in 2 seconds
  }

  console.log('\n📝 Creating session:', sessionId)
  console.log('   Expires at:', new Date(meta.expiresAt).toISOString())

  // Use ctx.saveMeta() to save meta (includes security validation)
  // This ensures meta.id is validated and sanitized
  await ctx.saveMeta(meta)

  // Write other files directly to Hyperdrive
  // Hyperdrive stores file metadata in a Hyperbee and content in a Hypercore
  await drive.put(`/sessions/${sessionId}/payload.txt`, Buffer.from('Hello ephemeral!'))
  await drive.put(`/sessions/${sessionId}/audio.m4a`, Buffer.from('fake audio data'))

  console.log('✅ Created files:')
  console.log('   - meta.json')
  console.log('   - payload.txt')
  console.log('   - audio.m4a')

  // Verify files were written using drive.get()
  const metaFile = await drive.get(`/sessions/${sessionId}/meta.json`)
  const payloadFile = await drive.get(`/sessions/${sessionId}/payload.txt`)
  const audioFile = await drive.get(`/sessions/${sessionId}/audio.m4a`)

  console.log('\n📁 Files verified:')
  console.log('   - meta.json:', metaFile ? `${metaFile.length} bytes` : 'missing')
  console.log('   - payload.txt:', payloadFile ? `${payloadFile.length} bytes` : 'missing')
  console.log('   - audio.m4a:', audioFile ? `${audioFile.length} bytes` : 'missing')

  // Start automatic GC
  console.log('\n🔄 Starting automatic GC (runs every 5 seconds)...')
  auto.start()

  // Wait for expiration and GC to run
  console.log('⏳ Waiting for expiration (2 seconds)...')
  await new Promise(resolve => setTimeout(resolve, 3000))

  // Run GC manually once to ensure cleanup
  console.log('\n🧹 Running GC manually...')
  const result = await runOnce()
  console.log(`   Expired ${result.expired} session(s)`)

  // Check if files were deleted using drive.exists()
  console.log('\n📁 Files after GC:')
  const metaExists = await drive.exists(`/sessions/${sessionId}/meta.json`)
  const payloadExists = await drive.exists(`/sessions/${sessionId}/payload.txt`)
  const audioExists = await drive.exists(`/sessions/${sessionId}/audio.m4a`)

  console.log('   - meta.json:', metaExists ? 'exists' : 'deleted ✅')
  console.log('   - payload.txt:', payloadExists ? 'exists' : 'deleted ✅')
  console.log('   - audio.m4a:', audioExists ? 'exists' : 'deleted ✅')

  // List files again to show they're gone
  console.log('\n📁 Remaining files in session directory:')
  const remainingFiles = []
  for await (const file of drive.list(`/sessions/${sessionId}`)) {
    const fileName = file.name || file.path?.split('/').pop() || 'unknown'
    remainingFiles.push(fileName)
  }
  if (remainingFiles.length === 0) {
    console.log('   (empty - all files deleted)')
  } else {
    remainingFiles.forEach(name => console.log(`   - ${name}`))
  }

  // Stop auto-GC
  auto.stop()
  console.log('\n🛑 Auto-GC stopped')

  // Cleanup - close drive and store
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

