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

function normalizeGenerateTarget(input: {
  entityType: string;
  targetEntityType?: string | undefined;
  targetEntityId?: string | undefined;
}): { targetEntityType?: string; targetEntityId?: string } {
  const targetEntityType = normalizeOptionalString(input.targetEntityType);
  const targetEntityId = normalizeOptionalString(input.targetEntityId);
  if (!targetEntityType || !targetEntityId) return {};

  const canAttachGeneratedArtifact =
    input.entityType === "image" || input.entityType === "document";
  if (!canAttachGeneratedArtifact) return {};

  const placeholderIds = new Set(["temp", "temporary", "placeholder", "draft"]);
  if (placeholderIds.has(targetEntityId.toLowerCase())) return {};

  return { targetEntityType, targetEntityId };
}

async function resolveSourceAttachment(
  services: SystemServices,
  input:
    | {
        sourceEntityType: string;
        sourceEntityId: string;
        attachmentType: string;
      }
    | undefined,
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): Promise<typeof input> {
  if (!input) return undefined;
  const result = await resolveEntityOrError(
    services.entityService,
    input.sourceEntityType,
    input.sourceEntityId,
    services.logger,
    undefined,
    visibilityScope,
  );
  if (!result.ok) return input;
  return { ...input, sourceEntityId: result.entity.id };
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
  sourceAttachment:
    | {
        sourceEntityType: string;
        sourceEntityId: string;
        attachmentType: string;
      }
    | undefined;
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
  const unregisteredError = assertEntityTypeRegistered(
    services,
    input.entityType,
  );
  if (unregisteredError) return { kind: "error", result: unregisteredError };

  const title = normalizeOptionalString(input.title);
  const replace = input.replace === true;
  const suppliedTargetEntityType = normalizeOptionalString(
    input.targetEntityType,
  );
  const suppliedTargetEntityId = normalizeOptionalString(input.targetEntityId);
  if (!!suppliedTargetEntityType !== !!suppliedTargetEntityId) {
    return {
      kind: "error",
      result: {
        success: false,
        error:
          "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
      },
    };
  }
  const { targetEntityType, targetEntityId } = normalizeGenerateTarget({
    entityType: input.entityType,
    ...(suppliedTargetEntityType
      ? { targetEntityType: suppliedTargetEntityType }
      : {}),
    ...(suppliedTargetEntityId
      ? { targetEntityId: suppliedTargetEntityId }
      : {}),
  });
  const coverImageRequested =
    input.coverImage !== undefined && input.coverImage !== false;

  const visibilityScope = permissionToVisibilityScope(
    toolContext.userPermissionLevel,
  );
  const sourceAttachment =
    input.source.kind === "attachment"
      ? await resolveSourceAttachment(
          services,
          {
            sourceEntityType: input.source.sourceEntityType,
            sourceEntityId: input.source.sourceEntityId,
            attachmentType: input.source.attachmentType,
          },
          visibilityScope,
        )
      : undefined;

  const createInput: CreateInput = {
    entityType: input.entityType,
    ...(title && { title }),
    ...(input.source.kind === "prompt" && { prompt: input.source.prompt }),
    ...(input.source.kind === "attachment" && {
      from: {
        kind: "entity-attachment" as const,
        ...(sourceAttachment ?? {
          sourceEntityType: input.source.sourceEntityType,
          sourceEntityId: input.source.sourceEntityId,
          attachmentType: input.source.attachmentType,
        }),
      },
    }),
    ...(replace && { replace }),
    ...(targetEntityType && { targetEntityType }),
    ...(targetEntityId && { targetEntityId }),
  };

  if (coverImageRequested) {
    if (input.entityType !== "image" || !targetEntityType || !targetEntityId) {
      return {
        kind: "error",
        result: {
          success: false,
          error:
            "coverImage is only valid for generated image entities targeting an existing entity.",
        },
      };
    }
  }

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
      sourceAttachment,
      interceptor,
      eventContext: buildEntityMutationEventContext(toolContext),
    },
  };
}

function freezeGenerationSource(input: {
  source: GenerateToolInput["source"];
  resolvedSourceAttachment?: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  };
}): GenerateToolInput["source"] {
  if (input.source.kind === "attachment") {
    return {
      kind: "attachment",
      ...(input.resolvedSourceAttachment ?? {
        sourceEntityType: input.source.sourceEntityType,
        sourceEntityId: input.source.sourceEntityId,
        attachmentType: input.source.attachmentType,
      }),
    };
  }
  return input.source;
}

export function createEntityGenerateTool(services: SystemServices): Tool {
  const confirmationArgsStore = new ConfirmationArgsStore();

  return createSystemTool(
    "generate",
    "Generate a new durable entity or deterministic artifact. Requires confirmation. Use source.kind prompt for new AI-generated content/images. Use source.kind attachment for source-derived artifacts such as carousel/printable PDFs or OG/social preview images. Use system_create instead for saving/importing existing text, URLs, uploads, prior assistant responses, or raw uploaded file preservation with upload transform preserve. On the initial generation request, do not pass confirmed; the tool returns confirmation args.",
    generateInputSchema,
    async (input, toolContext) => {
      const prep = await prepareGenerate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      let { createInput } = prep.prepared;
      const { sourceAttachment, interceptor, eventContext } = prep.prepared;

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
        const confirmationSource = freezeGenerationSource({
          source: input.source,
          ...(sourceAttachment && {
            resolvedSourceAttachment: sourceAttachment,
          }),
        });
        const confirmationArgs = confirmationArgsStore.create(
          (confirmationToken) => ({
            entityType: createInput.entityType,
            ...(createInput.title && { title: createInput.title }),
            source: confirmationSource,
            ...(createInput.replace && { replace: createInput.replace }),
            ...(createInput.targetEntityType && {
              targetEntityType: createInput.targetEntityType,
            }),
            ...(createInput.targetEntityId && {
              targetEntityId: createInput.targetEntityId,
            }),
            ...(input.coverImage !== undefined &&
              input.coverImage !== false && { coverImage: input.coverImage }),
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
