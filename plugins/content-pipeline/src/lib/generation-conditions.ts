import { getErrorMessage } from "@brains/utils";
import type { ICoreEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { GenerationCondition } from "../types/config";
import type { GenerationConditionResult } from "../types/scheduler";

/**
 * Check whether generation conditions are met for an entity type.
 * Evaluates skipIfDraftExists, maxUnpublishedDrafts, and minSourceEntities.
 */
export async function checkGenerationConditions(
  entityService: ICoreEntityService,
  logger: Logger,
  entityType: string,
  conditions: GenerationCondition,
): Promise<GenerationConditionResult> {
  try {
    if (conditions.skipIfDraftExists !== false) {
      const drafts = await entityService.listEntities(entityType, {
        filter: { metadata: { status: "draft" } },
        limit: 1,
      });

      if (drafts.length > 0) {
        return {
          shouldGenerate: false,
          reason: "Draft already exists",
        };
      }
    }

    if (conditions.maxUnpublishedDrafts !== undefined) {
      const unpublishedDrafts = await entityService.listEntities(entityType, {
        filter: { metadata: { status: "draft" } },
        limit: conditions.maxUnpublishedDrafts + 1,
      });

      if (unpublishedDrafts.length >= conditions.maxUnpublishedDrafts) {
        return {
          shouldGenerate: false,
          reason: `Max unpublished drafts reached (${unpublishedDrafts.length}/${conditions.maxUnpublishedDrafts})`,
        };
      }
    }

    if (
      conditions.minSourceEntities !== undefined &&
      conditions.sourceEntityType
    ) {
      const sourceEntities = await entityService.listEntities(
        conditions.sourceEntityType,
        {
          publishedOnly: true,
          limit: conditions.minSourceEntities,
        },
      );

      if (sourceEntities.length < conditions.minSourceEntities) {
        return {
          shouldGenerate: false,
          reason: `Not enough source entities (${sourceEntities.length}/${conditions.minSourceEntities} ${conditions.sourceEntityType})`,
        };
      }
    }

    return { shouldGenerate: true };
  } catch (error) {
    logger.error("Failed to check generation conditions", {
      entityType,
      error: getErrorMessage(error),
    });

    return {
      shouldGenerate: false,
      reason: `Condition check failed: ${getErrorMessage(error)}`,
    };
  }
}
