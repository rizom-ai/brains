import { permissionToVisibilityScope } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { extractInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import { createSystemTool } from "./tool-helpers";

export function createEntityExtractTool(services: SystemServices): Tool {
  const { entityService, jobs } = services;

  return createSystemTool(
    "extract",
    'Generate derived entities (e.g. topics) from existing content. Use this for requests like "generate topics for me", "extract topics", "derive topics from my notes" — call once with `entityType` (typically `"topic"`); do not preflight with search/list. Provide `source` to derive from a single entity, omit for a batch over all sources. `mode: "rebuild"` is currently only supported for `entityType: "topic"` and requires confirmation; other entity types fall back to normal projection mode.',
    extractInputSchema,
    async (input, toolContext) => {
      const { entityType, source } = input;
      const requestedMode = input.mode ?? "derive";
      const rebuildRequested = requestedMode === "rebuild";
      const rebuildSupported = entityType === "topic" && !source;
      const appliedMode =
        rebuildRequested && rebuildSupported ? "rebuild" : "derive";

      if (!entityService.getEntityTypes().includes(entityType)) {
        return {
          success: false,
          error: `Unknown entity type: ${entityType}. Available types: ${entityService.getEntityTypes().join(", ")}`,
        };
      }

      // Policy is checked before mode (derive/rebuild/source) is finalized.
      // Assumes all extraction modes share the same required level for a
      // given entity type. If a future mode needs distinct gating, extend
      // EntityAction (e.g. "extract:rebuild") rather than branching here.
      const policyError = assertEntityActionAllowed(
        services,
        entityType,
        "extract",
        toolContext,
      );
      if (policyError) return policyError;

      if (rebuildRequested && rebuildSupported && !input.confirmed) {
        return {
          needsConfirmation: true,
          toolName: "system_extract",
          summary:
            "Rebuild all derived topic entities from current source content?",
          preview:
            "This will delete existing topics and regenerate them from scratch.",
          args: {
            ...input,
            confirmed: true,
          },
        };
      }

      try {
        const data: {
          mode: "derive" | "rebuild" | "source";
          entityId?: string;
          entityType?: string;
        } = { mode: appliedMode };
        if (source) {
          const visibilityScope = permissionToVisibilityScope(
            toolContext.userPermissionLevel,
          );
          for (const type of entityService.getEntityTypes()) {
            const found = await entityService.getEntity({
              entityType: type,
              id: source,
              visibilityScope,
            });
            if (found) {
              data.mode = "source";
              data.entityId = found.id;
              data.entityType = found.entityType;
              break;
            }
          }
          if (!data.entityId)
            return {
              success: false,
              error: `Source entity not found: ${source}`,
            };
        }

        const jobId = await jobs.enqueue({
          type: `${entityType}:project`,
          data,
          toolContext,
        });
        return {
          success: true,
          data: {
            status: "extracting",
            jobId,
            entityType,
            mode: appliedMode,
            ...(source && { source }),
          },
          ...(rebuildRequested && !rebuildSupported
            ? {
                message:
                  source || entityType !== "topic"
                    ? `Rebuild is currently only supported for batch topic extraction. Ran normal projection mode for ${entityType} instead.`
                    : undefined,
              }
            : {}),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to queue extraction job",
        };
      }
    },
    { visibility: "trusted" },
  );
}
