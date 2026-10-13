const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

/** Parses page/limit query params into safe, bounded values + a Mongo skip. */
export function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  return { page, limit, skip: (page - 1) * limit }
}

export function paginatedResponse(items, total, { page, limit }) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  }
}

/** Never send more than a safe, display-appropriate slice of a User document. */
export function serializeUserSummary(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    disabled: user.disabled,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
  }
}
