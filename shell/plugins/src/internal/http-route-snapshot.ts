import type { RegisteredHttpRoute } from "../types/http-routes";

type HttpRouteSnapshotProvider = () => readonly RegisteredHttpRoute[];

/**
 * The provider rides the owner object under a global-registry symbol, not in
 * module state: the built binary loads the runtime as separate bundles
 * (brain.js and model.js), each with its own instance of this module, and
 * only the owner object crosses that boundary. `Symbol.for` resolves to the
 * same symbol in every copy; the non-enumerable property keeps the registry
 * off the public context surface.
 */
const PROVIDER_KEY = Symbol.for("brains.httpRouteSnapshotProvider");

/**
 * Read the bound provider off an owner.
 *
 * Callers pass a bare `object`, so the compiler cannot know the branded symbol
 * is present. A property read (rather than `in`) is what the binding relies on:
 * scoped owners are get-trap proxies. The single assertion is irreducible —
 * `typeof value === "function"` establishes callability but not a signature —
 * and lives here instead of at each of the four read sites, which previously
 * did not check callability at all.
 */
function readSnapshotProvider(
  owner: object,
): HttpRouteSnapshotProvider | undefined {
  const value: unknown = Reflect.get(owner, PROVIDER_KEY);
  return typeof value === "function"
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Reflect.get returns unknown; the typeof check proves callability, which is the whole contract this provider slot has
      (value as HttpRouteSnapshotProvider)
    : undefined;
}

export function bindHttpRouteSnapshot(
  owner: object,
  provider: HttpRouteSnapshotProvider,
): void {
  if (readSnapshotProvider(owner)) {
    throw new Error("HTTP route snapshot provider is already bound");
  }
  // Configurable: scoped owners are get-trap proxies that re-bind function
  // values, and the proxy `get` invariant forbids that for non-configurable
  // non-writable properties. Rebinding is still rejected at this API.
  Object.defineProperty(owner, PROVIDER_KEY, {
    value: provider,
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

export function forwardHttpRouteSnapshot(source: object, target: object): void {
  const provider = readSnapshotProvider(source);
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  // Scoped owners are proxies whose reads fall through to the bound shell:
  // if the target already resolves a provider, forwarding is satisfied.
  if (readSnapshotProvider(target)) return;
  bindHttpRouteSnapshot(target, provider);
}

export function getHttpRouteSnapshot(
  owner: object,
): readonly RegisteredHttpRoute[] {
  const provider = readSnapshotProvider(owner);
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  return provider();
}
