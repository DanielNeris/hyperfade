import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

export async function createTestDrive() {
  const dir = mkdtempSync(join(tmpdir(), 'hyperfade-'))
  const store = new Corestore(dir)
  const drive = new Hyperdrive(store)
  await drive.ready()

  async function cleanup() {
    await drive.close()
    await store.close()
    rmSync(dir, { recursive: true, force: true })
  }

  return { dir, store, drive, cleanup }
}
