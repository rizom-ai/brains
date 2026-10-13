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
 * Turns the requested operation into fields or replacement content: edits
 * applied to the current content, or replacement text written by the caller
 * or read verbatim from a user message.
 */
async function normalizeOperation(
  services: SystemServices,
  input: UpdateInput,
  entity: BaseEntity,
  context: ToolContext,
): Promise<NormalizedOperation | ToolFailure> {
  if (
    input.confirmed &&
    input.contentHash &&
    entity.contentHash !== input.contentHash
  )
    return failure(
      "Entity was modified since you reviewed the changes. Please try again.",
    );

  const requested = input.operation;
  switch (requested.kind) {
    case "fields":
      return { operation: requested };
    case "edits":
      return {
        operation: {
          kind: "content",
          content: applyContentEdits(entity.content, requested.edits),
        },
      };
    case "content":
      return withReplacementContent(services, entity, requested.content);
    case "source": {
      const resolved = await resolveConversationMessageContent(
        services,
        requested.source,
        context,
      );
      if (!resolved.success) return resolved;
      return withReplacementContent(
        services,
        entity,
        resolved.content,
        freezeUserMessageSource(requested.source, resolved),
      );
    }
  }
}

function withReplacementContent(
  services: SystemServices,
  entity: BaseEntity,
  text: string,
  source?: UserMessageSource,
): NormalizedOperation | ToolFailure {
  const content = resolveReplacementContent(
    entity,
    text,
    services.entityRegistry,
  );
  if (typeof content !== "string") return content;
  return {
    operation: { kind: "content", content },
    ...(source ? { source } : {}),
  };
}

export function createEntityUpdateTool(services: SystemServices): Tool {
  const { entityService, logger, entityRegistry } = services;
  const confirmationGate = createConfirmationGate({
    label: "update",
    requestNoun: "the update",
  });

  const commitUpdate = async (
    input: UpdateInput,
    entity: BaseEntity,
    operation: UpdateOperation,
    context: ToolContext,
  ): Promise<ToolResponse> => {
    const gateError = confirmationGate.validateConfirmed(
      input.confirmationToken,
      input,
    );
    if (gateError) return gateError;
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
    { operation, source }: NormalizedOperation,
  ): ToolResponse => {
    // Approval replays the exact typed operation. Edits stay compact and are
    // reapplied against the reviewed content hash; a user-message source
    // replays as its pinned reference, so approval re-reads the same text.
    return {
      needsConfirmation: true,
      toolName: "system_update",
      summary: `Update "${getEntityDisplayLabel(entity)}"?`,
      completionSummary: `Updated ${humanizeEntityType(entity.entityType)}.`,
      preview: buildUpdateDiff(entity, operation, entityRegistry),
      args: confirmationGate.buildArgs((confirmationToken) => ({
        ...input,
        ...(source ? { operation: { kind: "source", source } } : {}),
        id: entity.id,
        confirmed: true,
        confirmationToken,
        contentHash: entity.contentHash,
      })),
    };
  };

  return createSystemTool(
    "update",
    "Update an entity with exactly one typed operation: fields for partial frontmatter/metadata changes, content for full replacement text you wrote, edits for exact text patches, or source for replacement text the user supplied. For small content changes, fetch the entity and use the edits operation with exact oldText/newText pairs instead of regenerating the whole document. For a large rewrite whose text the user supplied, use the source operation with exact user-message boundaries instead of copying it into content. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. For direct requests that provide exact IDs to set an existing image as an entity cover, call this tool on the target entity with the fields operation setting coverImageId to the image ID; do not stop after lookup.",
    updateInputSchema,
    async (input, context) => {
      const resolved = await resolveEntityOrError(
        entityService,
        input.entityType,
        input.id,
        logger,
        undefined,
        permissionToVisibilityScope(context.userPermissionLevel),
      );
      if (!resolved.ok) return failure(resolved.error);
      const { entity } = resolved;

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
        ? commitUpdate(input, entity, operation, context)
        : proposeUpdate(input, entity, normalized);
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
