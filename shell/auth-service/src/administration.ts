/**
 * The administration contract now lives in `@brains/plugins`, so a package
 * can name it without depending on this service. Re-exported here because
 * auth-service's own modules and its published surface refer to it by this
 * path, and `AuthService` implements it nominally.
 */
export type * from "@brains/plugins/contracts/auth-administration";
