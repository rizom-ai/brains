/**
 * Scheduler generation helpers - extracted from ContentScheduler
 *
 * Contains the generation trigger logic for
 * automatic draft creation on schedule.
 */

import type { Logger } from "@brains/utils/logger";
import type { GenerationCondition } from "./types/config";
import type {
  GenerateExecuteEvent,
  GenerationConditionResult,
  SchedulerMessagePublisher,
} from "./types/scheduler";
import { generateExecuteContract } from "@brains/contracts";

export interface GenerationDeps {
  logger: Logger;
  messageBus?: SchedulerMessagePublisher | undefined;
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
      deps.logger.debug("Skipping scheduled generation", {
        entityType,
        reason: result.reason ?? "Conditions not met",
      });
      return;
    }
  }

  const event: GenerateExecuteEvent = { entityType };

  // Every entity type's generator hears the command and acts on its own type.
  await deps.messageBus?.command(generateExecuteContract, event);

  deps.onGenerate?.(event);
}
