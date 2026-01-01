import type { PublishProvider } from "./provider";
import type { PublishConfig } from "./config";

/**
 * Message payloads for plugin → service communication
 */

/** Register an entity type for publishing */
export interface PublishRegisterPayload {
  entityType: string;
  provider?: PublishProvider;
  config?: PublishConfig;
}

/** Add entity to publish queue */
export interface PublishQueuePayload {
  entityType: string;
  entityId: string;
}

/** Publish entity immediately (bypass queue) */
export interface PublishDirectPayload {
  entityType: string;
  entityId: string;
}

/** Remove entity from queue */
export interface PublishRemovePayload {
  entityType: string;
  entityId: string;
}

/** Change entity's queue position */
export interface PublishReorderPayload {
  entityType: string;
  entityId: string;
  position: number;
}

/** Request queue contents */
export interface PublishListPayload {
  entityType: string;
}

/** Report successful publish (plugin → service) */
export interface PublishReportSuccessPayload {
  entityType: string;
  entityId: string;
  result: {
    id: string;
    url?: string;
  };
}

/** Report failed publish (plugin → service) */
export interface PublishReportFailurePayload {
  entityType: string;
  entityId: string;
  error: string;
}

/**
 * Message payloads for service → plugin communication
 */

/** Entity is ready to publish - plugin should handle */
export interface PublishExecutePayload {
  entityType: string;
  entityId: string;
}

/** Entity was added to queue */
export interface PublishQueuedPayload {
  entityType: string;
  entityId: string;
  position: number;
}

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

/** Queue contents response */
export interface PublishListResponsePayload {
  entityType: string;
  queue: Array<{
    entityId: string;
    position: number;
    queuedAt: string;
  }>;
}

/**
 * Message type constants
 */
export const PUBLISH_MESSAGES = {
  // Plugin → Service
  REGISTER: "publish:register",
  QUEUE: "publish:queue",
  DIRECT: "publish:direct",
  REMOVE: "publish:remove",
  REORDER: "publish:reorder",
  LIST: "publish:list",
  REPORT_SUCCESS: "publish:report:success",
  REPORT_FAILURE: "publish:report:failure",

  // Service → Plugin
  EXECUTE: "publish:execute",
  QUEUED: "publish:queued",
  COMPLETED: "publish:completed",
  FAILED: "publish:failed",
  LIST_RESPONSE: "publish:list:response",
} as const;
