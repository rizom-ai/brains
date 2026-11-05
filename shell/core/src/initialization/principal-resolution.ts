import {
  authPrincipalResolveContract,
  type ActorRef,
  type AuthPrincipalResolveResponse,
} from "@brains/contracts";
import { requestContract, type IMessageBus } from "@brains/messaging-service";

export type ResolvedPrincipal = AuthPrincipalResolveResponse["principal"];

/**
 * The one transport for resolving an actor to its auth principal. Returns null
 * when no auth runtime is listening or no account exists; throws when the
 * runtime answered with a failure, so callers decide whether that is a retry
 * (durable work) or a soft miss (identity display).
 */
export async function resolvePrincipalViaBus(
  messageBus: Pick<IMessageBus, "send" | "getHandlerCount">,
  sender: string,
  actor: ActorRef,
): Promise<ResolvedPrincipal | null> {
  const result = await requestContract(
    messageBus,
    authPrincipalResolveContract,
    { actor },
    sender,
  );
  if (result.status === "unavailable") return null;
  if (result.status === "failed") throw new Error(result.error);
  return result.data.principal;
}
