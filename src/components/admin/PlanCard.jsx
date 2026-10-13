import { useState } from 'react'
import { Check } from 'lucide-react'
import { Card } from '../ui/Card'
import Button from '../ui/Button'
import { Input, Textarea } from '../ui/Input'
import { adminApi } from '../../lib/api'
import ConfirmDialog from './ConfirmDialog'

const LIMIT_LABELS = {
  maxExperiences: 'Max experiences',
  aiGenerationsPerMonth: 'AI generations/mo',
  analyticsRetentionDays: 'Analytics retention (days)',
  maxTeamMembers: 'Max team members',
  storageMB: 'Storage (MB)',
}

function LimitInput({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label} <span className="text-muted/70">(-1 = unlimited)</span></span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent"
      />
    </label>
  )
}

export default function PlanCard({ plan, onSaved }) {
  const [form, setForm] = useState({
    name: plan.name,
    description: plan.description || '',
    priceDollars: (plan.monthlyPriceCents / 100).toString(),
    active: plan.active,
    limits: { ...plan.limits },
    features: { ...plan.features },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  function updateLimit(key, value) {
    setForm((f) => ({ ...f, limits: { ...f.limits, [key]: value } }))
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const priceCents = Math.round(parseFloat(form.priceDollars) * 100)
      if (isNaN(priceCents) || priceCents < 0) throw new Error('Price must be a non-negative number')

      const { plan: updated } = await adminApi.updatePlan(plan._id, {
        name: form.name,
        description: form.description,
        monthlyPriceCents: priceCents,
        active: form.active,
        limits: form.limits,
        features: form.features,
      })
      onSaved(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleActiveToggle() {
    if (form.active) {
      // Turning OFF — check for subscribers before letting it through quietly
      try {
        const { activeSubscribers } = await adminApi.getPlanSubscriberCount(plan._id)
        if (activeSubscribers > 0) {
          setConfirmDeactivate(true)
          return
        }
      } catch {
        // If the check itself fails, fall through to the normal toggle —
        // don't block the admin on a transient error.
      }
    }
    setForm((f) => ({ ...f, active: !f.active }))
  }

  return (
    <Card hover={false} className={!form.active ? 'opacity-60' : ''}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <span className="text-xs text-muted ml-3 mt-2.5 shrink-0">/{plan.slug}</span>
      </div>

      <Textarea
        rows={2}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="mb-3"
      />

      <label className="flex flex-col gap-1 mb-4">
        <span className="text-xs text-muted">Monthly price (USD)</span>
        <input
          type="number"
          step="0.01"
          value={form.priceDollars}
          onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
          className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent w-32"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {Object.keys(LIMIT_LABELS).map((key) => (
          <LimitInput key={key} label={LIMIT_LABELS[key]} value={form.limits[key]} onChange={(v) => updateLimit(key, v)} />
        ))}
      </div>

      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.features.aiStudio}
            onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, aiStudio: e.target.checked } }))}
          />
          AI Studio
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.features.analytics}
            onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, analytics: e.target.checked } }))}
          />
          Analytics
        </label>
      </div>

      {error && <p className="text-xs text-accent-dim mb-3">{error}</p>}

      <div className="flex items-center gap-3">
        <Button variant="accent" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <button
          onClick={handleActiveToggle}
          className="text-xs text-muted hover:text-ink underline"
        >
          {form.active ? 'Deactivate plan' : 'Activate plan'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-accent-dim">
            <Check size={13} /> Saved
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate a plan with active subscribers?"
        description="People are currently on this plan. Deactivating hides it from new signups but does not change existing subscribers — they'll keep their current entitlements until they change plans."
        confirmLabel="Deactivate anyway"
        danger
        onConfirm={() => { setForm((f) => ({ ...f, active: false })); setConfirmDeactivate(false) }}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </Card>
  )
}
