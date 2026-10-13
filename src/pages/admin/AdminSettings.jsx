import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import RevealMark from '../../components/RevealMark'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { adminApi } from '../../lib/api'
import { generateQRDataUrl, downloadDataUrl } from '../../lib/qrcode'
import { Download } from 'lucide-react'

const TOGGLES = [
  { key: 'maintenanceMode', label: 'Maintenance mode', description: 'Blocks new signups and public experience pages.', disruptiveWhen: true },
  { key: 'signupsEnabled', label: 'Signups enabled', description: 'New accounts can be created. Existing users can still log in when off.' },
  { key: 'aiGenerationEnabled', label: 'AI generation enabled', description: 'AI Studio generation and section actions. Existing experiences remain accessible when off.' },
  { key: 'productUnderstandingEnabled', label: 'Product understanding enabled', description: 'AI product analysis. Material upload/ingestion stays available when off.' },
  {
    key: 'publicExperiencesEnabled',
    label: 'Public experiences enabled',
    description: 'Published experiences are reachable at their public link.',
    disruptiveWhen: false,
    disruptiveWarning: 'Published experiences will immediately stop being publicly accessible — visitors will see an unavailable message.',
  },
]

// Configurable so it points at the real production domain once one exists,
// without breaking local development in the meantime.
const MARKETING_URL = import.meta.env.VITE_MARKETING_URL || window.location.origin

function MarketingQR() {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    generateQRDataUrl(MARKETING_URL).then(setDataUrl).catch(() => {})
  }, [])

  return (
    <Card hover={false} className="mb-5">
      <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-1">Marketing QR</h3>
      <p className="text-xs text-muted mb-4">For flyers, posters, business cards, and events.</p>
      <div className="flex items-center gap-4">
        {dataUrl ? (
          <img src={dataUrl} alt="Sneaky Peek marketing QR code" className="w-24 h-24 rounded-lg border border-line" />
        ) : (
          <div className="w-24 h-24 rounded-lg border border-line bg-surface animate-pulse" />
        )}
        <div>
          <p className="text-xs text-muted mb-2 font-mono">{MARKETING_URL}</p>
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            disabled={!dataUrl}
            onClick={() => downloadDataUrl(dataUrl, 'sneaky-peek-marketing-qr.png')}
          >
            Download QR
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)
  const [pendingToggle, setPendingToggle] = useState(null)
  const [nameInput, setNameInput] = useState('')

  async function load() {
    setLoading(true)
    try {
      const { settings } = await adminApi.getSettings()
      setSettings(settings)
      setNameInput(settings.platformName)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function applyToggle(key, value) {
    setSaving(key)
    setError('')
    try {
      const { settings: updated } = await adminApi.updateSettings({ [key]: value })
      setSettings(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
      setPendingToggle(null)
    }
  }

  function handleToggle(toggle) {
    const nextValue = !settings[toggle.key]
    if (toggle.disruptiveWhen === nextValue) {
      setPendingToggle({ ...toggle, nextValue })
    } else {
      applyToggle(toggle.key, nextValue)
    }
  }

  async function savePlatformName() {
    setSaving('platformName')
    try {
      const { settings: updated } = await adminApi.updateSettings({ platformName: nameInput })
      setSettings(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><RevealMark size={28} animated animationState="thinking" /></div>
  if (error && !settings) return <p className="text-accent-dim">{error}</p>
  if (!settings) return null

  return (
    <div className="max-w-xl">
      {error && <p className="text-sm text-accent-dim mb-4">{error}</p>}

      <Card hover={false} className="mb-5">
        <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Platform name</h3>
        <div className="flex gap-2">
          <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="flex-1" />
          <Button variant="outline" size="sm" onClick={savePlatformName} disabled={saving === 'platformName'}>
            Save
          </Button>
        </div>
      </Card>

      <MarketingQR />

      <Card hover={false}>
        <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-4">Operational toggles</h3>
        <div className="flex flex-col gap-4">
          {TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink font-medium">{toggle.label}</p>
                <p className="text-xs text-muted mt-0.5">{toggle.description}</p>
              </div>
              <button
                onClick={() => handleToggle(toggle)}
                disabled={saving === toggle.key}
                className={`shrink-0 w-11 h-6 rounded-pill transition-colors relative ${settings[toggle.key] ? 'bg-accent' : 'bg-line'}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-soft ${settings[toggle.key] ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={!!pendingToggle}
        title={`Turn ${pendingToggle?.nextValue ? 'on' : 'off'} "${pendingToggle?.label}"?`}
        description={pendingToggle?.disruptiveWarning || 'This changes behavior across the whole platform immediately.'}
        confirmLabel={pendingToggle?.nextValue ? 'Turn on' : 'Turn off'}
        danger
        onConfirm={() => applyToggle(pendingToggle.key, pendingToggle.nextValue)}
        onCancel={() => setPendingToggle(null)}
      />
    </div>
  )
}
