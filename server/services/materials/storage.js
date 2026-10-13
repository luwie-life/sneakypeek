import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { customAlphabet } from 'nanoid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads')

const key = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24)

/**
 * StorageProvider — the contract any file-storage backend must satisfy.
 * The local filesystem implementation below is a development stand-in;
 * swapping to S3/R2/etc. later means writing one new class here, nothing
 * else in the app should need to change.
 */
class LocalStorageProvider {
  async save(buffer) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    // The key is a fresh random ID — never derived from the uploaded
    // filename, so nothing user-supplied ever becomes part of a filesystem
    // path.
    const fileKey = key()
    await fs.writeFile(path.join(UPLOAD_DIR, fileKey), buffer)
    return fileKey
  }

  async read(fileKey) {
    this._assertSafeKey(fileKey)
    return fs.readFile(path.join(UPLOAD_DIR, fileKey))
  }

  async delete(fileKey) {
    this._assertSafeKey(fileKey)
    await fs.unlink(path.join(UPLOAD_DIR, fileKey)).catch(() => {})
  }

  // Defense in depth: even though save() always generates the key itself,
  // never trust a key handed back to read()/delete() to be path-safe.
  _assertSafeKey(fileKey) {
    if (typeof fileKey !== 'string' || !/^[a-z0-9]{24}$/.test(fileKey)) {
      throw new Error('Invalid storage key')
    }
  }
}

let cached = null
export function getStorageProvider() {
  if (!cached) cached = new LocalStorageProvider()
  return cached
}
