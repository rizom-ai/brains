import { CallerAuthorizer } from "@brains/content-service";
import type { MessageBus } from "@brains/messaging-service";
import type { PermissionService } from "@brains/templates";
import { resolvePrincipalViaBus } from "./principal-resolution";

/**
 * The one requester authorizer a runtime builds: generation and package jobs
 * share it. Keeps auth transport out of content-service; resolves against
 * the live auth runtime.
 */
export function createCallerAuthorizer(
  permissions: PermissionService,
  messageBus: Pick<MessageBus, "send" | "getHandlerCount">,
): CallerAuthorizer {
  return new CallerAuthorizer(permissions, (actor) =>
    resolvePrincipalViaBus(messageBus, "shell:content-service", actor),
  );
}
