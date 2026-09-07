import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveResponseSchema,
  type ActorRef,
} from "@brains/contracts";
import type { MessageBus } from "@brains/messaging-service";
import type { z } from "@brains/utils/zod";

export type ResolvedPrincipal = z.output<
  typeof authPrincipalResolveResponseSchema
>["principal"];

/**
 * The one transport for resolving an actor to its auth principal. Returns null
 * when no auth runtime is listening or no account exists; throws when the
 * runtime answered with a failure, so callers decide whether that is a retry
 * (durable work) or a soft miss (identity display).
 */
export async function resolvePrincipalViaBus(
  messageBus: Pick<MessageBus, "send">,
  sender: string,
  actor: ActorRef,
): Promise<ResolvedPrincipal | null> {
  const response = await messageBus.send({
    type: AUTH_PRINCIPAL_RESOLVE_CHANNEL,
    sender,
    payload: { actor },
  });
  if ("noop" in response) return null;
  if (!response.success) throw new Error("Principal resolution unavailable");
  return authPrincipalResolveResponseSchema.parse(response.data).principal;
}
