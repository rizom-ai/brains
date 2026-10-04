import { SdkError } from "@brains/contracts";
import { permissionToVisibilityScope } from "@brains/entity-service";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { InterfaceCaller } from "../interface/route-contract";
import type { StudioWorkspaceActor } from "../types/studio-workspace";
import { assertRouteCaller } from "../internal/route-caller-authority";

// A transport key, NOT an authority registry. Independently bundled SDK helpers
// must forward the original object to the receiving host's private credential map.
const forwardedCaller = Symbol.for("@rizom/brain/studio-workspace-caller");

/** Carry a caller without issuing authority. The receiving host validates it. */
export function createStudioWorkspaceActor(
  caller: InterfaceCaller,
): StudioWorkspaceActor {
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: caller.actor.id,
    actor: Object.freeze({
      kind: "user",
      userId: caller.actor.id,
      ...(caller.actor.canonicalId === undefined
        ? {}
        : { canonicalId: caller.actor.canonicalId }),
    }),
    userPermissionLevel: caller.permission,
    visibilityScope: permissionToVisibilityScope(caller.permission),
    isAnchor: caller.isAnchor,
  };
  Object.defineProperty(actor, forwardedCaller, { value: caller });
  return Object.freeze(actor);
}

/** Host-only: recover the live caller, checking the receiving runtime. */
export function workspaceCaller(
  actor: StudioWorkspaceActor,
  authority: IAuthRegistry,
): InterfaceCaller {
  const caller: unknown = Object.getOwnPropertyDescriptor(
    actor,
    forwardedCaller,
  )?.value;
  assertRouteCaller(caller, authority);
  if (
    actor.userId !== caller.actor.id ||
    actor.userPermissionLevel !== caller.permission ||
    actor.isAnchor !== caller.isAnchor ||
    actor.visibilityScope !== permissionToVisibilityScope(caller.permission) ||
    actor.actor.kind !== "user" ||
    actor.actor.userId !== caller.actor.id ||
    actor.actor.canonicalId !== caller.actor.canonicalId
  )
    throw new SdkError("permission_denied");
  assertRouteCaller(caller, authority);
  return caller;
}
