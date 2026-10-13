import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/admin.js'

import overviewRoutes from './overview.js'
import usersRoutes from './users.js'
import experiencesRoutes from './experiences.js'
import subscriptionsRoutes from './subscriptions.js'
import paymentsRoutes from './payments.js'
import plansRoutes from './plans.js'
import aiUsageRoutes from './aiUsage.js'
import materialsRoutes from './materials.js'
import settingsRoutes from './settings.js'
import auditRoutes from './audit.js'

const router = Router()

// Every admin route, without exception, requires a valid session AND the
// admin role. This is the one place that guarantee is enforced — no admin
// sub-router below should ever be reachable any other way.
router.use(requireAuth)
router.use(requireAdmin)

router.use('/overview', overviewRoutes)
router.use('/users', usersRoutes)
router.use('/experiences', experiencesRoutes)
router.use('/subscriptions', subscriptionsRoutes)
router.use('/payments', paymentsRoutes)
router.use('/plans', plansRoutes)
router.use('/ai-usage', aiUsageRoutes)
router.use('/materials', materialsRoutes)
router.use('/settings', settingsRoutes)
router.use('/audit-log', auditRoutes)

export default router
