import PlatformSettings from '../../models/PlatformSettings.js'

const KNOWN_KEYS = [
  'platformName',
  'maintenanceMode',
  'signupsEnabled',
  'aiGenerationEnabled',
  'productUnderstandingEnabled',
  'publicExperiencesEnabled',
]

let cachedId = null

/** Always the same single document — created with defaults on first read. */
export async function getSettings() {
  if (cachedId) {
    const existing = await PlatformSettings.findById(cachedId)
    if (existing) return existing
  }

  let settings = await PlatformSettings.findOne()
  if (!settings) settings = await PlatformSettings.create({})
  cachedId = settings._id
  return settings
}

export function validateSettingsPatch(patch) {
  const unknown = Object.keys(patch).filter((k) => !KNOWN_KEYS.includes(k))
  if (unknown.length > 0) {
    throw new Error(`Unknown setting(s): ${unknown.join(', ')}`)
  }
  if ('platformName' in patch && (typeof patch.platformName !== 'string' || !patch.platformName.trim())) {
    throw new Error('platformName must be a non-empty string')
  }
  for (const key of KNOWN_KEYS) {
    if (key === 'platformName') continue
    if (key in patch && typeof patch[key] !== 'boolean') {
      throw new Error(`${key} must be a boolean`)
    }
  }
}

export async function updateSettings(patch) {
  validateSettingsPatch(patch)
  const settings = await getSettings()
  Object.assign(settings, patch)
  await settings.save()
  return settings
}

export { KNOWN_KEYS as SETTINGS_KEYS }
