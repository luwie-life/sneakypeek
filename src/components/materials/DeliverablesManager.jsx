import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Download, RefreshCw, FileText, Image as ImageIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { Card } from '../ui/Card'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import UpgradePrompt from '../billing/UpgradePrompt'
import { formatBytes } from '../../lib/sectionTypes'

const ACCESS = [
  { value: 'free', label: 'Free', hint: 'Anyone viewing the published preview can download it.' },
  { value: 'restricted', label: 'Paid', hint: 'Listed as "included with purchase". Never downloadable from Sneaky Peek.' },
  { value: 'private', label: 'Private', hint: 'Only you can see it.' },
]

/**
 * The files behind a product: covers, sample chapters, worksheets, the
 * full download. Access is enforced by the server — "Paid" files are never
 * served publicly; buyers get them from the creator's own checkout.
 */
export default function DeliverablesManager({ experienceId, onChange }) {
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ accepted: '', maxBytes: 0 })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [limitError, setLimitError] = useState(null)
  const [newAccess, setNewAccess] = useState('free')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileRef = useRef(null)
  const replaceRef = useRef(null)
  const replaceTarget = useRef(null)

  async function load() {
    try {
      const res = await api.listDeliverables(experienceId)
      setItems(res.deliverables)
      setMeta({ accepted: res.accepted, maxBytes: res.maxBytes })
      onChange?.(res.deliverables)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceId])

  function handleError(err) {
    if (err.limitReached) setLimitError(err)
    else setError(err.message)
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setLimitError(null)
    if (meta.maxBytes && file.size > meta.maxBytes) {
      setError(`That file is ${formatBytes(file.size)}. The maximum is ${formatBytes(meta.maxBytes)}.`)
      return
    }
    setUploading(true)
    try {
      await api.uploadDeliverable(experienceId, file, { access: newAccess, title: file.name.replace(/\.[^.]+$/, '') })
      await load()
    } catch (err) {
      handleError(err)
    } finally {
      setUploading(false)
    }
  }

  async function handleReplace(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const target = replaceTarget.current
    if (!file || !target) return
    setBusyId(target)
    setError('')
    try {
      await api.replaceDeliverableFile(experienceId, target, file)
      await load()
    } catch (err) {
      handleError(err)
    } finally {
      setBusyId(null)
    }
  }

  async function patch(id, body) {
    setBusyId(id)
    setError('')
    try {
      const { deliverable } = await api.updateDeliverable(experienceId, id, body)
      const next = items.map((d) => (d._id === id ? deliverable : d))
      setItems(next)
      onChange?.(next)
    } catch (err) {
      handleError(err)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id) {
    setBusyId(id)
    try {
      await api.deleteDeliverable(experienceId, id)
      await load()
    } catch (err) {
      handleError(err)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card hover={false} className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-sans font-medium text-ink">Files &amp; downloads</h2>
          <p className="text-xs text-muted mt-1 max-w-md">
            Cover images, free samples, and what buyers get. Free files can be used in the preview; paid files are only listed, never shared here.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-accent-dim my-3" role="alert">{error}</p>}
      {limitError && <div className="my-4"><UpgradePrompt error={limitError} /></div>}

      {loading ? (
        <p className="text-sm text-muted py-4" role="status">Loading files…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted py-4">No files yet.</p>
      ) : (
        <ul className="my-4 divide-y divide-line border-y border-line">
          {items.map((d) => {
            const Icon = d.mimeType?.startsWith('image/') ? ImageIcon : FileText
            const busy = busyId === d._id
            return (
              <li key={d._id} className={`py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${busy ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon size={16} className="text-muted shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <input
                      defaultValue={d.title}
                      aria-label="File title"
                      maxLength={150}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== d.title) patch(d._id, { title: v })
                        else e.target.value = d.title
                      }}
                      className="w-full bg-transparent text-sm text-ink outline-none border-b border-transparent focus:border-line"
                    />
                    <p className="text-xs text-muted truncate">
                      {d.fileName} · {formatBytes(d.sizeBytes)}
                      {d.access === 'free' && d.downloadCount > 0 ? ` · ${d.downloadCount} downloads` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="sr-only" htmlFor={`access-${d._id}`}>Access for {d.title}</label>
                  <select
                    id={`access-${d._id}`}
                    value={d.access}
                    disabled={busy}
                    onChange={(e) => patch(d._id, { access: e.target.value })}
                    title={ACCESS.find((a) => a.value === d.access)?.hint}
                    className="text-xs rounded-lg border border-line bg-paper px-2 py-1.5"
                  >
                    {ACCESS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => api.downloadDeliverable(experienceId, d._id, d.fileName).catch(handleError)} aria-label={`Download ${d.title}`} className="p-1.5 text-muted hover:text-ink disabled:opacity-40">
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      replaceTarget.current = d._id
                      replaceRef.current?.click()
                    }}
                    aria-label={`Replace file for ${d.title}`}
                    className="p-1.5 text-muted hover:text-ink disabled:opacity-40"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmDelete(d)} aria-label={`Delete ${d.title}`} className="p-1.5 text-muted hover:text-accent-dim disabled:opacity-40">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="new-access" className="text-xs text-muted">New file is</label>
        <select id="new-access" value={newAccess} onChange={(e) => setNewAccess(e.target.value)} className="text-xs rounded-lg border border-line bg-paper px-2 py-1.5">
          {ACCESS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" aria-hidden="true" tabIndex={-1} />
        <input ref={replaceRef} type="file" onChange={handleReplace} className="hidden" aria-hidden="true" tabIndex={-1} />
        <Button variant="outline" size="sm" icon={Upload} disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {ACCESS.find((a) => a.value === newAccess)?.hint} {meta.accepted ? `Accepted: ${meta.accepted}.` : ''} {meta.maxBytes ? `Max ${formatBytes(meta.maxBytes)}.` : ''}
      </p>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this file?"
        description={`"${confirmDelete?.title}" will be removed, along with any preview section that shows it.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const id = confirmDelete._id
          setConfirmDelete(null)
          remove(id)
        }}
      />
    </Card>
  )
}
