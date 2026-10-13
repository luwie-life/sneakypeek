import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api'
import RevealMark from '../../components/RevealMark'
import PlanCard from '../../components/admin/PlanCard'

export default function AdminPlans() {
  const [plans, setPlans] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.listPlans()
      .then(({ plans }) => setPlans(plans))
      .catch((err) => setError(err.message))
  }, [])

  function handleSaved(updated) {
    setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)))
  }

  if (error) return <p className="text-accent-dim">{error}</p>
  if (!plans) return <div className="flex justify-center py-16"><RevealMark size={28} animated animationState="thinking" /></div>

  return (
    <div>
      <p className="text-sm text-muted mb-6 -mt-2">
        These are the exact plans creators see on the billing page — changes here take effect immediately, everywhere.
      </p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans.map((plan) => (
          <PlanCard key={plan._id} plan={plan} onSaved={handleSaved} />
        ))}
      </div>
    </div>
  )
}
