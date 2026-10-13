import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import RevealMark from '../../components/RevealMark'
import ConfirmDialog from '../../components/admin/ConfirmDialog'

const REASONS = [
  { value: 'ugc', label: 'UGC' },
  { value: 'creator_partner', label: 'Creator Partner' },
  { value: 'beta', label: 'Beta' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'support', label: 'Support' },
]
const DURATIONS = [7, 30, 60, 90]
const GRANTABLE_PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'creator', label: 'Creator' },
  { value: 'pro', label: 'Pro' },
  { value: 'business', label: 'Business' },
]

export default function AdminUserDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // { type: 'role'|'disable'|'revoke', value }
  const [grantForm, setGrantForm] = useState({ planSlug: 'creator', durationDays: 30, reason: 'ugc', note: '' })
  const [granting, setGranting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setData(await adminApi.getUser(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function applyConfirm() {
    if (!confirm) return
    try {
      if (confirm.type === 'role') await adminApi.updateUserRole(id, confirm.value)
      if (confirm.type === 'disable') await adminApi.setUserDisabled(id, confirm.value)
      if (confirm.type === 'revoke') await adminApi.revokeAccess(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirm(null)
    }
  }

  async function handleGrant(e) {
    e.preventDefault()
    setGranting(true)
    setError('')
    try {
      await adminApi.grantAccess(id, grantForm)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setGranting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><RevealMark size={28} animated animationState="thinking" /></div>
  }
  if (error && !data) return <p className="text-accent-dim">{error}</p>
  if (!data) return null

  const { user, activity, billing } = data
  const isAdmin = user.role === 'admin'

  return (
    <div className="max-w-2xl">
      <Link to="/admin/users" className="text-sm text-muted hover:text-ink flex items-center gap-1.5 mb-5">
        <ArrowLeft size={14} /> All users
      </Link>

      {error && <p className="text-sm text-accent-dim mb-4">{error}</p>}

      <Card hover={false} className="mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-serif text-2xl text-ink">{user.name}</h2>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
          {user.disabled && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-pill bg-accent-soft text-accent-dim">Disabled</span>
          )}
        </div>
        <p className="text-xs text-muted mb-1">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
        {user.lastActiveAt && (
          <p className="text-xs text-muted">Last active {new Date(user.lastActiveAt).toLocaleDateString()}</p>
        )}

        <div className="flex gap-2 mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ type: 'role', value: isAdmin ? 'user' : 'admin' })}
          >
            {isAdmin ? 'Remove admin role' : 'Make admin'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ type: 'disable', value: !user.disabled })}
          >
            {user.disabled ? 'Enable account' : 'Disable account'}
          </Button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <Card hover={false}>
          <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Product activity</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Experiences</dt><dd className="text-ink">{activity.experiences}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Published</dt><dd className="text-ink">{activity.publishedExperiences}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Materials</dt><dd className="text-ink">{activity.materials}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">AI generations</dt><dd className="text-ink">{activity.aiGenerations}</dd></div>
          </dl>
        </Card>

        <Card hover={false}>
          <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Billing</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Plan</dt><dd className="text-ink">{billing.plan.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Status</dt><dd className="text-ink capitalize">{billing.status}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Provider</dt><dd className="text-ink capitalize">{billing.provider}</dd></div>
            {billing.trialEnd && (
              <div className="flex justify-between"><dt className="text-muted">Trial ends</dt><dd className="text-ink">{new Date(billing.trialEnd).toLocaleDateString()}</dd></div>
            )}
            {billing.currentPeriodEnd && (
              <div className="flex justify-between"><dt className="text-muted">{billing.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}</dt><dd className="text-ink">{new Date(billing.currentPeriodEnd).toLocaleDateString()}</dd></div>
            )}
          </dl>
        </Card>
      </div>

      <Card hover={false}>
        <h3 className="text-xs uppercase tracking-wide text-muted font-medium mb-3">Complimentary access</h3>

        {billing.isComplimentary ? (
          <div>
            <p className="text-sm text-ink mb-1">
              <span className="font-medium capitalize">{billing.grantReason.replace('_', ' ')}</span> access to {billing.plan.name}
            </p>
            <p className="text-xs text-muted mb-1">Expires {new Date(billing.grantExpiresAt).toLocaleDateString()}</p>
            {billing.grantNote && <p className="text-xs text-muted mb-3 italic">"{billing.grantNote}"</p>}
            <Button
              variant="outline"
              size="sm"
              className="!border-accent-dim !text-accent-dim mt-2"
              onClick={() => setConfirm({ type: 'revoke' })}
            >
              Revoke access
            </Button>
          </div>
        ) : (
          <form onSubmit={handleGrant} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Plan</span>
                <select
                  value={grantForm.planSlug}
                  onChange={(e) => setGrantForm({ ...grantForm, planSlug: e.target.value })}
                  className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent"
                >
                  {GRANTABLE_PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Duration</span>
                <select
                  value={grantForm.durationDays}
                  onChange={(e) => setGrantForm({ ...grantForm, durationDays: Number(e.target.value) })}
                  className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent"
                >
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Reason</span>
              <select
                value={grantForm.reason}
                onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent"
              >
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Internal note (optional)</span>
              <input
                value={grantForm.note}
                onChange={(e) => setGrantForm({ ...grantForm, note: e.target.value })}
                className="text-sm rounded-lg border border-line bg-paper px-2.5 py-1.5 outline-none focus:border-accent"
              />
            </label>
            <Button type="submit" variant="accent" size="sm" disabled={granting} className="mt-1 self-start">
              {granting ? 'Granting…' : 'Grant access'}
            </Button>
          </form>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.type === 'role'
            ? (confirm.value === 'admin' ? 'Grant admin access?' : 'Remove admin access?')
            : confirm?.type === 'disable'
            ? (confirm.value ? 'Disable this account?' : 'Re-enable this account?')
            : 'Revoke complimentary access?'
        }
        description={
          confirm?.type === 'role'
            ? `${user.name} will ${confirm.value === 'admin' ? 'gain' : 'lose'} full access to the Control Center.`
            : confirm?.type === 'disable'
            ? (confirm.value ? `${user.name} will be immediately signed out and unable to log back in.` : `${user.name} will be able to log in again.`)
            : `${user.name} immediately drops to the Free plan, including Free's AI limits.`
        }
        confirmLabel="Confirm"
        danger={(confirm?.type === 'disable' && confirm?.value) || confirm?.type === 'revoke'}
        onConfirm={applyConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
