import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useExperiences() {
  const [experiences, setExperiences] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { experiences } = await api.listExperiences()
      setExperiences(experiences)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { experiences, loading, error, reload }
}
