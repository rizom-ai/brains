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
