import Layer from 'express/lib/router/layer.js'

/**
 * Express 4 does not forward rejected promises from async route handlers to
 * the error middleware — an `await` that throws outside a try/catch leaves
 * the request hanging until the client times out (e.g. GET
 * /api/experiences/not-an-object-id used to hang on a Mongoose CastError).
 * This patches the one place every handler is invoked so any rejected
 * promise is passed to next(err), reaching the central error handler in
 * app.js. Same technique as the express-async-errors package, without the
 * extra dependency. Error-handling middleware (arity 4) is left untouched.
 */
const original = Layer.prototype.handle_request
if (!original.__spPatched) {
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle
    if (fn.length > 3) return next()
    try {
      const result = fn(req, res, next)
      if (result && typeof result.catch === 'function') result.catch(next)
    } catch (err) {
      next(err)
    }
  }
  Layer.prototype.handle_request.__spPatched = true
}
