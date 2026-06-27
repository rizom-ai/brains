import {
  isSavableAssistantMessage,
  parseConversationMessageMetadata,
} from "@brains/conversation-service";
import type {
  CreateCoverImageInput,
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import {
  buildGenerationStubEntity,
  canWriteVisibility,
  extractVisibilityFromMarkdown,
  hasVisibilityFrontmatter,
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
import { createInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
  assertEntityTypeRegistered,
  buildEntityMutationEventContext,
  createSystemTool,
  hasStructuredFrontmatter,
  normalizeOptionalString,
} from "./tool-helpers";

interface NormalizedCoverImageInput {
  generate: true;
  prompt?: string;
}

function normalizeCoverImageInput(
  coverImage: boolean | CreateCoverImageInput | undefined,
): NormalizedCoverImageInput | undefined {
  if (coverImage === undefined || coverImage === false) return undefined;
  if (coverImage === true) return { generate: true };

  if (coverImage.generate === false) return undefined;
  const prompt = normalizeOptionalString(coverImage.prompt);
  return {
    generate: true,
    ...(prompt && { prompt }),
  };
}

function buildCoverImagePrompt(
  coverImage: NormalizedCoverImageInput,
  title: string,
): string {
  return coverImage.prompt ?? `Editorial cover image for: ${title}. `;
}

// Reads entirely from the canonical createInput: the resolved source
// attachment is already baked into `from` by normalizeCreateSource, and
// `content` already holds the resolved prior-response/text content.
function buildCreateConfirmation(createInput: CreateInput): {
  summary: string;
  preview: string;
} {
  const { entityType, title, prompt, content, url, from } = createInput;
  const label = title ? ` "${title}"` : ` ${entityType}`;
  const summary = `${prompt ? "Generate" : "Create"}${label}?`;
  const sourceAttachment =
    from?.kind === "entity-attachment" ? from : undefined;
  const previewParts = [
    `Entity type: ${entityType}`,
    ...(title ? [`Title: ${title}`] : []),
    ...(url ? [`URL: ${url}`] : []),
    ...(from?.kind === "upload" ? ["Upload: uploaded file"] : []),
    ...(sourceAttachment
      ? [
          `Source attachment: ${sourceAttachment.sourceEntityType}/${sourceAttachment.sourceEntityId} (${sourceAttachment.attachmentType})`,
        ]
      : []),
    ...(prompt ? [`Prompt: ${prompt}`] : []),
    ...(content ? [`Content preview: ${content.slice(0, 500)}`] : []),
  ];

  return { summary, preview: previewParts.join("\n") };
}

async function enqueueCoverImageGeneration(
  services: SystemServices,
  input: {
    entityType: string;
    entityId: string;
    title: string;
    content?: string;
    coverImage: NormalizedCoverImageInput;
  },
  toolContext: Parameters<Tool["handler"]>[1],
): Promise<string> {
  return services.jobs.enqueue({
    type: "image:image-generate",
    data: {
      prompt: buildCoverImagePrompt(input.coverImage, input.title),
      title: `${input.title} Cover`,
      aspectRatio: "16:9",
      targetEntityType: input.entityType,
      targetEntityId: input.entityId,
      entityTitle: input.title,
      ...(input.content && { entityContent: input.content }),
    },
    toolContext,
  });
}

function validateCoverImageSupport(
  services: SystemServices,
  entityType: string,
): { success: false; error: string } | undefined {
  const adapter = services.entityRegistry.getAdapter(entityType);
  if (adapter.supportsCoverImage) return undefined;
  return {
    success: false,
    error: `Entity type '${entityType}' doesn't support cover images`,
  };
}

function normalizeCreateTarget(input: {
  entityType: string;
  targetEntityType?: string | undefined;
  targetEntityId?: string | undefined;
}): { targetEntityType?: string; targetEntityId?: string } {
  const targetEntityType = normalizeOptionalString(input.targetEntityType);
  const targetEntityId = normalizeOptionalString(input.targetEntityId);
  if (!targetEntityType || !targetEntityId) return {};

  const canAttachCreatedArtifact =
    input.entityType === "image" || input.entityType === "document";
  if (!canAttachCreatedArtifact) return {};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function isUploadRefInConversation(
  services: SystemServices,
  input: { kind: string; id: string },
  conversationId: string | undefined,
): Promise<boolean> {
  if (!conversationId) return false;
  const messages = await services.conversationService.getMessages(
    conversationId,
    { limit: 100 },
  );
  for (const message of messages) {
    const metadata = parseConversationMessageMetadata(message.metadata);
    const attachments = metadata?.["attachments"];
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!isRecord(attachment)) continue;
      const source = attachment["source"];
      if (!isRecord(source)) continue;
      if (source["kind"] === input.kind && source["id"] === input.id) {
        return true;
      }
    }
  }
  return false;
}

async function resolveConversationMessageContent(
  services: SystemServices,
  input: Extract<CreateInput["from"], { kind: "conversation-message" }>,
  conversationId: string | undefined,
): Promise<
  | { success: true; messageId: string; content: string }
  | { success: false; error: string }
> {
  if (!conversationId) {
    return {
      success: false,
      error:
        "Conversation message is not accessible in this conversation or does not exist.",
    };
  }

  const messages = await services.conversationService.getMessages(
    conversationId,
    { limit: 100 },
  );
  const message = input.messageId
    ? messages.find(
        (candidate) =>
          candidate.id === input.messageId && candidate.role === "assistant",
      )
    : [...messages].reverse().find(isSavableAssistantMessage);

  if (!message || !isSavableAssistantMessage(message)) {
    return {
      success: false,
      error:
        "Conversation message is not accessible in this conversation or does not exist.",
    };
  }

  return { success: true, messageId: message.id, content: message.content };
}

type CreateToolInput = z.infer<typeof createInputSchema>;

type PreferredCreateSource = CreateToolInput["source"];

interface NormalizedCreateSource {
  prompt?: string;
  content?: string;
  url?: string;
  from?: Exclude<CreateInput["from"], { kind: "conversation-message" }>;
  uploadRef?: { kind: "upload"; id: string };
  conversationMessageRef?: Extract<
    CreateInput["from"],
    { kind: "conversation-message" }
  >;
  transform?: CreateInput["transform"];
}

function normalizeCreateSource(
  source: PreferredCreateSource,
  sourceAttachment?: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  },
): { success: true; source: NormalizedCreateSource } {
  switch (source.kind) {
    case "text":
      return { success: true, source: { content: source.content } };
    case "generate":
      return { success: true, source: { prompt: source.prompt } };
    case "url":
      return { success: true, source: { url: source.url } };
    case "upload":
      return {
        success: true,
        source: {
          from: source.upload,
          uploadRef: source.upload,
          transform: source.transform,
        },
      };
    case "attachment":
      return {
        success: true,
        source: {
          from: {
            kind: "entity-attachment",
            ...(sourceAttachment ?? {
              sourceEntityType: source.sourceEntityType,
              sourceEntityId: source.sourceEntityId,
              attachmentType: source.attachmentType,
            }),
          },
        },
      };
    case "prior-response":
      return {
        success: true,
        source: {
          conversationMessageRef: {
            kind: "conversation-message",
            ...(source.messageId ? { messageId: source.messageId } : {}),
          },
        },
      };
  }
}

function freezeConfirmationSource(input: {
  source: PreferredCreateSource;
  resolvedSourceAttachment?: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  };
  resolvedMessageId?: string;
}): PreferredCreateSource {
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
  if (input.source.kind === "prior-response") {
    const messageId = input.source.messageId ?? input.resolvedMessageId;
    return {
      kind: "prior-response",
      ...(messageId ? { messageId } : {}),
    };
  }
  return input.source;
}

type CreateToolContext = Parameters<Tool["handler"]>[1];
type CreateEventContext = ReturnType<typeof buildEntityMutationEventContext>;

type InterceptorOutcome =
  | { kind: "handled"; result: ToolResponse }
  | { kind: "error"; result: ToolResponse }
  | {
      kind: "continue";
      createInput: CreateInput;
      coverImage: NormalizedCoverImageInput | undefined;
    };

/**
 * Run a plugin create interceptor. Returns the terminal response when the
 * interceptor handles the create itself (queuing cover generation if asked),
 * an error when the transformed input fails policy/cover validation, or the
 * possibly-transformed input/cover for the caller to persist directly.
 */
async function runCreateInterceptor(
  services: SystemServices,
  interceptor: NonNullable<
    ReturnType<SystemServices["entityRegistry"]["getCreateInterceptor"]>
  >,
  createInput: CreateInput,
  coverImage: NormalizedCoverImageInput | undefined,
  toolContext: CreateToolContext,
): Promise<InterceptorOutcome> {
  const executionContext: CreateExecutionContext = {
    interfaceType: toolContext.interfaceType,
    userId: toolContext.userId,
    ...(toolContext.channelId && { channelId: toolContext.channelId }),
    ...(toolContext.channelName && { channelName: toolContext.channelName }),
  };
  const interception = await interceptor(createInput, executionContext);
  if (interception.kind === "handled") {
    if (
      coverImage &&
      interception.result.success &&
      interception.result.data.status === "created" &&
      interception.result.data.entityId
    ) {
      await enqueueCoverImageGeneration(
        services,
        {
          entityType: createInput.entityType,
          entityId: interception.result.data.entityId,
          title: createInput.title ?? interception.result.data.entityId,
          ...(createInput.content && { content: createInput.content }),
          coverImage,
        },
        toolContext,
      );
    }
    return { kind: "handled", result: interception.result };
  }

  let transformedInput = interception.input;
  const transformedPolicyError = assertEntityActionAllowed(
    services,
    transformedInput.entityType,
    "create",
    toolContext,
  );
  if (transformedPolicyError) {
    return { kind: "error", result: transformedPolicyError };
  }

  const transformedCover = normalizeCoverImageInput(
    transformedInput.coverImage,
  );
  if (transformedCover) {
    const validationError = validateCoverImageSupport(
      services,
      transformedInput.entityType,
    );
    if (validationError) return { kind: "error", result: validationError };
    transformedInput = { ...transformedInput, coverImage: transformedCover };
  }

  return {
    kind: "continue",
    createInput: transformedInput,
    coverImage: transformedCover,
  };
}

/**
 * Persist a generate-source create: write a generation stub, then enqueue the
 * entity-type generation job. Returns the queued status or a structured error.
 */
async function executeGenerateCreate(
  services: SystemServices,
  createInput: CreateInput,
  prompt: string,
  coverImage: NormalizedCoverImageInput | undefined,
  eventContext: CreateEventContext,
  toolContext: CreateToolContext,
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
      error: `Entity type '${createInput.entityType}' does not support queued generate-source creation. Provide source kind "text" instead.`,
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
        ...(createInput.content && { content: createInput.content }),
        ...(createInput.targetEntityType && {
          targetEntityType: createInput.targetEntityType,
        }),
        ...(createInput.targetEntityId && {
          targetEntityId: createInput.targetEntityId,
        }),
        ...(coverImage && { coverImage }),
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

/**
 * Persist a content/text-source create directly, choosing markdown or raw
 * creation based on whether the entity type has structured frontmatter, then
 * enqueue cover-image generation if requested.
 */
async function executeDirectCreate(
  services: SystemServices,
  createInput: CreateInput,
  coverImage: NormalizedCoverImageInput | undefined,
  eventContext: CreateEventContext,
  toolContext: CreateToolContext,
): Promise<ToolResponse> {
  const { entityService, entityRegistry } = services;
  const id = slugify(
    createInput.title ?? `${createInput.entityType}-${Date.now()}`,
  );
  const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
    createInput.entityType,
  );
  try {
    const createOptions = {
      deduplicateId: true,
      ...(eventContext ? { eventContext } : {}),
    };
    const result =
      createInput.content && hasStructuredFrontmatter(frontmatterSchema)
        ? await entityService.createEntityFromMarkdown({
            input: {
              entityType: createInput.entityType,
              id,
              markdown: createInput.content,
            },
            options: createOptions,
          })
        : await entityService.createEntity({
            entity: {
              id,
              entityType: createInput.entityType,
              content: createInput.content ?? "",
              metadata: { title: createInput.title ?? id },
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            },
            options: createOptions,
          });
    if (coverImage) {
      await enqueueCoverImageGeneration(
        services,
        {
          entityType: createInput.entityType,
          entityId: result.entityId,
          title: createInput.title ?? result.entityId,
          ...(createInput.content && { content: createInput.content }),
          coverImage,
        },
        toolContext,
      );
    }

    return {
      success: true,
      data: { entityId: result.entityId, status: "created" },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create entity",
    };
  }
}

interface PreparedCreate {
  createInput: CreateInput;
  coverImage: NormalizedCoverImageInput | undefined;
  sourceAttachment:
    | {
        sourceEntityType: string;
        sourceEntityId: string;
        attachmentType: string;
      }
    | undefined;
  resolvedMessageId: string | undefined;
  interceptor: ReturnType<
    SystemServices["entityRegistry"]["getCreateInterceptor"]
  >;
  eventContext: CreateEventContext;
}

/**
 * Resolve the source, run every input/policy guard, and build the canonical
 * `createInput`. Returns a structured error response on any guard failure, or
 * the prepared create plus the small resolution metadata (source attachment,
 * resolved message id) that the confirmation/execution phases still need.
 */
async function prepareCreate(
  services: SystemServices,
  input: CreateToolInput,
  toolContext: CreateToolContext,
): Promise<
  | { kind: "error"; result: ToolResponse }
  | { kind: "ok"; prepared: PreparedCreate }
> {
  const unregisteredError = assertEntityTypeRegistered(
    services,
    input.entityType,
  );
  if (unregisteredError) return { kind: "error", result: unregisteredError };

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
  const normalizedSource = normalizeCreateSource(
    input.source,
    sourceAttachment,
  );

  const {
    prompt,
    content,
    url,
    from,
    uploadRef,
    conversationMessageRef,
    transform,
  } = normalizedSource.source;
  const resolvedConversationMessage = conversationMessageRef
    ? await resolveConversationMessageContent(
        services,
        conversationMessageRef,
        toolContext.conversationId ?? toolContext.channelId,
      )
    : undefined;
  if (resolvedConversationMessage && !resolvedConversationMessage.success) {
    return { kind: "error", result: resolvedConversationMessage };
  }
  const resolvedContent =
    resolvedConversationMessage?.success === true
      ? resolvedConversationMessage.content
      : content;
  const title = normalizeOptionalString(input.title);
  if (
    transform === "extract-markdown" &&
    (!uploadRef || input.entityType !== "note")
  ) {
    return {
      kind: "error",
      result: {
        success: false,
        error:
          'Transform "extract-markdown" requires entityType "note" and an upload ref. Omit transform for raw file promotion to document/image.',
      },
    };
  }
  const replace = input.replace === true;
  const suppliedTargetEntityType = normalizeOptionalString(
    input.targetEntityType,
  );
  const suppliedTargetEntityId = normalizeOptionalString(input.targetEntityId);
  const { targetEntityType, targetEntityId } = normalizeCreateTarget({
    entityType: input.entityType,
    ...(suppliedTargetEntityType
      ? { targetEntityType: suppliedTargetEntityType }
      : {}),
    ...(suppliedTargetEntityId
      ? { targetEntityId: suppliedTargetEntityId }
      : {}),
  });
  const coverImage = normalizeCoverImageInput(input.coverImage);

  if (!!suppliedTargetEntityType !== !!suppliedTargetEntityId)
    return {
      kind: "error",
      result: {
        success: false,
        error:
          "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
      },
    };

  if (!resolvedContent && !prompt && !url && !from)
    return {
      kind: "error",
      result: {
        success: false,
        error:
          'Provide `source` with kind "text", "generate", "url", "prior-response", "upload", or "attachment".',
      },
    };

  if (uploadRef) {
    const hasAccess = await isUploadRefInConversation(
      services,
      uploadRef,
      toolContext.conversationId ?? toolContext.channelId,
    );
    if (!hasAccess) {
      return {
        kind: "error",
        result: {
          success: false,
          error:
            "Upload ref is not accessible in this conversation or no longer exists.",
        },
      };
    }
  }

  if (resolvedContent && hasVisibilityFrontmatter(resolvedContent)) {
    const requestedVisibility = extractVisibilityFromMarkdown(resolvedContent);
    if (
      !canWriteVisibility(toolContext.userPermissionLevel, requestedVisibility)
    ) {
      return {
        kind: "error",
        result: {
          success: false,
          error: `Cannot create entity with visibility "${requestedVisibility}" — caller permission "${toolContext.userPermissionLevel ?? "public"}" is not allowed to write at that level.`,
        },
      };
    }
  }

  const eventContext = buildEntityMutationEventContext(toolContext);

  const createInput: CreateInput = {
    entityType: input.entityType,
    ...(prompt && { prompt }),
    ...(title && { title }),
    ...(resolvedContent && { content: resolvedContent }),
    ...(url && { url }),
    ...(from && { from }),
    ...(transform && { transform }),
    ...(replace && { replace }),
    ...(targetEntityType && { targetEntityType }),
    ...(targetEntityId && { targetEntityId }),
    ...(coverImage && { coverImage }),
  };

  if (coverImage) {
    const validationError = validateCoverImageSupport(
      services,
      createInput.entityType,
    );
    if (validationError) return { kind: "error", result: validationError };
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

  if (!createInput.content && !createInput.prompt && !interceptor) {
    return {
      kind: "error",
      result: {
        success: false,
        error:
          'URL, upload, or attachment source creation is supported only for entity types that explicitly handle it. Provide source kind "text" or "generate" for this entity type.',
      },
    };
  }

  // Boundary: system_create makes NEW entities. If the derived id already
  // resolves to an existing entity, the caller almost certainly wants to
  // change that entity (status/title/fields) and misrouted to create.
  // Refuse with a self-documenting error pointing to system_update rather
  // than silently minting a deduplicated copy. `replace: true` is the
  // explicit opt-in for intentionally creating a new copy. Interceptor-
  // backed types own their own id/existence handling, so skip them.
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
            error: `A ${createInput.entityType} already exists for "${candidateId}". To change its fields or status, use system_update; pass replace:true to create a new copy intentionally.`,
          },
        };
      }
    }
  }

  return {
    kind: "ok",
    prepared: {
      createInput,
      coverImage,
      sourceAttachment,
      resolvedMessageId:
        resolvedConversationMessage?.success === true
          ? resolvedConversationMessage.messageId
          : undefined,
      interceptor,
      eventContext,
    },
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const confirmationArgsStore = new ConfirmationArgsStore();

  return createSystemTool(
    "create",
    "Create a new entity. Requires confirmation. Use source to choose exactly one source: text for exact user-provided content, generate for AI generation, url for URL-first flows, prior-response for saving a previous assistant response, upload with transform extract-markdown for uploaded PDF/text/markdown/JSON note imports, or attachment for source-derived entity artifacts. Use entityType wish for explicitly saved or tracked unmet requested capabilities or outcomes. Use system_upload_save for raw uploaded file preservation. targetEntityType/targetEntityId are only for attaching a newly created image/document to an existing canonical entity; never use placeholder IDs such as temp and omit target fields for standalone images or for a new entity's own coverImage. On the initial create request, do not pass confirmed; the tool will return confirmation args after the user confirms.",
    createInputSchema,
    async (input, toolContext) => {
      const prep = await prepareCreate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      let { createInput, coverImage } = prep.prepared;
      const { sourceAttachment, resolvedMessageId, interceptor, eventContext } =
        prep.prepared;

      if (input.confirmed) {
        const token = input.confirmationToken;
        const validation = confirmationArgsStore.validate(token, input);
        if (validation.status === "missing") {
          return {
            success: false,
            error:
              "No pending create confirmation found. Please request creation again and confirm the new approval.",
          };
        }
        if (validation.status === "mismatch") {
          return {
            success: false,
            error:
              "Confirmed create arguments do not match the pending approval. Please request creation again and confirm the new approval.",
          };
        }
      } else {
        const confirmation = buildCreateConfirmation(createInput);
        const confirmationSource = freezeConfirmationSource({
          source: input.source,
          ...(sourceAttachment && {
            resolvedSourceAttachment: sourceAttachment,
          }),
          ...(resolvedMessageId && { resolvedMessageId }),
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
            ...(createInput.coverImage && {
              coverImage: createInput.coverImage,
            }),
            confirmed: true,
            confirmationToken,
          }),
        );
        return {
          needsConfirmation: true,
          toolName: "system_create",
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
          coverImage,
          toolContext,
        );
        if (outcome.kind === "handled" || outcome.kind === "error") {
          return outcome.result;
        }
        createInput = outcome.createInput;
        coverImage = outcome.coverImage;
      }

      if (!createInput.content && !createInput.prompt) {
        return {
          success: false,
          error:
            'URL, upload, or attachment source creation is supported only for entity types that explicitly handle it. Provide source kind "text" or "generate" for this entity type.',
        };
      }

      if (createInput.prompt) {
        return executeGenerateCreate(
          services,
          createInput,
          createInput.prompt,
          coverImage,
          eventContext,
          toolContext,
        );
      }

      return executeDirectCreate(
        services,
        createInput,
        coverImage,
        eventContext,
        toolContext,
      );
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
