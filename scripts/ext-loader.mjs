/* Resolve the bundler-style extensionless relative imports in lib/*.js
   ("./api" -> "./api.js") so the modules can be loaded directly in Node. */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?jsx?$/.test(specifier)) {
      return next(specifier + ".js", context);
    }
    throw err;
  }
}
