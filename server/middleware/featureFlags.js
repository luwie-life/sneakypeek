import { getSettings } from '../services/admin/settings.js'

/**
 * Blocks a route when the named PlatformSettings boolean is false. This is
 * the server-side enforcement point — any equivalent flag shown in the
 * frontend is a UI convenience only, never a security boundary on its own.
 */
export function requireSetting(settingKey, message) {
  return async (req, res, next) => {
    try {
      const settings = await getSettings()
      if (!settings[settingKey]) {
        return res.status(503).json({ error: message || 'This feature is temporarily unavailable' })
      }
      next()
    } catch (err) {
      // A settings-lookup failure should never be the reason a feature
      // silently breaks — fail open rather than closed here.
      next()
    }
  }
}
