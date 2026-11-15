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
import { entityActionRefusal } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  getEntityDisplayLabel,
  guardError,
  guardRefusal,
  normalizeOptionalString,
  resolveCreateTarget,
  type FailedCreateTarget,
  type Guarded,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";

type VisibilityScope = ReturnType<typeof permissionToVisibilityScope>;

/**
 * The entities a generation is written from, one type and one or more
 * entries, as its confirmation names them. `usedUp` when the generated
 * type's generation removes them once saved.
 */
interface WrittenFrom {
  entityType: string;
  entries: readonly { entityId: string; label: string }[];
  usedUp: boolean;
}

/** Quoted names as a sentence lists them: "A", "B" and "C". */
function quotedList(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length <= 1
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`;
}

/** The names of the entries a generation is written from, as a sentence lists them. */
function namesOf(writtenFrom: WrittenFrom): string {
  return quotedList(writtenFrom.entries.map(({ label }) => label));
}

function buildGenerateConfirmation(
  input: CreateInput,
  writtenFrom: WrittenFrom | undefined,
  statedPrompt: string | undefined,
): {
  summary: string;
  /** What is reported once the caller confirms, when the question would misread. */
  completionSummary?: string;
  preview: string;
} {
  const label = input.title ? ` "${input.title}"` : ` ${input.entityType}`;
  const sourceAttachment =
    input.from?.kind === "entity-attachment" ? input.from : undefined;
  // What a generation removes is said where the caller agrees to it.
  const removed = writtenFrom?.usedUp ? writtenFrom : undefined;
  const previewParts = [
    `Entity type: ${input.entityType}`,
    ...(input.title ? [`Title: ${input.title}`] : []),
    // A prompt the tool wrote for a caller who gave none is not theirs.
    ...(statedPrompt ? [`Prompt: ${statedPrompt}`] : []),
    ...(removed?.entries.map(
      ({ entityId }) => `Removes: ${removed.entityType}/${entityId}`,
    ) ?? []),
    ...(sourceAttachment
      ? [
          `Source attachment: ${sourceAttachment.sourceEntityType}/${sourceAttachment.sourceEntityId} (${sourceAttachment.attachmentType})`,
        ]
      : []),
    ...(input.targetEntityType && input.targetEntityId
      ? [`Target: ${input.targetEntityType}/${input.targetEntityId}`]
      : []),
  ];

  return {
    summary: removed
      ? `Generate${label} from ${namesOf(removed)}? ${
          removed.entries.length === 1 ? "It" : "They"
        } will be removed.`
      : `Generate${label}?`,
    // Confirming queues the generation; its sources go once it is saved.
    ...(removed && {
      completionSummary: `Generating${label} from ${namesOf(removed)}, which will be removed once it is saved.`,
    }),
    preview: previewParts.join("\n"),
  };
}

/**
 * The entries a generation is written from, each resolved as its caller may
 * see it and named once, in the order given. One that is not there, or not
 * visible, answers not found for the whole request.
 */
async function resolveGenerateSources(
  services: SystemServices,
  entityType: string,
  ids: readonly string[],
  visibilityScope: VisibilityScope,
): Promise<Guarded<WrittenFrom["entries"]>> {
  const resolved = await Promise.all(
    ids.map((id) =>
      resolveEntityOrError(
        services.entityService,
        entityType,
        id,
        services.logger,
        undefined,
        visibilityScope,
      ),
    ),
  );
  const missing = resolved.find((result) => !result.ok);
  if (missing) return guardError(missing.error, "source-not-found");
  const entries = resolved.flatMap((result) =>
    result.ok
      ? [
          {
            entityId: result.entity.id,
            label: getEntityDisplayLabel(result.entity),
          },
        ]
      : [],
  );
  return {
    kind: "ok",
    value: entries.filter(
      ({ entityId }, index) =>
        entries.findIndex((entry) => entry.entityId === entityId) === index,
    ),
  };
}

/** The source types a type's generation uses up, none for most types. */
function usedUpBy(
  services: SystemServices,
  entityType: string,
): readonly string[] {
  return (
    services.entityRegistry.getEntityTypeConfig(entityType).consumesSources ??
    []
  );
}

/**
 * Why a generation may not be asked for, when its type uses up what it is
 * written from: asked for with no source, with a source of a type it does
 * not use up, or by a caller who may not delete the source. Checked before
 * the source is read, so a caller who may not delete learns nothing else.
 */
function usedUpSourceRefusal(
  services: SystemServices,
  operation: GenerateToolInput["operation"],
  toolContext: GenerateToolContext,
): ToolResponse | undefined {
  if (operation.kind !== "prompt" && operation.kind !== "prompt-from-source") {
    return undefined;
  }
  const usedUp = usedUpBy(services, operation.entityType);
  if (usedUp.length === 0) return undefined;
  const writtenFrom = `A ${operation.entityType} is written from ${usedUp.join(" or ")} entries`;
  if (operation.kind === "prompt") {
    return {
      success: false,
      error: `${writtenFrom}. Use operation.kind prompt-from-source and name the source.`,
      code: "unsupported-generation",
    };
  }
  if (!usedUp.includes(operation.source.entityType)) {
    return {
      success: false,
      error: `${writtenFrom}, and '${operation.source.entityType}' is not one of them.`,
      code: "unsupported-generation",
    };
  }
  return entityActionRefusal(
    services,
    operation.source.entityType,
    "delete",
    toolContext,
  );
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
  unpromptedName: string | undefined,
  eventContext: GenerateEventContext,
  toolContext: GenerateToolContext,
): Promise<ToolResponse> {
  const { entityService, jobs } = services;
  const proposedId = truncateSlug(
    slugify(generationIdSeed(createInput, unpromptedName, prompt)),
    100,
  );
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
  /** The entities a prompt generation is written from, when it names any. */
  writtenFrom: WrittenFrom | undefined;
  /**
   * What names the entity when its caller stated no prompt: the id of the
   * first entity it is written from. Unset when a prompt was stated.
   */
  unpromptedName: string | undefined;
}

/**
 * What a prompt generation's id is taken from: its title, else the entity
 * it is written from when its caller stated no prompt, else its prompt.
 */
function generationIdSeed(
  createInput: CreateInput,
  unpromptedName: string | undefined,
  prompt: string,
): string {
  return createInput.title ?? unpromptedName ?? prompt;
}

/** A generation as a create input, and the attachment it renders, if any. */
interface ResolvedGenerateOperation {
  createInput: CreateInput;
  sourceAttachment: GenerateSourceAttachment | undefined;
  writtenFrom: WrittenFrom | undefined;
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
    const sources =
      operation.kind === "prompt-from-source"
        ? await resolveGenerateSources(
            services,
            operation.source.entityType,
            [
              operation.source.entityId,
              ...(operation.additionalSourceIds ?? []),
            ],
            visibilityScope,
          )
        : undefined;
    if (sources?.kind === "error") return sources;
    const writtenFrom: WrittenFrom | undefined =
      operation.kind === "prompt-from-source" && sources
        ? {
            entityType: operation.source.entityType,
            entries: sources.value,
            usedUp: usedUpBy(services, operation.entityType).includes(
              operation.source.entityType,
            ),
          }
        : undefined;
    const [first] = writtenFrom?.entries ?? [];
    return {
      kind: "ok",
      value: {
        createInput: {
          entityType: operation.entityType,
          ...(title ? { title } : {}),
          // A caller who gives no direction asks for the source to be
          // written up.
          prompt:
            operation.prompt ??
            `Write a ${operation.entityType} from ${writtenFrom ? namesOf(writtenFrom) : ""}.`,
          ...(writtenFrom &&
            first && {
              sourceEntityType: writtenFrom.entityType,
              sourceEntityId: first.entityId,
              sourceEntityIds: writtenFrom.entries.map(
                ({ entityId }) => entityId,
              ),
            }),
        },
        sourceAttachment: undefined,
        writtenFrom,
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
        writtenFrom: undefined,
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
        writtenFrom: undefined,
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
      writtenFrom: undefined,
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

  const usedUpRefusal = usedUpSourceRefusal(services, operation, toolContext);
  if (usedUpRefusal) return guardRefusal(usedUpRefusal);

  const resolved = await resolveGenerateOperation(
    services,
    operation,
    visibilityScope,
  );
  if (resolved.kind === "error") return resolved;
  const { createInput, sourceAttachment, writtenFrom } = resolved.value;
  // Named after its first source only when its caller stated no prompt:
  // by that source's id, the name it was saved under, since a title its
  // text supplies (a plain note's first line) makes a poor id.
  const unpromptedName =
    "prompt" in operation && operation.prompt !== undefined
      ? undefined
      : writtenFrom?.entries[0]?.entityId;

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
                  slugify(
                    generationIdSeed(
                      createInput,
                      unpromptedName,
                      createInput.prompt,
                    ),
                  ),
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
      writtenFrom,
      unpromptedName,
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
      // The further sources as they were resolved, so the confirmed call
      // names what the confirmation named.
      ...((createInput.sourceEntityIds?.length ?? 0) > 1 && {
        additionalSourceIds: createInput.sourceEntityIds?.slice(1),
      }),
      // Only a prompt the caller stated: the tool writes one for the rest.
      ...(operation.prompt !== undefined && { prompt: operation.prompt }),
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
        writtenFrom,
        unpromptedName,
      } = prep.value;

      return confirmOrRun({
        gate: confirmationGate,
        input,
        replacesFailed,
        confirmation: () => ({
          toolName: "system_generate",
          ...buildGenerateConfirmation(
            createInput,
            writtenFrom,
            "prompt" in operation ? operation.prompt : undefined,
          ),
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
                unpromptedName,
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
