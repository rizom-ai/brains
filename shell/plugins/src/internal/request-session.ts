import type { AuthCaller, AuthPrincipal } from "../contracts/auth";

const requests = new WeakMap<
  AuthCaller,
  WeakMap<Request, Promise<AuthPrincipal | undefined>>
>();

/** One immutable session result per authenticator/request, including refusals. */
export function resolveRequestSession(
  source: AuthCaller,
  request: Request,
): Promise<AuthPrincipal | undefined> {
  let cache = requests.get(source);
  if (!cache) {
    cache = new WeakMap();
    requests.set(source, cache);
  }
  let result = cache.get(request);
  if (!result) {
    result = Promise.resolve()
      .then(() => source.resolveSession(request))
      .then((principal) =>
        principal ? Object.freeze({ ...principal }) : undefined,
      );
    cache.set(request, result);
  }
  return result;
}
