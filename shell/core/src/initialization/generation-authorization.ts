import { GenerationAuthorizer } from "@brains/content-service";
import type { MessageBus } from "@brains/messaging-service";
import type { PermissionService } from "@brains/templates";
import { resolvePrincipalViaBus } from "./principal-resolution";

/** Keep auth transport out of content-service; resolve against the live auth runtime. */
export function createGenerationAuthorizer(
  permissions: PermissionService,
  messageBus: Pick<MessageBus, "send">,
): GenerationAuthorizer {
  return new GenerationAuthorizer(permissions, (actor) =>
    resolvePrincipalViaBus(messageBus, "shell:content-service", actor),
  );
}
