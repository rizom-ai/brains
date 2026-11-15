import type {
  CreateFromAttachmentInput,
  CreateInput,
} from "@brains/entity-service";
import {
  buildGenerationStubEntity,
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { slugify, truncateSlug } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import { generateInputSchema } from "./schemas";
import {
  admitCreate,
  confirmOrRun,
  runCreate,
  type CreateInterceptor,
  type EntityRef,
} from "./entity-create-pipeline";
import type { SystemServices } from "./types";
import {
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  guardError,
  normalizeOptionalString,
  resolveCreateTarget,
  type FailedCreateTarget,
  type Guarded,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";

type VisibilityScope = ReturnType<typeof permissionToVisibilityScope>;

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

/**
 * Resolve a ref to an existing entity the caller can see, by id, slug or
 * title, to its canonical id. A ref that resolves to nothing is refused with
 * the given code.
 */
async function resolveEntityRef(
  services: SystemServices,
  ref: EntityRef,
  visibilityScope: VisibilityScope,
  code: string,
): Promise<Guarded<EntityRef>> {
  const result = await resolveEntityOrError(
    services.entityService,
    ref.entityType,
    ref.entityId,
    services.logger,
    undefined,
    visibilityScope,
  );
  if (!result.ok) return guardError(result.error, code);
  return { kind: "ok", value: { ...ref, entityId: result.entity.id } };
}

type GenerateSourceAttachment = Omit<CreateFromAttachmentInput, "kind">;

/** The attachment an artifact is rendered from, and what its provider makes. */
interface ResolvedSourceAttachment {
  sourceAttachment: GenerateSourceAttachment;
  metadata: NonNullable<
    ReturnType<SystemServices["attachments"]["getProviderMetadata"]>
  >;
}

async function resolveSourceAttachment(
  services: SystemServices,
  source: EntityRef,
  attachmentType: string,
  visibilityScope: VisibilityScope,
): Promise<Guarded<ResolvedSourceAttachment>> {
  const resolved = await resolveEntityRef(
    services,
    source,
    visibilityScope,
    "source-not-found",
  );
  if (resolved.kind === "error") return resolved;

  const sourceAttachment = {
    sourceEntityType: source.entityType,
    sourceEntityId: resolved.value.entityId,
    attachmentType,
  };
  if (!services.attachments.hasProvider(source.entityType, attachmentType)) {
    return guardError(
      `No attachment provider found for ${source.entityType}/${attachmentType}.`,
      "no-provider",
    );
  }

  const metadata = services.attachments.getProviderMetadata(
    source.entityType,
    attachmentType,
  );
  if (!metadata) {
    return guardError(
      `Attachment provider for ${source.entityType}/${attachmentType} is missing output metadata.`,
      "provider-missing-metadata",
    );
  }

  return { kind: "ok", value: { sourceAttachment, metadata } };
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

  const data = {
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
  };
  // A type that records who started its generation queues it itself.
  const enqueue = services.entityRegistry.getGenerationEnqueuer(
    createInput.entityType,
  );
  try {
    const jobId = enqueue
      ? await enqueue(data, toolContext)
      : await jobs.enqueue({
          type: `${createInput.entityType}:generation`,
          data,
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
  /** The operation the confirmation replays, frozen to what it resolved to. */
  operation: GenerateToolInput["operation"];
  interceptor: CreateInterceptor;
  eventContext: GenerateEventContext;
  /** The failed placeholder this generation replaces once confirmed. */
  replacesFailed?: FailedCreateTarget;
}

/** A generation as a create input, and the attachment it renders, if any. */
interface ResolvedGenerateOperation {
  createInput: CreateInput;
  sourceAttachment: GenerateSourceAttachment | undefined;
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
  visibilityScope: VisibilityScope,
): Promise<Guarded<ResolvedGenerateOperation>> {
  const title = normalizeOptionalString(operation.title);

  if (operation.kind === "prompt" || operation.kind === "prompt-from-source") {
    if (
      services.entityRegistry.getEntityTypeConfig(operation.entityType)
        .binaryStorage
    ) {
      return guardError(
        `Prompt generation does not support binary entity type '${operation.entityType}'. Use operation.kind 'attachment' for source-derived artifacts, or 'standalone-image' or 'cover-image' for generated images.`,
        "unsupported-generation",
      );
    }
    const source =
      operation.kind === "prompt-from-source"
        ? await resolveEntityRef(
            services,
            operation.source,
            visibilityScope,
            "source-not-found",
          )
        : undefined;
    if (source?.kind === "error") return source;
    return {
      kind: "ok",
      value: {
        createInput: {
          entityType: operation.entityType,
          ...(title ? { title } : {}),
          prompt: operation.prompt,
          ...(source && {
            sourceEntityType: source.value.entityType,
            sourceEntityId: source.value.entityId,
            sourceEntityIds: [source.value.entityId],
          }),
        },
        sourceAttachment: undefined,
      },
    };
  }

  if (operation.kind === "standalone-image") {
    return {
      kind: "ok",
      value: {
        createInput: {
          entityType: "image",
          ...(title ? { title } : {}),
          prompt: operation.prompt,
        },
        sourceAttachment: undefined,
      },
    };
  }

  if (operation.kind === "cover-image") {
    const target = await resolveEntityRef(
      services,
      operation.target,
      visibilityScope,
      "target-not-found",
    );
    if (target.kind === "error") return target;
    return {
      kind: "ok",
      value: {
        createInput: {
          entityType: "image",
          ...(title ? { title } : {}),
          prompt: operation.prompt,
          targetEntityType: target.value.entityType,
          targetEntityId: target.value.entityId,
        },
        sourceAttachment: undefined,
      },
    };
  }

  const resolved = await resolveSourceAttachment(
    services,
    operation.source,
    operation.attachmentType,
    visibilityScope,
  );
  if (resolved.kind === "error") return resolved;
  const { sourceAttachment, metadata } = resolved.value;
  const replace = operation.replace === true;
  return {
    kind: "ok",
    value: {
      createInput: {
        entityType: metadata.outputEntityType,
        ...(title ? { title } : {}),
        from: { kind: "entity-attachment", ...sourceAttachment },
        ...(replace && { replace }),
        ...(metadata.targetField && {
          targetEntityType: sourceAttachment.sourceEntityType,
          targetEntityId: sourceAttachment.sourceEntityId,
        }),
      },
      sourceAttachment,
    },
  };
}

async function prepareGenerate(
  services: SystemServices,
  input: GenerateToolInput,
  toolContext: GenerateToolContext,
): Promise<Guarded<PreparedGenerate>> {
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
  const { createInput, sourceAttachment } = resolved.value;

  const admitted = admitCreate(services, createInput.entityType, toolContext);
  if (admitted.kind === "error") return admitted;
  const { interceptor } = admitted.value;

  if (!createInput.prompt && !createInput.from) {
    return guardError("Provide a generation source.");
  }

  if (createInput.from && !interceptor) {
    return guardError(
      `Entity type '${createInput.entityType}' does not support attachment-based generation. Use operation.kind prompt-from-source for AI-generated content based on referenced source material, or choose an entity type with an attachment provider.`,
      "unsupported-generation",
    );
  }

  // An entity generation takes its id from its title or prompt whether or not
  // a plugin intercepts it; attachments and images derive theirs elsewhere.
  const namesEntity =
    operation.kind === "prompt" || operation.kind === "prompt-from-source";
  const target =
    interceptor && !namesEntity
      ? undefined
      : await resolveCreateTarget(
          services,
          {
            entityType: createInput.entityType,
            candidateId: createInput.prompt
              ? truncateSlug(
                  slugify(createInput.title ?? createInput.prompt),
                  100,
                )
              : createInput.title
                ? slugify(createInput.title)
                : undefined,
            replace: createInput.replace === true,
            copyHint: "generate a new copy intentionally",
          },
          toolContext,
        );
  if (target?.kind === "error") return target;

  return {
    kind: "ok",
    value: {
      createInput,
      operation: freezeGenerationOperation(
        operation,
        createInput,
        sourceAttachment,
      ),
      interceptor,
      eventContext: buildEntityMutationEventContext(toolContext),
      ...(target?.value && { replacesFailed: target.value }),
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
      const {
        createInput,
        operation,
        interceptor,
        eventContext,
        replacesFailed,
      } = prep.value;

      return confirmOrRun({
        gate: confirmationGate,
        input,
        replacesFailed,
        confirmation: () => ({
          toolName: "system_generate",
          ...buildGenerateConfirmation(createInput),
          args: { operation },
        }),
        run: () =>
          runCreate(services, toolContext, {
            createInput,
            interceptor,
            replacesFailed,
            persist: async (generation) => {
              if (!generation.prompt) {
                return {
                  success: false,
                  error:
                    "Attachment generation is supported only for entity types that explicitly handle source-derived artifacts.",
                };
              }
              return executePromptGenerate(
                services,
                generation,
                generation.prompt,
                eventContext,
                toolContext,
              );
            },
          }),
      });
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
