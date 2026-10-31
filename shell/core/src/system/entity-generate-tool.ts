import type { CreateInput } from "@brains/entity-service";
import {
  buildGenerationStubEntity,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { slugify, truncateSlug } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import { generateInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  assertEntityTypeRegistered,
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  normalizeOptionalString,
  runCreateInterceptor,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";

function buildGenerateConfirmation(input: CreateInput): {
  summary: string;
  preview: string;
} {
  const label = input.title ? ` "${input.title}"` : ` ${input.entityType}`;
  const sourceAttachment =
    input.from?.kind === "entity-attachment" ? input.from : undefined;
  const previewParts = [
    `Entity type: ${input.entityType}`,
    ...(input.title ? [`Title: ${input.title}`] : []),
    ...(input.prompt ? [`Prompt: ${input.prompt}`] : []),
    ...(sourceAttachment
      ? [
          `Source attachment: ${sourceAttachment.sourceEntityType}/${sourceAttachment.sourceEntityId} (${sourceAttachment.attachmentType})`,
        ]
      : []),
    ...(input.targetEntityType && input.targetEntityId
      ? [`Target: ${input.targetEntityType}/${input.targetEntityId}`]
      : []),
  ];

  return { summary: `Generate${label}?`, preview: previewParts.join("\n") };
}

interface GenerateSourceAttachment {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}

async function resolveSourceAttachment(
  services: SystemServices,
  input: GenerateSourceAttachment | undefined,
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): Promise<
  | {
      kind: "ok";
      sourceAttachment: GenerateSourceAttachment | undefined;
      metadata?: NonNullable<
        ReturnType<SystemServices["attachments"]["getProviderMetadata"]>
      >;
    }
  | { kind: "error"; result: ToolResponse }
> {
  if (!input) return { kind: "ok", sourceAttachment: undefined };
  const result = await resolveEntityOrError(
    services.entityService,
    input.sourceEntityType,
    input.sourceEntityId,
    services.logger,
    undefined,
    visibilityScope,
  );
  if (!result.ok) {
    return {
      kind: "error",
      result: { success: false, error: result.error, code: "source-not-found" },
    };
  }

  const sourceAttachment = { ...input, sourceEntityId: result.entity.id };
  if (
    !services.attachments.hasProvider(
      sourceAttachment.sourceEntityType,
      sourceAttachment.attachmentType,
    )
  ) {
    return {
      kind: "error",
      result: {
        success: false,
        error: `No attachment provider found for ${sourceAttachment.sourceEntityType}/${sourceAttachment.attachmentType}.`,
        code: "no-provider",
      },
    };
  }

  const metadata = services.attachments.getProviderMetadata(
    sourceAttachment.sourceEntityType,
    sourceAttachment.attachmentType,
  );
  if (!metadata) {
    return {
      kind: "error",
      result: {
        success: false,
        error: `Attachment provider for ${sourceAttachment.sourceEntityType}/${sourceAttachment.attachmentType} is missing output metadata.`,
        code: "provider-missing-metadata",
      },
    };
  }

  return { kind: "ok", sourceAttachment, metadata };
}

interface GenerateSourceEntity {
  entityType: string;
  entityId: string;
}

async function resolveGenerateSource(
  services: SystemServices,
  input: GenerateSourceEntity | undefined,
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): Promise<
  | { kind: "ok"; source: GenerateSourceEntity | undefined }
  | { kind: "error"; result: ToolResponse }
> {
  if (!input) return { kind: "ok", source: undefined };
  const result = await resolveEntityOrError(
    services.entityService,
    input.entityType,
    input.entityId,
    services.logger,
    undefined,
    visibilityScope,
  );
  if (!result.ok) {
    return {
      kind: "error",
      result: { success: false, error: result.error, code: "source-not-found" },
    };
  }
  return {
    kind: "ok",
    source: { ...input, entityId: result.entity.id },
  };
}

interface GenerateTargetEntity {
  entityType: string;
  entityId: string;
}

async function resolveGenerateTarget(
  services: SystemServices,
  input: GenerateTargetEntity | undefined,
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): Promise<
  | { kind: "ok"; target: GenerateTargetEntity | undefined }
  | { kind: "error"; result: ToolResponse }
> {
  if (!input) return { kind: "ok", target: undefined };
  const result = await resolveEntityOrError(
    services.entityService,
    input.entityType,
    input.entityId,
    services.logger,
    undefined,
    visibilityScope,
  );
  if (!result.ok) {
    return {
      kind: "error",
      result: { success: false, error: result.error },
    };
  }
  return {
    kind: "ok",
    target: { ...input, entityId: result.entity.id },
  };
}

type GenerateToolInput = z.infer<typeof generateInputSchema>;
type GenerateToolContext = Parameters<Tool["handler"]>[1];
type GenerateEventContext = ReturnType<typeof buildEntityMutationEventContext>;

async function executePromptGenerate(
  services: SystemServices,
  createInput: CreateInput,
  prompt: string,
  eventContext: GenerateEventContext,
  toolContext: GenerateToolContext,
): Promise<ToolResponse> {
  const { entityService, jobs } = services;
  const proposedId = truncateSlug(slugify(createInput.title ?? prompt), 100);
  if (!proposedId) {
    return {
      success: false,
      error:
        "Could not derive a slug from the provided title/prompt. Provide a 'title' with at least one URL-safe character.",
    };
  }
  const stubTitle = createInput.title ?? proposedId;
  const stub = buildGenerationStubEntity(services.entityRegistry, {
    entityType: createInput.entityType,
    id: proposedId,
    title: stubTitle,
  });
  if (!stub) {
    return {
      success: false,
      error: `Entity type '${createInput.entityType}' does not support queued generation. Provide an exact source to system_create instead.`,
    };
  }

  let resolvedEntityId: string;
  try {
    const result = await entityService.createEntity({
      entity: stub,
      options: {
        deduplicateId: true,
        ...(eventContext ? { eventContext } : {}),
      },
    });
    resolvedEntityId = result.entityId;
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, "Failed to persist generation stub"),
    };
  }

  try {
    const jobId = await jobs.enqueue({
      type: `${createInput.entityType}:generation`,
      data: {
        entityId: resolvedEntityId,
        prompt,
        ...(createInput.title && { title: createInput.title }),
        ...(createInput.sourceEntityType && {
          sourceEntityType: createInput.sourceEntityType,
        }),
        ...(createInput.sourceEntityId && {
          sourceEntityId: createInput.sourceEntityId,
        }),
        ...(createInput.sourceEntityIds && {
          sourceEntityIds: createInput.sourceEntityIds,
        }),
        ...(createInput.targetEntityType && {
          targetEntityType: createInput.targetEntityType,
        }),
        ...(createInput.targetEntityId && {
          targetEntityId: createInput.targetEntityId,
        }),
      },
      toolContext,
    });
    return {
      success: true,
      data: { entityId: resolvedEntityId, status: "generating", jobId },
    };
  } catch (error) {
    // No job will ever fill the stub; left behind it would stay "generating".
    await entityService
      .deleteEntity({
        entityType: createInput.entityType,
        id: resolvedEntityId,
      })
      .catch((cleanupError: unknown) => {
        services.logger.warn("Failed to remove unqueued generation stub", {
          entityType: createInput.entityType,
          entityId: resolvedEntityId,
          error: cleanupError,
        });
      });
    return {
      success: false,
      error: getErrorMessage(error, "Failed to queue generation job"),
    };
  }
}

interface PreparedGenerate {
  createInput: CreateInput;
  operation: GenerateToolInput["operation"];
  sourceAttachment: GenerateSourceAttachment | undefined;
  interceptor: ReturnType<
    SystemServices["entityRegistry"]["getCreateInterceptor"]
  >;
  eventContext: GenerateEventContext;
}

/**
 * What each kind of generation asks for, as a create input.
 *
 * The five operation kinds differ only in where the prompt, the source and
 * the target come from; everything after this point treats them the same.
 * Separated so that adding a kind means adding a branch here rather than
 * reading a hundred lines to find where the last one ended.
 */
async function resolveGenerateOperation(
  services: SystemServices,
  operation: GenerateToolInput["operation"],
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): Promise<
  | { kind: "error"; result: ToolResponse }
  | {
      kind: "ok";
      createInput: CreateInput;
      sourceAttachment: GenerateSourceAttachment | undefined;
    }
> {
  let createInput: CreateInput;
  let sourceAttachment: GenerateSourceAttachment | undefined;
  const replace = operation.kind === "attachment" && operation.replace === true;

  if (operation.kind === "prompt" || operation.kind === "prompt-from-source") {
    if (
      services.entityRegistry.getEntityTypeConfig(operation.entityType)
        .binaryStorage
    ) {
      return {
        kind: "error",
        result: {
          success: false,
          error: `Prompt generation does not support binary entity type '${operation.entityType}'. Use operation.kind 'attachment' for source-derived artifacts, or 'standalone-image' or 'cover-image' for generated images.`,
          code: "unsupported-generation",
        },
      };
    }
    const source =
      operation.kind === "prompt-from-source"
        ? await resolveGenerateSource(
            services,
            operation.source,
            visibilityScope,
          )
        : { kind: "ok" as const, source: undefined };
    if (source.kind === "error") return source;
    const title = normalizeOptionalString(operation.title);
    createInput = {
      entityType: operation.entityType,
      ...(title ? { title } : {}),
      prompt: operation.prompt,
      ...(source.source?.entityType && {
        sourceEntityType: source.source.entityType,
      }),
      ...(source.source?.entityId && {
        sourceEntityId: source.source.entityId,
        sourceEntityIds: [source.source.entityId],
      }),
    };
  } else if (operation.kind === "standalone-image") {
    const title = normalizeOptionalString(operation.title);
    createInput = {
      entityType: "image",
      ...(title ? { title } : {}),
      prompt: operation.prompt,
    };
  } else if (operation.kind === "cover-image") {
    const target = await resolveGenerateTarget(
      services,
      operation.target,
      visibilityScope,
    );
    if (target.kind === "error") {
      const result = target.result;
      return {
        kind: "error",
        result:
          "success" in result && result.success === false
            ? { ...result, code: "target-not-found" }
            : result,
      };
    }
    const title = normalizeOptionalString(operation.title);
    createInput = {
      entityType: "image",
      ...(title ? { title } : {}),
      prompt: operation.prompt,
      ...(target.target?.entityType && {
        targetEntityType: target.target.entityType,
      }),
      ...(target.target?.entityId && {
        targetEntityId: target.target.entityId,
      }),
    };
  } else {
    const resolvedSource = await resolveSourceAttachment(
      services,
      {
        sourceEntityType: operation.source.entityType,
        sourceEntityId: operation.source.entityId,
        attachmentType: operation.attachmentType,
      },
      visibilityScope,
    );
    if (resolvedSource.kind === "error") return resolvedSource;
    sourceAttachment = resolvedSource.sourceAttachment;
    const metadata = resolvedSource.metadata;
    if (!metadata || !sourceAttachment) {
      return {
        kind: "error",
        result: {
          success: false,
          error: "Attachment generation requires provider metadata.",
          code: "provider-missing-metadata",
        },
      };
    }
    const title = normalizeOptionalString(operation.title);
    createInput = {
      entityType: metadata.outputEntityType,
      ...(title ? { title } : {}),
      from: {
        kind: "entity-attachment" as const,
        ...sourceAttachment,
      },
      ...(replace && { replace }),
      ...(metadata.targetField && {
        targetEntityType: sourceAttachment.sourceEntityType,
        targetEntityId: sourceAttachment.sourceEntityId,
      }),
    };
  }

  return { kind: "ok", createInput, sourceAttachment };
}

async function prepareGenerate(
  services: SystemServices,
  input: GenerateToolInput,
  toolContext: GenerateToolContext,
): Promise<
  | { kind: "error"; result: ToolResponse }
  | { kind: "ok"; prepared: PreparedGenerate }
> {
  const operation = input.operation;
  const visibilityScope = permissionToVisibilityScope(
    toolContext.userPermissionLevel,
  );

  const resolved = await resolveGenerateOperation(
    services,
    operation,
    visibilityScope,
  );
  if (resolved.kind === "error") return resolved;
  const { createInput, sourceAttachment } = resolved;
  const replace = operation.kind === "attachment" && operation.replace === true;

  const unregisteredError = assertEntityTypeRegistered(
    services,
    createInput.entityType,
  );
  if (unregisteredError) return { kind: "error", result: unregisteredError };

  const policyError = assertEntityActionAllowed(
    services,
    createInput.entityType,
    "create",
    toolContext,
  );
  if (policyError) return { kind: "error", result: policyError };

  const interceptor = services.entityRegistry.getCreateInterceptor(
    createInput.entityType,
  );

  if (!createInput.prompt && !createInput.from) {
    return {
      kind: "error",
      result: {
        success: false,
        error: "Provide a generation source.",
      },
    };
  }

  if (createInput.from && !interceptor) {
    return {
      kind: "error",
      result: {
        success: false,
        error: `Entity type '${createInput.entityType}' does not support attachment-based generation. Use operation.kind prompt-from-source for AI-generated content based on referenced source material, or choose an entity type with an attachment provider.`,
        code: "unsupported-generation",
      },
    };
  }

  if (!interceptor && !replace) {
    const candidateId = createInput.prompt
      ? truncateSlug(slugify(createInput.title ?? createInput.prompt), 100)
      : createInput.title
        ? slugify(createInput.title)
        : undefined;
    if (candidateId) {
      const existing = await services.entityService.getEntity({
        entityType: createInput.entityType,
        id: candidateId,
      });
      if (existing) {
        return {
          kind: "error",
          result: {
            success: false,
            error: `A ${createInput.entityType} already exists for "${candidateId}". To change its fields or status, use system_update; pass replace:true to generate a new copy intentionally.`,
          },
        };
      }
    }
  }

  return {
    kind: "ok",
    prepared: {
      createInput,
      operation: freezeGenerationOperation(
        operation,
        createInput,
        sourceAttachment,
      ),
      sourceAttachment,
      interceptor,
      eventContext: buildEntityMutationEventContext(toolContext),
    },
  };
}

function freezeGenerationOperation(
  operation: GenerateToolInput["operation"],
  createInput: CreateInput,
  resolvedSourceAttachment?: GenerateSourceAttachment,
): GenerateToolInput["operation"] {
  if (operation.kind === "attachment") {
    const sourceAttachment = resolvedSourceAttachment ?? {
      sourceEntityType: operation.source.entityType,
      sourceEntityId: operation.source.entityId,
      attachmentType: operation.attachmentType,
    };
    return {
      kind: "attachment",
      source: {
        entityType: sourceAttachment.sourceEntityType,
        entityId: sourceAttachment.sourceEntityId,
      },
      attachmentType: sourceAttachment.attachmentType,
      ...(createInput.title && { title: createInput.title }),
      ...(createInput.replace && { replace: createInput.replace }),
    };
  }
  if (operation.kind === "cover-image") {
    return {
      kind: "cover-image",
      target: {
        entityType: createInput.targetEntityType ?? operation.target.entityType,
        entityId: createInput.targetEntityId ?? operation.target.entityId,
      },
      ...(createInput.title && { title: createInput.title }),
      prompt: operation.prompt,
    };
  }
  if (operation.kind === "standalone-image") {
    return {
      kind: "standalone-image",
      ...(createInput.title && { title: createInput.title }),
      prompt: operation.prompt,
    };
  }
  if (operation.kind === "prompt-from-source") {
    return {
      kind: "prompt-from-source",
      entityType: createInput.entityType,
      ...(createInput.title && { title: createInput.title }),
      source: {
        entityType: createInput.sourceEntityType ?? operation.source.entityType,
        entityId: createInput.sourceEntityId ?? operation.source.entityId,
      },
      prompt: operation.prompt,
    };
  }
  return {
    kind: "prompt",
    entityType: createInput.entityType,
    ...(createInput.title && { title: createInput.title }),
    prompt: operation.prompt,
  };
}

export function createEntityGenerateTool(services: SystemServices): Tool {
  const confirmationGate = createConfirmationGate({
    label: "generate",
    requestNoun: "generation",
  });

  return createSystemTool(
    "generate",
    "Generate durable content or artifacts. Requires confirmation: calling this tool without confirmed is how you request it, so when the user asks to create, write, draft, or generate new durable content without supplying final exact content, call it instead of drafting the content in chat, asking for separate prose approval, or saying 'I can generate it if you want' or 'I need to queue it first'. Critical: broad or underspecified topical generation uses operation.kind prompt with no source field, also in the same turn after an optional search finds no source; preserve the user's wording as the prompt and do not stop to ask what details to highlight. Critical: to generate from an existing source such as 'my latest blog post', resolve it with read/search/list tools unless the user gives an exact entity id in quotes, then call operation.kind prompt-from-source right away, for example { kind: 'prompt-from-source', entityType: 'newsletter', source: { entityType: 'post', entityId: '...' }, prompt: '...' }. For the latest published/blog source, use system_list on that type (blog posts: entityType post) and choose the newest candidate by publishedAt, not updated/created or semantic search order; do not stop with prose like 'I found it and can generate it' or 'if that is the one you mean.' Never invent source IDs, use brain-character/profile, uploads, filenames, guessed ids, or placeholders as source refs. Turning an existing entity into another type ('turn my note X into a post') keeps its text and is not generation: call system_create with source.kind entity, also after a search resolves it. Use system_create as well for saving/importing existing text, URLs, uploads, prior assistant responses, or raw uploaded files. Critical: for a request to generate a post/social-post/newsletter/etc. with a cover image, call only the prompt generation first; call cover-image only once the target entity exists after confirmation, never guess its future id, and never use standalone-image as a substitute for a requested cover. When a cover-image request names the target's exact id in quotes or a search/get resolves a clear target, call cover-image in the same turn; do not stop after saying you found the entity. Use attachment for source-derived artifacts: attachmentType og-image for OG/social preview renders (the provider updates ogImageId), carousel for deck carousel PDFs, printable for post/project PDFs. Call it immediately for save/render requests, with replace:true for regenerate/replace/refresh, instead of saying you can queue it later. To attach a generated artifact to another entity, generate the artifact first in the same turn — do not ask whether they mean an existing artifact when the source entity is explicit or given as a quoted id such as deck `distributed-systems-primer` — and update the target only after the real artifact ID exists.",
    generateInputSchema,
    async (input, toolContext) => {
      const prep = await prepareGenerate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      let { createInput } = prep.prepared;
      const { operation, interceptor, eventContext } = prep.prepared;

      if (input.confirmed) {
        const gateError = confirmationGate.validateConfirmed(
          input.confirmationToken,
          input,
        );
        if (gateError) return gateError;
      } else {
        const confirmation = buildGenerateConfirmation(createInput);
        const confirmationArgs = confirmationGate.buildArgs(
          (confirmationToken) => ({
            operation,
            confirmed: true,
            confirmationToken,
          }),
        );
        return {
          needsConfirmation: true,
          toolName: "system_generate",
          summary: confirmation.summary,
          preview: confirmation.preview,
          args: confirmationArgs,
        };
      }

      if (interceptor) {
        const outcome = await runCreateInterceptor(
          services,
          interceptor,
          createInput,
          toolContext,
        );
        if (outcome.kind === "handled" || outcome.kind === "error") {
          return outcome.result;
        }
        createInput = outcome.createInput;
      }

      if (!createInput.prompt) {
        return {
          success: false,
          error:
            "Attachment generation is supported only for entity types that explicitly handle source-derived artifacts.",
        };
      }

      return executePromptGenerate(
        services,
        createInput,
        createInput.prompt,
        eventContext,
        toolContext,
      );
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
