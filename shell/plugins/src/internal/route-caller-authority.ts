import { SdkError } from "@brains/contracts";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { InterfaceCaller } from "../interface/route-contract";

// Runtime-only credentials: copying a caller's presentation fields grants no
// authority. Credentials belong to one runtime and one active request.
const callers = new WeakMap<
  object,
  {
    readonly authority: IAuthRegistry;
    readonly signal?: AbortSignal;
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
  callers.set(caller, { authority, ...(signal ? { signal } : {}) });
  return caller;
}

export function revokeRouteCaller(caller: InterfaceCaller): void {
  callers.delete(caller);
}

export function assertRouteCaller(
  caller: InterfaceCaller,
  authority: IAuthRegistry,
): void {
  const credential = callers.get(caller);
  if (credential?.authority !== authority)
    throw new SdkError("unauthenticated");
  if (credential.signal?.aborted) throw new SdkError("cancelled");
}
