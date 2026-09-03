/**
 * The namespace a package's runtime state is filed under.
 *
 * Package names are npm-scoped and runtime-state namespaces are not: `@` and
 * `/` are both rejected there, so `@brains/playbooks` was never a namespace a
 * package could actually use. Three call sites built one this way and none had
 * a consumer until now, so the store refused the first package that tried.
 *
 * The mapping keeps the scope rather than dropping it, because two scopes may
 * publish the same short name and their notes must not collide.
 */
export function stateNamespaceFor(
  packageName: string,
  namespace: string,
): string {
  return `${packageName.replace(/^@/u, "").replaceAll("/", ".")}.${namespace}`;
}

/**
 * The directory a declaration's uploads are filed under.
 *
 * The same reasoning as runtime state, for a different reason to care: an
 * upload namespace is a filesystem path, and a declaration naming its own
 * scope has no way to know another one did not choose the same word. Two
 * interfaces both accepting attachments would then share a directory, and a
 * ref issued by one would resolve in the other — isolation by convention,
 * which is no isolation at all.
 *
 * Kept flat rather than nested so a scope stays one path segment, and
 * separated by `.` because declaration ids are identifiers and cannot
 * contain one.
 */
export function uploadNamespaceFor(
  declarationId: string,
  namespace: string,
): string {
  return `${declarationId}.${namespace}`;
}
