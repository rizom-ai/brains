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

interface SnapshotOwner {
  [PROVIDER_KEY]?: HttpRouteSnapshotProvider;
}

export function bindHttpRouteSnapshot(
  owner: object,
  provider: HttpRouteSnapshotProvider,
): void {
  if ((owner as SnapshotOwner)[PROVIDER_KEY]) {
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
  const provider = (source as SnapshotOwner)[PROVIDER_KEY];
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  // Scoped owners are proxies whose reads fall through to the bound shell:
  // if the target already resolves a provider, forwarding is satisfied.
  if ((target as SnapshotOwner)[PROVIDER_KEY]) return;
  bindHttpRouteSnapshot(target, provider);
}

export function getHttpRouteSnapshot(
  owner: object,
): readonly RegisteredHttpRoute[] {
  const provider = (owner as SnapshotOwner)[PROVIDER_KEY];
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  return provider();
}
