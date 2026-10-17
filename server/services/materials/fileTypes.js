/**
 * Server-side file type detection for uploads. The client-sent mimetype
 * and file extension are both attacker-controlled, so the decision is made
 * from the file's leading bytes ("magic numbers"). Only types we can serve
 * safely as downloads are accepted; HTML/SVG/JS and other active content are
 * never accepted (they would execute if a browser rendered them inline).
 */

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b)

function looksLikeText(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  for (const byte of sample) {
    // Allow tab/newline/carriage return and printable/UTF-8 bytes; reject NUL and other control chars.
    if (byte === 0) return false
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false
  }
  return true
}

function looksLikeMarkup(buf) {
  const head = buf.subarray(0, 1024).toString('utf8').toLowerCase()
  return /<\s*(html|script|svg|iframe|object|embed|!doctype)/.test(head)
}

/** Office Open XML (docx/xlsx/pptx) and plain zip share the PK header — tell them apart by content. */
function zipFlavor(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1')
  if (head.includes('word/')) return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  if (head.includes('xl/')) return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  if (head.includes('ppt/')) return { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
  if (head.includes('mimetypeapplication/epub+zip')) return { ext: 'epub', mime: 'application/epub+zip' }
  return { ext: 'zip', mime: 'application/zip' }
}

/**
 * Returns { ext, mime, category } for an accepted file, or null if the file
 * type is not allowed. `originalName` is only used to distinguish text
 * flavours (csv/md/txt), never to decide whether binary content is safe.
 */
export function detectFileType(buffer, originalName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null
  const b = buffer
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: 'pdf', mime: 'application/pdf', category: 'document' }
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', mime: 'image/png', category: 'image' }
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg', category: 'image' }
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return { ext: 'gif', mime: 'image/gif', category: 'image' }
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: 'webp', mime: 'image/webp', category: 'image' }
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return { ...zipFlavor(b), category: 'archive' }
  if (startsWith(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg', category: 'audio' }
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = b.subarray(8, 12).toString('latin1')
    if (/^M4A/.test(brand)) return { ext: 'm4a', mime: 'audio/mp4', category: 'audio' }
    return { ext: 'mp4', mime: 'video/mp4', category: 'video' }
  }
  if (looksLikeText(b) && !looksLikeMarkup(b)) {
    const lower = originalName.toLowerCase()
    if (lower.endsWith('.csv')) return { ext: 'csv', mime: 'text/csv', category: 'document' }
    if (lower.endsWith('.md')) return { ext: 'md', mime: 'text/markdown', category: 'document' }
    return { ext: 'txt', mime: 'text/plain', category: 'document' }
  }
  return null
}

export const ACCEPTED_DELIVERABLE_LABEL = 'PDF, PNG, JPG, WEBP, GIF, DOCX, XLSX, PPTX, EPUB, ZIP, MP3, M4A, MP4, TXT, CSV or MD'

/** Strips path separators/control chars; keeps a readable display name only. */
export function safeDisplayFileName(name, ext) {
  const base = String(name || '')
    .replace(/[\\/\x00-\x1f\x7f"]/g, '')
    .trim()
    .slice(0, 150)
  if (!base) return `download.${ext}`
  return base.toLowerCase().endsWith(`.${ext}`) || (ext === 'jpg' && /\.jpe?g$/i.test(base)) ? base : `${base}.${ext}`
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 name. */
export function contentDisposition(fileName, { inline = false } = {}) {
  const name = String(fileName || 'download')
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
