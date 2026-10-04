import { SdkError } from "@brains/contracts";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { InterfaceCaller } from "../interface/route-contract";

// Runtime-only credentials: copying a caller's presentation fields grants no
// authority. Credentials belong to one runtime and one active request.
const callers = new WeakMap<
  object,
  {
    readonly authority: IAuthRegistry;
    readonly signal: AbortSignal;
    readonly lifetime: AbortController;
  }
>();

export function issueRouteCaller(
  value: InterfaceCaller,
  authority: IAuthRegistry,
  signal?: AbortSignal,
): InterfaceCaller {
  const caller = Object.freeze({
    ...value,
    actor: Object.freeze({ ...value.actor }),
  });
  const lifetime = new AbortController();
  callers.set(caller, {
    authority,
    lifetime,
    signal: signal
      ? AbortSignal.any([signal, lifetime.signal])
      : lifetime.signal,
  });
  return caller;
}

export function revokeRouteCaller(caller: InterfaceCaller): void {
  callers.get(caller)?.lifetime.abort();
  callers.delete(caller);
}

export function assertRouteCaller(
  caller: unknown,
  authority: IAuthRegistry,
): asserts caller is InterfaceCaller {
  if (typeof caller !== "object" || caller === null)
    throw new SdkError("unauthenticated");
  const credential = callers.get(caller);
  if (credential?.authority !== authority)
    throw new SdkError("unauthenticated");
  if (credential.signal.aborted) throw new SdkError("cancelled");
}

/** Host-only signal that also aborts when request authority is revoked. */
export function routeCallerSignal(
  caller: InterfaceCaller,
  authority: IAuthRegistry,
): AbortSignal {
  assertRouteCaller(caller, authority);
  const credential = callers.get(caller);
  if (!credential) throw new SdkError("unauthenticated");
  return credential.signal;
}
