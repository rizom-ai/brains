import type { ToolContext } from "@brains/plugins";

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

/**
 * Payloads of the publish events content-pipeline broadcasts on
 * `PUBLISH_CHANNELS.completed` and `PUBLISH_CHANNELS.failed`.
 */

/** Publish completed successfully */
export interface PublishCompletedPayload {
  entityType: string;
  entityId: string;
  result: {
    id: string;
    url?: string;
  };
}

/** Publish failed */
export interface PublishFailedPayload {
  entityType: string;
  entityId: string;
  error: string;
  retryCount: number;
  willRetry: boolean;
}
