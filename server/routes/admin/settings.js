import { Router } from 'express'
import { getSettings, updateSettings } from '../../services/admin/settings.js'
import { recordAudit } from '../../services/admin/audit.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const settings = await getSettings()
    res.json({ settings })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings', detail: err.message })
  }
})

router.patch('/', async (req, res) => {
  try {
    const before = (await getSettings()).toObject()
    const settings = await updateSettings(req.body)

    const changed = {}
    for (const key of Object.keys(req.body)) {
      changed[key] = { from: before[key], to: settings[key] }
    }

    await recordAudit({
      adminId: req.adminId,
      action: 'setting_changed',
      targetType: 'PlatformSettings',
      targetId: settings._id,
      metadata: changed,
    })

    res.json({ settings })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
