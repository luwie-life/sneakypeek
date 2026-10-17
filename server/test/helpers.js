import os from 'os'
import path from 'path'
import fs from 'fs'

/**
 * Shared integration-test harness: an in-memory MongoDB replica set, the
 * real Express app on an ephemeral port, the deterministic mock AI provider
 * and the in-memory mock billing provider. No network, no credentials.
 */
export async function startTestServer(envOverrides = {}) {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-storage-'))
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    BILLING_PROVIDER: 'mock',
    AI_PROVIDER: 'mock',
    STORAGE_DIR: storageDir,
    DISABLE_RATE_LIMIT: 'true',
    APP_URL: 'http://localhost:5173',
    ...envOverrides,
  })

  const { MongoMemoryReplSet } = await import('mongodb-memory-server')
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const mongoose = (await import('mongoose')).default
  await mongoose.connect(mongod.getUri())

  const { ensurePlansSeeded } = await import('../services/billing/seedPlans.js')
  await ensurePlansSeeded()
  // Make sure unique indexes exist before concurrency tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))

  const { createApp } = await import('../app.js')
  const app = createApp()
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}`

  async function api(method, url, { token, body, form, headers = {} } = {}) {
    const h = { ...headers }
    if (token) h.Authorization = `Bearer ${token}`
    let payload
    if (form) payload = form
    else if (body !== undefined) {
      h['Content-Type'] = 'application/json'
      payload = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const res = await fetch(base + url, { method, headers: h, body: payload })
    const type = res.headers.get('content-type') || ''
    const data = type.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer())
    return { status: res.status, data, headers: res.headers }
  }

  let userCounter = 0
  async function signup(overrides = {}) {
    userCounter += 1
    const body = { name: `Creator ${userCounter}`, email: `creator${userCounter}-${Date.now()}@example.com`, password: 'password123', ...overrides }
    const res = await api('POST', '/api/auth/signup', { body })
    if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.data)}`)
    return { token: res.data.token, user: res.data.user, email: body.email }
  }

  async function stop() {
    await new Promise((r) => server.close(r))
    await mongoose.disconnect()
    await mongod.stop()
    fs.rmSync(storageDir, { recursive: true, force: true })
  }

  return { api, signup, stop, base, mongoose }
}

/** A tiny but valid single-page PDF containing `text` (pdf.js can parse it). */
export function makePdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** 1x1 transparent PNG. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

export function fileForm(buffer, filename, fields = {}, type = 'application/octet-stream') {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type }), filename)
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

export const MANUSCRIPT = `Chapter One

The lighthouse keeper had not spoken to anyone in eleven days when the letter arrived. It was addressed in a hand he recognized, though he had spent twenty years trying to forget it.

He set the envelope on the table beside the lamp and did not open it. Outside, the sea kept its own counsel, grey and patient, folding itself against the rocks below.

By morning he had read it four times. By evening he had packed a bag. The letter asked only one thing of him, and it was the one thing he had sworn he would never do again.

Chapter Two

The ferry left at dawn.`
