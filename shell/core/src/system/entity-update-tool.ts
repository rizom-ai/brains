import {
  canWriteVisibility,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type { z } from "@brains/utils/zod";
import { getErrorMessage } from "@brains/utils/error";
import { updateInputSchema } from "./schemas";
import { applyContentEdits } from "./content-edits";
import { assertEntityActionAllowed } from "./entity-action-policy";
import {
  applyUpdateOperation,
  buildUpdateDiff,
  requiredUpdateAction,
  validateUpdateOperation,
  type UpdateOperation,
} from "./entity-update-operation";
import type { SystemServices } from "./types";
import {
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  getEntityDisplayLabel,
  humanizeEntityType,
  normalizeUpdateInput,
} from "./tool-helpers";

type UpdateInput = z.output<typeof updateInputSchema>;
interface ToolFailure {
  success: false;
  error: string;
}

function failure(error: string): ToolFailure {
  return { success: false, error };
}

/**
 * Checks the request's shape and turns it into one operation: edits applied
 * to the current content, or normalized fields or content.
 */
function normalizeOperation(
  input: UpdateInput,
  entity: BaseEntity,
): UpdateOperation | ToolFailure {
  if (
    input.edits !== undefined &&
    (input.content !== undefined || input.fields !== undefined)
  )
    return failure("Provide only one of 'edits', 'content', or 'fields'.");
  if (
    input.confirmed &&
    input.contentHash &&
    entity.contentHash !== input.contentHash
  )
    return failure(
      "Entity was modified since you reviewed the changes. Please try again.",
    );

  const operation: UpdateOperation =
    input.edits !== undefined
      ? { content: applyContentEdits(entity.content, input.edits) }
      : normalizeUpdateInput({
          ...(input.fields !== undefined ? { fields: input.fields } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
        });

  if (operation.content !== undefined && operation.fields !== undefined)
    return failure("Provide either 'content' or 'fields', not both");
  if (!operation.content && !operation.fields)
    return failure(
      "Provide 'content' (full replacement) or 'fields' (partial update)",
    );
  return operation;
}

export function createEntityUpdateTool(services: SystemServices): Tool {
  const { entityService, logger, entityRegistry } = services;
  const confirmationGate = createConfirmationGate({
    label: "update",
    requestNoun: "the update",
  });

  /**
   * A confirmed call whose operation went missing replays the proposal its
   * token stored. The stored proposal remains the authority for fields,
   * edits, visibility, and optimistic concurrency.
   */
  const recoverOmittedOperation = (
    input: UpdateInput,
    entity: BaseEntity,
  ): { input: UpdateInput; replayed: boolean } | ToolFailure => {
    if (
      !input.confirmed ||
      !input.confirmationToken ||
      input.edits !== undefined ||
      input.fields !== undefined ||
      input.content?.trim()
    )
      return { input, replayed: false };
    const stored = updateInputSchema.safeParse(
      confirmationGate.takePending(input.confirmationToken),
    );
    if (
      !stored.success ||
      stored.data.entityType !== entity.entityType ||
      stored.data.id !== entity.id
    )
      return failure(
        "No pending update confirmation found for this entity. Please request the update again.",
      );
    return { input: stored.data, replayed: true };
  };

  const commitUpdate = async (
    input: UpdateInput,
    entity: BaseEntity,
    operation: UpdateOperation,
    replayed: boolean,
    context: ToolContext,
  ): Promise<ToolResponse> => {
    if (!replayed) {
      const gateError = confirmationGate.validateConfirmed(
        input.confirmationToken,
        input,
      );
      if (gateError) return gateError;
    }
    const updated = applyUpdateOperation(entity, operation, entityRegistry);
    if (
      updated.visibility !== entity.visibility &&
      !canWriteVisibility(context.userPermissionLevel, updated.visibility)
    )
      return failure(
        `Cannot set entity visibility to "${updated.visibility}" — caller permission "${context.userPermissionLevel ?? "public"}" is not allowed to write at that level.`,
      );

    try {
      const eventContext = buildEntityMutationEventContext(context);
      const result = await entityService.updateEntity({
        entity: updated,
        options: {
          expectedContentHash: entity.contentHash,
          ...(eventContext ? { eventContext } : {}),
        },
      });
      if (result.skipReason === "content-conflict")
        return failure(
          "Entity was modified before the update could be saved. Please request and confirm the update again.",
        );
    } catch (error) {
      return failure(getErrorMessage(error, "Failed to update entity"));
    }
    return { success: true, data: { updated: entity.id } };
  };

  const proposeUpdate = (
    input: UpdateInput,
    entity: BaseEntity,
    operation: UpdateOperation,
  ): ToolResponse => {
    // Approval must replay the normalized operation, not the JSON content
    // that may have been interpreted as a field update.
    const { fields: _fields, content: _content, ...confirmationInput } = input;
    return {
      needsConfirmation: true,
      toolName: "system_update",
      summary: `Update "${getEntityDisplayLabel(entity)}"?`,
      completionSummary: `Updated ${humanizeEntityType(entity.entityType)}.`,
      preview: buildUpdateDiff(entity, operation, entityRegistry),
      args: confirmationGate.buildArgs((confirmationToken) => ({
        ...confirmationInput,
        ...(input.edits !== undefined ? { edits: input.edits } : operation),
        id: entity.id,
        confirmed: true,
        confirmationToken,
        contentHash: entity.contentHash,
      })),
    };
  };

  return createSystemTool(
    "update",
    "Update an entity's fields or content. For small content changes, fetch the entity and use edits with exact oldText/newText pairs instead of regenerating the whole document. Use only one of fields, content, or edits. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. For direct requests that provide exact IDs to set an existing image as an entity cover, call this tool on the target entity with fields.coverImageId set to the image ID; do not stop after lookup.",
    updateInputSchema,
    async (request, context) => {
      const resolved = await resolveEntityOrError(
        entityService,
        request.entityType,
        request.id,
        logger,
        undefined,
        permissionToVisibilityScope(context.userPermissionLevel),
        { binaryContent: "reference" },
      );
      if (!resolved.ok) return failure(resolved.error);
      const { entity } = resolved;

      const recovered = recoverOmittedOperation(request, entity);
      if ("success" in recovered) return recovered;
      const { input, replayed } = recovered;

      const operation = normalizeOperation(input, entity);
      if ("success" in operation) return operation;

      const invalid = validateUpdateOperation(
        entity,
        operation,
        entityRegistry,
        entityService,
      );
      if (invalid) return invalid;

      const policyError = assertEntityActionAllowed(
        services,
        input.entityType,
        requiredUpdateAction(entity, operation, entityRegistry),
        context,
      );
      if (policyError) return policyError;

      return input.confirmed
        ? commitUpdate(input, entity, operation, replayed, context)
        : proposeUpdate(input, entity, operation);
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
