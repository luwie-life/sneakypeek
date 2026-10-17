import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useExperiences({ includeArchived = false } = {}) {
  const [experiences, setExperiences] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { experiences } = includeArchived ? await api.listExperiencesIncludingArchived() : await api.listExperiences()
      setExperiences(experiences)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [includeArchived])

  useEffect(() => {
    reload()
  }, [reload])

  return { experiences, loading, error, reload }
}
