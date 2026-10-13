let pass = 0, fail = 0
function check(name, cond) { if (cond) { pass++; console.log(`PASS  ${name}`) } else { fail++; console.log(`FAIL  ${name}`) } }

const { extractText } = await import('./services/materials/extract.js')
const { getStorageProvider } = await import('./services/materials/storage.js')
const fs = await import('fs/promises')

// --- Plain text extraction ---
const text = await extractText({ type: 'pasted', content: '  Some pasted content with   extra   spacing  \x00\x01' })
check('pasted text extracted and control chars stripped', text.includes('Some pasted content') && !text.includes('\x00'))

// --- Real PDF extraction (the same PDF built and verified earlier) ---
const storage = getStorageProvider()
const pdfBuffer = await fs.readFile('/tmp/test.pdf')
const key = await storage.save(pdfBuffer)
const pdfText = await extractText({ type: 'pdf', source: key })
check('real PDF text extracted correctly', pdfText.includes('Hello Sneaky Peek test PDF'))
await storage.delete(key)

// --- Storage key safety: rejects a path-traversal-shaped key ---
let threw = false
try { await storage.read('../../etc/passwd') } catch { threw = true }
check('storage rejects a non-conforming (path-traversal-shaped) key', threw)

// --- Not-yet-supported types fail clearly rather than pretending to work ---
for (const type of ['image', 'audio', 'video']) {
  threw = false
  try { await extractText({ type }) } catch (e) { threw = e.message.includes('not supported yet') }
  check(`${type} extraction fails clearly as not-yet-supported`, threw)
}

// --- Unknown type throws ---
threw = false
try { await extractText({ type: 'made_up_type' }) } catch { threw = true }
check('unknown material type in extractText throws', threw)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
