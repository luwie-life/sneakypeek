/**
 * Minimal experimentation foundation: deterministic, transparent, and easy
 * to disable (delete the entry below, or stop calling getVariant for it —
 * nothing else depends on this file). Not an optimization engine — nothing
 * here learns or adjusts itself. A user always gets the same variant for
 * a given experiment (stable hash of userId + experiment key), so results
 * are comparable and a user's experience doesn't flicker between visits.
 *
 * To run a new experiment: add a key below with its variant list, call
 * getVariant(key, userId) where it's needed, and record which variant was
 * shown in the relevant event's metadata so it shows up in admin/analytics.
 * To stop one: remove the call site (or the config entry) — nothing to migrate.
 */
export const EXPERIMENTS = {
  upgradePromptCopy: ['control', 'specific'],
}

/** FNV-1a — small, fast, stable across sessions and browsers. */
function stableHash(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function getVariant(experimentKey, userId) {
  const variants = EXPERIMENTS[experimentKey]
  if (!variants || !userId) return variants?.[0] || 'control'
  const index = stableHash(`${experimentKey}:${userId}`) % variants.length
  return variants[index]
}
