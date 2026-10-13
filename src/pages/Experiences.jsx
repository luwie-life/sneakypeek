import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, Pencil, Trash2, Plus, QrCode } from 'lucide-react'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import QRCodeModal from '../components/sharing/QRCodeModal'
import { useExperiences } from '../hooks/useExperiences'
import { api } from '../lib/api'

export default function Experiences() {
  const { experiences, loading, error, reload } = useExperiences()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [qrExperience, setQrExperience] = useState(null)
  const navigate = useNavigate()

  async function togglePublish(exp) {
    setBusyId(exp._id)
    setActionError('')
    try {
      if (exp.status === 'published') {
        await api.unpublishExperience(exp._id)
      } else {
        await api.publishExperience(exp._id)
      }
      await reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRemove() {
    const exp = pendingDelete
    setPendingDelete(null)
    setBusyId(exp._id)
    try {
      await api.deleteExperience(exp._id)
      await reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-muted">Loading your experiences…</p>
  if (error) return <p className="text-accent-dim">{error}</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted text-sm">
          {experiences.length} experience{experiences.length === 1 ? '' : 's'}
        </p>
        <Button variant="accent" size="sm" icon={Plus} onClick={() => navigate('/dashboard/experiences/new')}>
          New experience
        </Button>
      </div>

      {actionError && <p className="text-sm text-accent-dim mb-4">{actionError}</p>}

      {experiences.length === 0 ? (
        <Card hover={false} className="text-center py-14">
          <p className="font-serif text-2xl text-ink mb-2">Nothing here yet</p>
          <p className="text-muted text-sm mb-6">Create your first Sneaky Peek to get started.</p>
          <Button variant="accent" onClick={() => navigate('/dashboard/experiences/new')}>
            Create Sneaky Peek
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.map((exp) => (
            <Card key={exp._id} hover={false} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-1">
                  <h3 className="font-sans font-medium text-ink truncate">{exp.title}</h3>
                  <StatusBadge status={exp.status} />
                </div>
                <p className="text-xs text-muted capitalize">{exp.productType} · /{exp.slug}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {exp.status === 'published' && (
                  <>
                    <a href={`/p/${exp.slug}`} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" icon={ExternalLink}>
                        View
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={QrCode}
                      aria-label="Show QR code"
                      onClick={() => setQrExperience(exp)}
                    />
                  </>
                )}
                <Link to={`/dashboard/experiences/${exp._id}`}>
                  <Button variant="outline" size="sm" icon={Pencil}>
                    Edit
                  </Button>
                </Link>
                <Button
                  variant={exp.status === 'published' ? 'outline' : 'accent'}
                  size="sm"
                  disabled={busyId === exp._id}
                  onClick={() => togglePublish(exp)}
                >
                  {exp.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  disabled={busyId === exp._id}
                  onClick={() => setPendingDelete(exp)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete "${pendingDelete?.title}"?`}
        description="This can't be undone — the experience and its public link will be removed."
        confirmLabel="Delete"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />

      <QRCodeModal
        open={!!qrExperience}
        url={qrExperience ? `${window.location.origin}/p/${qrExperience.slug}` : ''}
        filename={qrExperience ? `sneaky-peek-${qrExperience.slug}` : 'sneaky-peek-qr'}
        onClose={() => setQrExperience(null)}
      />
    </div>
  )
}
