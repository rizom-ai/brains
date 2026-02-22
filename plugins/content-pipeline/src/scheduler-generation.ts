/**
 * Scheduler generation helpers - extracted from ContentScheduler
 *
 * Contains the generation trigger and reporting logic for
 * automatic draft creation on schedule.
 */

import type { IMessageBus } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { GenerationCondition } from "./types/config";
import type {
  GenerateExecuteEvent,
  GenerationConditionResult,
} from "./types/scheduler";
import { GENERATE_MESSAGES } from "./types/messages";

export interface GenerationDeps {
  logger: Logger;
  messageBus?: IMessageBus | undefined;
  generationConditions: Record<string, GenerationCondition>;
  onCheckGenerationConditions?:
    | ((
        entityType: string,
        conditions: GenerationCondition,
      ) => Promise<GenerationConditionResult>)
    | undefined;
  onGenerate?: ((event: GenerateExecuteEvent) => void) | undefined;
}

/**
 * Trigger generation for an entity type, checking conditions first.
 */
export async function triggerGeneration(
  entityType: string,
  deps: GenerationDeps,
): Promise<void> {
  const conditions = deps.generationConditions[entityType];
  if (conditions && deps.onCheckGenerationConditions) {
    const result = await deps.onCheckGenerationConditions(
      entityType,
      conditions,
    );

    if (!result.shouldGenerate) {
      if (deps.messageBus) {
        void deps.messageBus.send(
          GENERATE_MESSAGES.SKIPPED,
          { entityType, reason: result.reason ?? "Conditions not met" },
          "content-pipeline",
        );
      }
      return;
    }
  }

  const event: GenerateExecuteEvent = { entityType };

  if (deps.messageBus) {
    await deps.messageBus.send(
      GENERATE_MESSAGES.EXECUTE,
      event,
      "content-pipeline",
    );
  }

  deps.onGenerate?.(event);
}

/**
 * Report successful generation via message bus
 */
export function sendGenerationCompleted(
  entityType: string,
  entityId: string,
  messageBus?: IMessageBus,
): void {
  if (messageBus) {
    void messageBus.send(
      GENERATE_MESSAGES.COMPLETED,
      { entityType, entityId },
      "content-pipeline",
    );
  }
}

/**
 * Report failed generation via message bus
 */
export function sendGenerationFailed(
  entityType: string,
  error: string,
  messageBus?: IMessageBus,
): void {
  if (messageBus) {
    void messageBus.send(
      GENERATE_MESSAGES.FAILED,
      { entityType, error },
      "content-pipeline",
    );
  }
}
