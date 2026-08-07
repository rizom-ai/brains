import type { RegisteredHttpRoute } from "../types/http-routes";

type HttpRouteSnapshotProvider = () => readonly RegisteredHttpRoute[];

const providers = new WeakMap<object, HttpRouteSnapshotProvider>();

export function bindHttpRouteSnapshot(
  owner: object,
  provider: HttpRouteSnapshotProvider,
): void {
  if (providers.has(owner)) {
    throw new Error("HTTP route snapshot provider is already bound");
  }
  providers.set(owner, provider);
}

export function forwardHttpRouteSnapshot(source: object, target: object): void {
  const provider = providers.get(source);
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  bindHttpRouteSnapshot(target, provider);
}

export function getHttpRouteSnapshot(
  owner: object,
): readonly RegisteredHttpRoute[] {
  const provider = providers.get(owner);
  if (!provider) {
    throw new Error("HTTP route snapshot provider is not bound");
  }
  return provider();
}
