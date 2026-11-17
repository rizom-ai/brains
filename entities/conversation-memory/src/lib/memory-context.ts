import {
  classEntityServiceOf,
  type ServiceAI,
  type ServiceClassEntityService,
  type ServiceConversations,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";

/**
 * The entity service conversation memory reads and writes through, as its
 * class did through context.entityService.
 */
export type MemoryEntityService = Pick<
  ServiceClassEntityService,
  | "getEntity"
  | "listEntities"
  | "search"
  | "createEntity"
  | "updateEntity"
  | "deleteEntity"
>;

/**
 * What conversation memory's retrieval, channel pickup, widgets and evals
 * reach, as its class reached them through its context: its logger, the
 * entity service, the brain's conversations and template generation.
 */
export interface MemoryContext {
  readonly logger: Logger;
  readonly entityService: MemoryEntityService;
  readonly conversations: ServiceConversations;
  readonly ai: Pick<ServiceAI, "generate">;
}

/** Conversation memory's context over the package's runtime. */
export function memoryContextOf(runtime: ServiceRuntime): MemoryContext {
  return {
    logger: runtime.logger,
    entityService: classEntityServiceOf(runtime),
    conversations: runtime.conversations,
    ai: runtime.ai,
  };
}
