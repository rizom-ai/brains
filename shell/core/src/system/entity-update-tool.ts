import {
  applyEntityEdit,
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
  resolveReplacementContent,
  validateUpdateOperation,
  type UpdateOperation,
} from "./entity-update-operation";
import {
  freezeUserMessageSource,
  resolveConversationMessageContent,
  type UserMessageSource,
} from "./conversation-message-source";
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

interface NormalizedOperation {
  operation: UpdateOperation;
  /** A user-message source pinned to the text it resolved to. */
  source?: UserMessageSource;
}

/**
 * Checks the request's shape and turns it into one operation: edits applied
 * to the current content, normalized fields, or replacement text written by
 * the caller or read verbatim from a user message.
 */
async function normalizeOperation(
  services: SystemServices,
  input: UpdateInput,
  entity: BaseEntity,
  context: ToolContext,
): Promise<NormalizedOperation | ToolFailure> {
  const requested = [input.fields, input.content, input.edits, input.source];
  if (requested.filter((value) => value !== undefined).length > 1)
    return failure(
      "Provide only one of 'fields', 'content', 'edits', or 'source'.",
    );
  if (
    input.confirmed &&
    input.contentHash &&
    entity.contentHash !== input.contentHash
  )
    return failure(
      "Entity was modified since you reviewed the changes. Please try again.",
    );
  if (input.edits !== undefined)
    return {
      operation: { content: applyContentEdits(entity.content, input.edits) },
    };

  let source: UserMessageSource | undefined;
  let operation: UpdateOperation;
  if (input.source !== undefined) {
    const resolved = await resolveConversationMessageContent(
      services,
      input.source,
      context,
    );
    if (!resolved.success) return resolved;
    source = freezeUserMessageSource(input.source, resolved);
    operation = { content: resolved.content };
  } else {
    operation = normalizeUpdateInput({
      ...(input.fields !== undefined ? { fields: input.fields } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    });
  }

  if (operation.content === undefined) {
    return operation.fields
      ? { operation }
      : failure(
          "Provide 'content' (full replacement) or 'fields' (partial update)",
        );
  }
  const content = resolveReplacementContent(
    entity,
    operation.content,
    services.entityRegistry,
  );
  if (typeof content !== "string") return content;
  return { operation: { content }, ...(source ? { source } : {}) };
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
      input.source !== undefined ||
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
    try {
      const eventContext = buildEntityMutationEventContext(context);
      const outcome = await applyEntityEdit(
        {
          entities: entityService,
          registry: entityRegistry,
          assertAllowed: (entityType, action, permission) =>
            services.permissionService.assertEntityActionAllowed(
              entityType,
              action,
              permission,
            ),
        },
        {
          entityType: entity.entityType,
          id: entity.id,
          next: updated,
          baseContentHash: input.contentHash ?? entity.contentHash,
          ...(eventContext ? { eventContext } : {}),
        },
        { permission: context.userPermissionLevel },
      );
      switch (outcome.kind) {
        case "updated":
          return { success: true, data: { updated: entity.id } };
        case "not-found":
          return failure(`Entity not found: ${entity.entityType}/${entity.id}`);
        case "conflict":
          return failure(
            "Entity was modified before the update could be saved. Please request and confirm the update again.",
          );
        case "denied":
          return failure(outcome.message);
      }
    } catch (error) {
      return failure(getErrorMessage(error, "Failed to update entity"));
    }
  };

  const proposeUpdate = (
    input: UpdateInput,
    entity: BaseEntity,
    { operation, source }: NormalizedOperation,
  ): ToolResponse => {
    // Approval must replay the normalized operation, not the JSON content
    // that may have been interpreted as a field update. A user-message source
    // replays as its pinned reference, so approval re-reads the same text.
    const {
      fields: _fields,
      content: _content,
      source: _source,
      ...confirmationInput
    } = input;
    return {
      needsConfirmation: true,
      toolName: "system_update",
      summary: `Update "${getEntityDisplayLabel(entity)}"?`,
      completionSummary: `Updated ${humanizeEntityType(entity.entityType)}.`,
      preview: buildUpdateDiff(entity, operation, entityRegistry),
      args: confirmationGate.buildArgs((confirmationToken) => ({
        ...confirmationInput,
        ...(input.edits !== undefined
          ? { edits: input.edits }
          : source
            ? { source }
            : operation),
        id: entity.id,
        confirmed: true,
        confirmationToken,
        contentHash: entity.contentHash,
      })),
    };
  };

  return createSystemTool(
    "update",
    "Update an entity's fields or content. For small content changes, fetch the entity and use edits with exact oldText/newText pairs instead of regenerating the whole document. For a large rewrite whose text the user supplied, use source with exact user-message boundaries instead of copying it into content. Use only one of fields, content, edits, or source. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. For direct requests that provide exact IDs to set an existing image as an entity cover, call this tool on the target entity with fields.coverImageId set to the image ID; do not stop after lookup.",
    updateInputSchema,
    async (request, context) => {
      const resolved = await resolveEntityOrError(
        entityService,
        request.entityType,
        request.id,
        logger,
        undefined,
        permissionToVisibilityScope(context.userPermissionLevel),
      );
      if (!resolved.ok) return failure(resolved.error);
      const { entity } = resolved;

      const recovered = recoverOmittedOperation(request, entity);
      if ("success" in recovered) return recovered;
      const { input, replayed } = recovered;

      const normalized = await normalizeOperation(
        services,
        input,
        entity,
        context,
      );
      if ("success" in normalized) return normalized;
      const { operation } = normalized;

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
        : proposeUpdate(input, entity, normalized);
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
