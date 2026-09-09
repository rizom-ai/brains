import { z } from "@brains/utils/zod";
import { sha256Hex } from "@brains/utils/hash";

const uploadNamespaceSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u,
    "Upload namespace must be a flat path segment",
  );

const stateOwnerSchema = z
  .string()
  .min(1)
  .refine(
    (name) => Buffer.from(name).toString("utf8") === name,
    "State owner must be well-formed Unicode",
  );
const simpleScopedPackage = /^@[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-zA-Z0-9_-]+$/u;

/**
 * Keep the existing, unambiguous two-component encoding for ordinary scoped
 * packages. Every workspace package uses this form, so their state does not move.
 *
 * Other names need a distinct encoding: replacing @ and / with dots aliases
 * @scope/pkg with scope.pkg, and loses component boundaries in dotted names.
 * Base64url contains no colon or dot; the tagged owner and local namespace have
 * unambiguous boundaries and cannot alias the ordinary scoped form.
 *
 * Do not fall back to old collapsed keys for encoded owners. Such a row cannot
 * identify its original owner, and a fallback would reintroduce shared state.
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

/**
 * Every interface scope includes both package and declaration identity. Even
 * an undotted local name can collide when two packages choose the same ID.
 * The tagged encoding also separates interface state from package-owned state.
 * Never read or migrate the old declaration-only keys.
 */
export function interfaceStateNamespaceFor(
  packageName: string,
  declarationId: string,
  namespace: string,
): string {
  const packageOwner = stateOwnerSchema.parse(packageName);
  const owner = stateOwnerSchema.parse(declarationId);
  return `interface:${Buffer.from(packageOwner).toString("base64url")}:${Buffer.from(owner).toString("base64url")}:${namespace}`;
}

/**
 * Scope temporary uploads by package, declaration, and local namespace.
 * Hash an unambiguous tuple to keep even long owners within a flat filesystem
 * segment. The dot-free prefix cannot overlap old declaration.local directories.
 * Do not migrate, read, or prune those old directories through the new scopes.
 */
export function uploadNamespaceFor(
  packageName: string,
  declarationId: string,
  namespace: string,
): string {
  const packageOwner = stateOwnerSchema.parse(packageName);
  const owner = stateOwnerSchema.parse(declarationId);
  const local = z.string().parse(namespace);
  uploadNamespaceSchema.parse(`${owner}.${local}`);
  return `interface-upload-${sha256Hex(JSON.stringify([packageOwner, owner, local]))}`;
}
