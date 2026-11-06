import { z } from "@brains/utils/zod";

const stateOwnerSchema = z
  .string()
  .min(1)
  .refine(
    (name) => Buffer.from(name).toString("utf8") === name,
    "State owner must be well-formed Unicode",
  );
const simpleScopedPackage = /^@[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-zA-Z0-9_-]+$/u;

/**
 * Where a package's local runtime-state namespace is stored: qualified by the
 * package that declared it, so two packages naming the same namespace never
 * share a record.
 *
 * An ordinary scoped package keeps the two-component form `scope.name.local`,
 * the form every workspace package already uses. Any other name is tagged and
 * base64url-encoded: replacing `@` and `/` with dots would alias `@scope/pkg`
 * with `scope.pkg` and lose component boundaries in dotted names, and
 * base64url contains no colon or dot, so the tagged form can alias neither.
 */
export function stateNamespaceFor(
  packageName: string,
  namespace: string,
): string {
  const owner = stateOwnerSchema.parse(packageName);
  if (simpleScopedPackage.test(owner)) {
    return `${owner.slice(1).replace("/", ".")}.${namespace}`;
  }
  return `package:${Buffer.from(owner).toString("base64url")}:${namespace}`;
}
