import AdminAuditLog from '../../models/AdminAuditLog.js'

/**
 * Records an admin mutation. Deliberately never throws — an audit-logging
 * failure must never roll back or block the privileged action itself.
 * `metadata` must never contain secrets, tokens, password hashes, or raw
 * payment credentials; callers are responsible for keeping it small and
 * safe (a before/after diff of the fields that actually changed, not a
 * whole document dump).
 */
export async function recordAudit({ adminId, action, targetType, targetId, metadata }) {
  try {
    await AdminAuditLog.create({
      admin: adminId,
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      metadata: metadata || {},
    })
  } catch (err) {
    console.error('Failed to write admin audit log:', err.message)
  }
}
