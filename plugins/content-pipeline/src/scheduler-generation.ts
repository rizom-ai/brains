/**
 * Scheduler generation helpers - extracted from ContentScheduler
 *
 * Contains the generation trigger and reporting logic for
 * automatic draft creation on schedule.
 */

import type { Logger } from "@brains/utils/logger";
import type { GenerationCondition } from "./types/config";
import type {
  GenerateExecuteEvent,
  GenerationConditionResult,
} from "./types/scheduler";
import { GENERATE_MESSAGES } from "./types/messages";

/**
 * The publish side of the message bus, which is all the scheduler uses.
 *
 * Non-generic on purpose: the real bus's send<T, R> is assignable to this, and
 * a test can supply a plain function without the type parameters bun's mock()
 * erases. No caller here reads the response — every send is fire-and-forget.
 */
export interface SchedulerMessagePublisher {
  send(request: {
    type: string;
    payload: unknown;
    sender?: string;
    broadcast?: boolean;
  }): Promise<unknown>;
}

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
      if (deps.messageBus) {
        void deps.messageBus.send({
          type: GENERATE_MESSAGES.SKIPPED,
          payload: {
            entityType,
            reason: result.reason ?? "Conditions not met",
          },
          sender: "content-pipeline",
        });
      }
      return;
    }
  }

  const event: GenerateExecuteEvent = { entityType };

  if (deps.messageBus) {
    await deps.messageBus.send({
      type: GENERATE_MESSAGES.EXECUTE,
      payload: event,
      sender: "content-pipeline",
    });
  }

  deps.onGenerate?.(event);
}

/**
 * Report successful generation via message bus
 */
export function sendGenerationCompleted(
  entityType: string,
  entityId: string,
  messageBus?: SchedulerMessagePublisher,
): void {
  if (messageBus) {
    void messageBus.send({
      type: GENERATE_MESSAGES.COMPLETED,
      payload: { entityType, entityId },
      sender: "content-pipeline",
    });
  }
}

/**
 * Report failed generation via message bus
 */
export function sendGenerationFailed(
  entityType: string,
  error: string,
  messageBus?: SchedulerMessagePublisher,
): void {
  if (messageBus) {
    void messageBus.send({
      type: GENERATE_MESSAGES.FAILED,
      payload: { entityType, error },
      sender: "content-pipeline",
    });
  }
}
