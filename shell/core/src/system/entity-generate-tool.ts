import type {
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import {
  buildGenerationStubEntity,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import {
  ConfirmationArgsStore,
  type Tool,
  type ToolResponse,
} from "@brains/mcp-service";
import { slugify } from "@brains/utils";
import type { z } from "@brains/utils";
import { generateInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  assertEntityTypeRegistered,
  buildEntityMutationEventContext,
  createSystemTool,
  normalizeOptionalString,
} from "./tool-helpers";

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

type InterceptorOutcome =
  | { kind: "handled"; result: ToolResponse }
  | { kind: "error"; result: ToolResponse }
  | { kind: "continue"; createInput: CreateInput };

async function runGenerateInterceptor(
  services: SystemServices,
  interceptor: NonNullable<
    ReturnType<SystemServices["entityRegistry"]["getCreateInterceptor"]>
  >,
  createInput: CreateInput,
  toolContext: GenerateToolContext,
): Promise<InterceptorOutcome> {
  const executionContext: CreateExecutionContext = {
    interfaceType: toolContext.interfaceType,
    userId: toolContext.userId,
    ...(toolContext.channelId && { channelId: toolContext.channelId }),
    ...(toolContext.channelName && { channelName: toolContext.channelName }),
  };
  const interception = await interceptor(createInput, executionContext);
  if (interception.kind === "handled") {
    return { kind: "handled", result: interception.result };
  }

  const transformedInput = interception.input;
  const transformedPolicyError = assertEntityActionAllowed(
    services,
    transformedInput.entityType,
    "create",
    toolContext,
  );
  if (transformedPolicyError) {
    return { kind: "error", result: transformedPolicyError };
  }

  return { kind: "continue", createInput: transformedInput };
}

async function executePromptGenerate(
  services: SystemServices,
  createInput: CreateInput,
  prompt: string,
  eventContext: GenerateEventContext,
  toolContext: GenerateToolContext,
): Promise<ToolResponse> {
  const { entityService, jobs } = services;
  const proposedId = slugify(createInput.title ?? prompt).slice(0, 100);
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
      error:
        error instanceof Error
          ? error.message
          : "Failed to persist generation stub",
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
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to queue generation job",
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

  let createInput: CreateInput;
  let sourceAttachment: GenerateSourceAttachment | undefined;
  const replace = operation.kind === "attachment" && operation.replace === true;

  if (operation.kind === "prompt") {
    if (operation.entityType === "image") {
      return {
        kind: "error",
        result: {
          success: false,
          error:
            "Use operation.kind 'standalone-image' or 'cover-image' for image generation.",
          code: "unsupported-generation",
        },
      };
    }
    const source = await resolveGenerateSource(
      services,
      operation.source,
      visibilityScope,
    );
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
        error: `Entity type '${createInput.entityType}' does not support attachment-based generation. Use operation.kind prompt for AI-generated content based on referenced source material, or choose an entity type with an attachment provider.`,
        code: "unsupported-generation",
      },
    };
  }

  if (!interceptor && !replace) {
    const candidateId = createInput.prompt
      ? slugify(createInput.title ?? createInput.prompt).slice(0, 100)
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
  return {
    kind: "prompt",
    entityType: createInput.entityType,
    ...(createInput.title && { title: createInput.title }),
    ...(createInput.sourceEntityType &&
      createInput.sourceEntityId && {
        source: {
          entityType: createInput.sourceEntityType,
          entityId: createInput.sourceEntityId,
        },
      }),
    prompt: operation.prompt,
  };
}

export function createEntityGenerateTool(services: SystemServices): Tool {
  const confirmationArgsStore = new ConfirmationArgsStore();

  return createSystemTool(
    "generate",
    "Generate durable content or artifacts. Critical: for a request to generate a post/social-post/newsletter/etc. with a cover image, call only the prompt generation first; do not call standalone-image or cover-image until the target entity exists after confirmation. Critical: for broad topical prompt generation, omit operation.source; never use brain-character/profile, uploads, filenames, guessed ids, or placeholders as source refs. Requires confirmation. Calling this tool without confirmed is how you request that confirmation; do not respond with separate prose such as 'I can generate it if you want' or 'I need to queue it first.' Use operation.kind prompt for non-image AI-generated entities, with operation.source only when generating from a resolved existing durable source entity, for example a newsletter from a resolved post: { kind: 'prompt', entityType: 'newsletter', source: { entityType: 'post', entityId: '...' }, prompt: '...' }. Use standalone-image only for unattached generated images, cover-image with operation.target only for generated covers on existing entities, and attachment with operation.source for source-derived artifacts such as carousel/printable PDFs or OG/social preview images. When the user asks to create/write/draft/generate new durable content, call this tool without confirmed to request confirmation instead of asking for separate prose approval. If you first resolve a clear source entity for the requested generation, still call this tool in the same turn. Use system_create instead for saving/importing existing text, URLs, uploads, prior assistant responses, or raw uploaded file preservation with upload transform preserve. On the initial generation request, do not pass confirmed; the tool returns confirmation args.",
    generateInputSchema,
    async (input, toolContext) => {
      const prep = await prepareGenerate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      let { createInput } = prep.prepared;
      const { operation, interceptor, eventContext } = prep.prepared;

      if (input.confirmed) {
        const validation = confirmationArgsStore.validate(
          input.confirmationToken,
          input,
        );
        if (validation.status === "missing") {
          return {
            success: false,
            error:
              "No pending generate confirmation found. Please request generation again and confirm the new approval.",
          };
        }
        if (validation.status === "mismatch") {
          return {
            success: false,
            error:
              "Confirmed generate arguments do not match the pending approval. Please request generation again and confirm the new approval.",
          };
        }
      } else {
        const confirmation = buildGenerateConfirmation(createInput);
        const confirmationArgs = confirmationArgsStore.create(
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
        const outcome = await runGenerateInterceptor(
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
