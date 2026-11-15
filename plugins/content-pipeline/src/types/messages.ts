import type { ToolContext } from "@brains/sdk/internal/service-runtime";

export interface PublishAuthContext {
  interfaceType?: ToolContext["interfaceType"] | undefined;
  actor?: ToolContext["actor"] | undefined;
  userPermissionLevel?: ToolContext["userPermissionLevel"] | undefined;
  authorization?: "user" | "system" | undefined;
}

export const SYSTEM_PUBLISH_AUTH_CONTEXT: PublishAuthContext = {
  interfaceType: "system",
  actor: { kind: "service", serviceId: "content-pipeline" },
  userPermissionLevel: "admin",
  authorization: "system",
};
