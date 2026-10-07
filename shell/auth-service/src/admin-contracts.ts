/**
 * Browser-safe auth administration vocabulary.
 *
 * The definitions live in `@brains/plugins` so a package can name them
 * without depending on this service; re-exported here because auth-service's
 * own modules and its published surface both refer to them by this path.
 */
export * from "@brains/plugins/contracts/auth-admin";
