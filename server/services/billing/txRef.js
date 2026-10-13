import { customAlphabet } from 'nanoid'

const nonce = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

/**
 * Flutterwave has no server-side concept of "this checkout was for plan X" —
 * it only round-trips whatever tx_ref we hand it. We encode the user and
 * plan into the ref itself so verification can recover intent without a
 * separate "pending checkout" table.
 */
export function generateTxRef(userId, planSlug) {
  return `sp_${userId}_${planSlug}_${nonce()}`
}

export function parseTxRef(txRef) {
  if (typeof txRef !== 'string') return null
  const match = txRef.match(/^sp_([a-f0-9]{24})_([a-z0-9-]+)_[a-z0-9]{8}$/)
  if (!match) return null
  return { userId: match[1], planSlug: match[2] }
}
