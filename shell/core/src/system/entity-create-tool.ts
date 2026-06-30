import { isSavableAssistantMessage } from "@brains/conversation-service";
import type {
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import {
  canWriteVisibility,
  extractVisibilityFromMarkdown,
  hasVisibilityFrontmatter,
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
  isUploadRefInConversation,
  normalizeOptionalString,
} from "./tool-helpers";

// Reads entirely from the canonical createInput: the resolved source
// attachment is already baked into `from` by normalizeCreateSource, and
// `content` already holds the resolved prior-response/text content.
const uploadScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

function buildUploadPreserveConfirmation(input: {
  title?: string;
  filename: string;
  mediaType: string;
  entityType: string;
}): { summary: string; preview: string } {
  const label = input.title ? ` as "${input.title}"` : "";
  return {
    summary: `Save uploaded file${label}?`,
    preview: [
      `Filename: ${input.filename}`,
      `Media type: ${input.mediaType}`,
      `Entity type: ${input.entityType}`,
      ...(input.title ? [`Title: ${input.title}`] : []),
    ].join("\n"),
  };
}

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

function normalizeCreateSource(source: PreferredCreateSource): {
  success: true;
  source: NormalizedCreateSource;
} {
  switch (source.kind) {
    case "text":
      return { success: true, source: { content: source.content } };
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
  resolvedMessageId?: string;
}): PreferredCreateSource {
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
    };

/**
 * Run a plugin create interceptor. Returns the terminal response when the
 * interceptor handles the create itself, an error when the transformed input
 * fails policy validation, or the possibly-transformed input for direct persistence.
 */
async function runCreateInterceptor(
  services: SystemServices,
  interceptor: NonNullable<
    ReturnType<SystemServices["entityRegistry"]["getCreateInterceptor"]>
  >,
  createInput: CreateInput,
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

  return {
    kind: "continue",
    createInput: transformedInput,
  };
}

/**
 * Persist a content/text-source create directly, choosing markdown or raw
 * creation based on whether the entity type has structured frontmatter.
 */
async function executeUploadPreserve(
  input: {
    upload: { kind: "upload"; id: string };
    title?: string;
    handler: NonNullable<PreparedCreate["uploadPreserve"]>["handler"];
  },
  toolContext: CreateToolContext,
): Promise<ToolResponse> {
  const executionContext: CreateExecutionContext = {
    interfaceType: toolContext.interfaceType,
    userId: toolContext.userId,
    ...(toolContext.channelId && { channelId: toolContext.channelId }),
    ...(toolContext.channelName && {
      channelName: toolContext.channelName,
    }),
  };
  return input.handler(
    { upload: input.upload, ...(input.title && { title: input.title }) },
    executionContext,
  );
}

async function executeDirectCreate(
  services: SystemServices,
  createInput: CreateInput,
  eventContext: CreateEventContext,
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
  resolvedMessageId: string | undefined;
  interceptor: ReturnType<
    SystemServices["entityRegistry"]["getCreateInterceptor"]
  >;
  eventContext: CreateEventContext;
  uploadPreserve?: {
    upload: { kind: "upload"; id: string };
    filename: string;
    mediaType: string;
    handler: NonNullable<
      ReturnType<SystemServices["entityRegistry"]["getUploadSaveHandler"]>
    >["handler"];
  };
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
  const isUploadPreserve =
    input.source.kind === "upload" && input.source.transform === "preserve";
  if (!isUploadPreserve) {
    const unregisteredError = assertEntityTypeRegistered(
      services,
      input.entityType,
    );
    if (unregisteredError) return { kind: "error", result: unregisteredError };
  }

  const normalizedSource = normalizeCreateSource(input.source);

  const { content, url, from, uploadRef, conversationMessageRef, transform } =
    normalizedSource.source;
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

  if (!resolvedContent && !url && !from)
    return {
      kind: "error",
      result: {
        success: false,
        error:
          'Provide `source` with kind "text", "url", "prior-response", or "upload". Use system_generate for generated content or artifacts.',
      },
    };

  let uploadPreserve: PreparedCreate["uploadPreserve"];
  let derivedEntityType = input.entityType;
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

    if (transform === "preserve") {
      let uploadRecord: {
        filename: string;
        mediaType: string;
      };
      try {
        uploadRecord = await services.runtimeUploads
          .scoped(uploadScope)
          .readRecord(uploadRef.id);
      } catch {
        return {
          kind: "error",
          result: { success: false, error: "Upload ref not found" },
        };
      }

      const registration = services.entityRegistry.getUploadSaveHandler(
        uploadRecord.mediaType,
      );
      if (!registration) {
        return {
          kind: "error",
          result: {
            success: false,
            error: `No installed plugin can save uploads with media type "${uploadRecord.mediaType}".`,
          },
        };
      }

      derivedEntityType = registration.entityType;
      uploadPreserve = {
        upload: uploadRef,
        filename: uploadRecord.filename,
        mediaType: uploadRecord.mediaType,
        handler: registration.handler,
      };
    }
  }

  const unregisteredDerivedError = assertEntityTypeRegistered(
    services,
    derivedEntityType,
  );
  if (unregisteredDerivedError) {
    return { kind: "error", result: unregisteredDerivedError };
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
    entityType: derivedEntityType,
    ...(title && { title }),
    ...(resolvedContent && { content: resolvedContent }),
    ...(url && { url }),
    ...(from && { from }),
    ...(transform && { transform }),
    ...(replace && { replace }),
  };

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

  if (!createInput.content && !interceptor && !uploadPreserve) {
    return {
      kind: "error",
      result: {
        success: false,
        error:
          'URL or upload source creation is supported only for entity types that explicitly handle it. Provide source kind "text" for this entity type, or use system_generate for generated content/artifacts.',
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
    const candidateId = createInput.title
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
      resolvedMessageId:
        resolvedConversationMessage?.success === true
          ? resolvedConversationMessage.messageId
          : undefined,
      interceptor,
      eventContext,
      ...(uploadPreserve && { uploadPreserve }),
    },
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const confirmationArgsStore = new ConfirmationArgsStore();

  return createSystemTool(
    "create",
    "Create a new entity from existing material. Requires confirmation. Use source to choose exactly one concrete source: text for exact user-provided content, url for URL-first flows, prior-response for saving a previous assistant response, or upload with transform extract-markdown to import text into a note or transform preserve to save raw uploaded bytes as their durable file entity. Use system_generate for AI generation, generated images, cover images, and source-derived artifacts such as carousel/printable PDFs or OG images. If the user includes content in the same direct save request, use source.kind text with that content instead of asking them to paste it again; for example, 'Save this as a note: ...' already supplies the content. If the user says save it after your immediately preceding upload summary/answer, use entityType note with source.kind prior-response unless they explicitly ask to save the uploaded file/document itself. Use entityType wish for explicitly saved or tracked unmet requested capabilities or outcomes. On the initial create request, do not pass confirmed; the tool will return confirmation args after the user confirms.",
    createInputSchema,
    async (input, toolContext) => {
      const prep = await prepareCreate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      let { createInput } = prep.prepared;
      const { resolvedMessageId, interceptor, eventContext, uploadPreserve } =
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
        const confirmation = uploadPreserve
          ? buildUploadPreserveConfirmation({
              ...(createInput.title && { title: createInput.title }),
              filename: uploadPreserve.filename,
              mediaType: uploadPreserve.mediaType,
              entityType: createInput.entityType,
            })
          : buildCreateConfirmation(createInput);
        const confirmationSource = freezeConfirmationSource({
          source: input.source,
          ...(resolvedMessageId && { resolvedMessageId }),
        });
        const confirmationArgs = confirmationArgsStore.create(
          (confirmationToken) => ({
            entityType: createInput.entityType,
            ...(createInput.title && { title: createInput.title }),
            source: confirmationSource,
            ...(createInput.replace && { replace: createInput.replace }),
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
      if (uploadPreserve) {
        return executeUploadPreserve(
          {
            upload: uploadPreserve.upload,
            ...(createInput.title && { title: createInput.title }),
            handler: uploadPreserve.handler,
          },
          toolContext,
        );
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

      if (!createInput.content) {
        return {
          success: false,
          error:
            'URL or upload source creation is supported only for entity types that explicitly handle it. Provide source kind "text" for this entity type, or use system_generate for generated content/artifacts.',
        };
      }

      return executeDirectCreate(services, createInput, eventContext);
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
