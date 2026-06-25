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
import type { Tool } from "@brains/mcp-service";
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

function buildCreateConfirmation(input: {
  entityType: string;
  title?: string;
  prompt?: string;
  content?: string;
  url?: string;
  upload?: { kind: string; id: string };
  sourceAttachment?: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  };
}): { summary: string; preview: string } {
  const label = input.title ? ` "${input.title}"` : ` ${input.entityType}`;
  const summary = `${input.prompt ? "Generate" : "Create"}${label}?`;
  const previewParts = [
    `Entity type: ${input.entityType}`,
    ...(input.title ? [`Title: ${input.title}`] : []),
    ...(input.url ? [`URL: ${input.url}`] : []),
    ...(input.upload ? ["Upload: uploaded file"] : []),
    ...(input.sourceAttachment
      ? [
          `Source attachment: ${input.sourceAttachment.sourceEntityType}/${input.sourceAttachment.sourceEntityId} (${input.sourceAttachment.attachmentType})`,
        ]
      : []),
    ...(input.prompt ? [`Prompt: ${input.prompt}`] : []),
    ...(input.content
      ? [`Content preview: ${input.content.slice(0, 500)}`]
      : []),
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
  { success: true; content: string } | { success: false; error: string }
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

  return { success: true, content: message.content };
}

type CreateToolInput = z.infer<typeof createInputSchema>;

type PreferredCreateSource = NonNullable<CreateToolInput["source"]>;

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

function normalizeConversationMessageRef(
  input:
    | Extract<CreateInput["from"], { kind: "conversation-message" }>
    | undefined,
): Extract<CreateInput["from"], { kind: "conversation-message" }> | undefined {
  if (!input) return undefined;
  const rawMessageId = normalizeOptionalString(input.messageId);
  const messageId = rawMessageId?.toLowerCase();
  if (
    !messageId ||
    messageId === "latest" ||
    messageId === ":latest" ||
    messageId === "current" ||
    messageId === ":current" ||
    messageId === "auto" ||
    messageId === ":auto" ||
    messageId.includes("/latest") ||
    messageId.includes("/current") ||
    messageId.endsWith("/messages/auto")
  ) {
    return { kind: "conversation-message" };
  }
  return { kind: "conversation-message", messageId: rawMessageId };
}

function getPreferredSourceConflicts(input: CreateToolInput): string[] {
  if (!input.source) return [];
  return [
    normalizeOptionalString(input.content) ? "content" : undefined,
    normalizeOptionalString(input.prompt) ? "prompt" : undefined,
    normalizeOptionalString(input.url) ? "url" : undefined,
    input.from ? "from" : undefined,
    input.upload ? "upload" : undefined,
    normalizeOptionalString(input.transform) ? "transform" : undefined,
    input.sourceAttachment ? "sourceAttachment" : undefined,
  ].filter((field): field is string => field !== undefined);
}

function expandPreferredSource(input: CreateToolInput): CreateToolInput {
  if (!input.source) return input;
  const { source, ...rest } = input;
  switch (source.kind) {
    case "text":
      return { ...rest, content: source.content };
    case "generate":
      return { ...rest, prompt: source.prompt };
    case "url":
      return { ...rest, url: source.url };
    case "upload":
      return { ...rest, upload: source.upload, transform: source.transform };
    case "attachment":
      return {
        ...rest,
        sourceAttachment: {
          sourceEntityType: source.sourceEntityType,
          sourceEntityId: source.sourceEntityId,
          attachmentType: source.attachmentType,
        },
      };
    case "prior-response":
      return {
        ...rest,
        from: {
          kind: "conversation-message",
          ...(source.messageId ? { messageId: source.messageId } : {}),
        },
      };
  }
}

function toPreferredSource(
  input: CreateInput,
): PreferredCreateSource | undefined {
  if (input.content) return { kind: "text", content: input.content };
  if (input.prompt) return { kind: "generate", prompt: input.prompt };
  if (input.url) return { kind: "url", url: input.url };
  if (!input.from) return undefined;
  if (input.from.kind === "upload" && input.transform === "extract-markdown") {
    return {
      kind: "upload",
      upload: input.from,
      transform: "extract-markdown",
    };
  }
  if (input.from.kind === "entity-attachment") {
    return {
      kind: "attachment",
      sourceEntityType: input.from.sourceEntityType,
      sourceEntityId: input.from.sourceEntityId,
      attachmentType: input.from.attachmentType,
    };
  }
  return undefined;
}

function getConversationMessageSourceConflicts(input: {
  prompt?: string | undefined;
  content?: string | undefined;
  url?: string | undefined;
  upload?: { kind: "upload"; id: string } | undefined;
  from?:
    | Extract<CreateInput["from"], { kind: "conversation-message" }>
    | undefined;
  sourceAttachment?:
    | {
        sourceEntityType: string;
        sourceEntityId: string;
        attachmentType: string;
      }
    | undefined;
}): string[] {
  if (!input.from) return [];
  return [
    normalizeOptionalString(input.content) ? "content" : undefined,
    normalizeOptionalString(input.prompt) ? "prompt" : undefined,
    normalizeOptionalString(input.url) ? "url" : undefined,
    input.upload ? "upload" : undefined,
    input.sourceAttachment ? "sourceAttachment" : undefined,
  ].filter((field): field is string => field !== undefined);
}

function normalizeCreateSource(input: {
  prompt?: string | undefined;
  content?: string | undefined;
  url?: string | undefined;
  upload?: { kind: "upload"; id: string } | undefined;
  from?:
    | Extract<CreateInput["from"], { kind: "conversation-message" }>
    | undefined;
  sourceAttachment?:
    | {
        sourceEntityType: string;
        sourceEntityId: string;
        attachmentType: string;
      }
    | undefined;
  transform?: string | undefined;
}):
  | { success: true; source: NormalizedCreateSource }
  | { success: false; error: string } {
  const prompt = normalizeOptionalString(input.prompt);
  const content = normalizeOptionalString(input.content);
  const url = normalizeOptionalString(input.url);
  const conversationMessageRef = normalizeConversationMessageRef(input.from);
  const promptForDirectSource = conversationMessageRef ? undefined : prompt;
  const urlForDirectSource = conversationMessageRef ? undefined : url;
  const contentForDirectSource = conversationMessageRef ? undefined : content;
  const hasDirectSource = Boolean(
    contentForDirectSource ?? promptForDirectSource ?? urlForDirectSource,
  );
  const uploadRef =
    input.sourceAttachment || hasDirectSource || conversationMessageRef
      ? undefined
      : input.upload;
  const from: NormalizedCreateSource["from"] = input.sourceAttachment
    ? { kind: "entity-attachment", ...input.sourceAttachment }
    : uploadRef;
  const rawTransform = normalizeOptionalString(input.transform);
  const transform =
    conversationMessageRef || (hasDirectSource && input.upload)
      ? undefined
      : rawTransform;

  if (transform !== undefined && transform !== "extract-markdown") {
    return {
      success: false,
      error:
        'Unsupported transform. Use "extract-markdown" only for upload-to-note imports, or omit transform.',
    };
  }

  return {
    success: true,
    source: {
      ...(promptForDirectSource && { prompt: promptForDirectSource }),
      ...(contentForDirectSource && { content: contentForDirectSource }),
      ...(urlForDirectSource && { url: urlForDirectSource }),
      ...(from && { from }),
      ...(uploadRef && { uploadRef }),
      ...(conversationMessageRef && { conversationMessageRef }),
      ...(transform && { transform }),
    },
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const { entityService, jobs, entityRegistry } = services;
  const pendingConfirmationTokens = new Set<string>();

  return createSystemTool(
    "create",
    "Create a new entity. Requires confirmation. Use source to choose exactly one source: text for exact user-provided content, generate for AI generation, url for URL-first flows, prior-response for saving a previous assistant response, upload with transform extract-markdown for uploaded PDF/text/markdown/JSON note imports, or attachment for source-derived entity artifacts. Use system_upload_save for raw uploaded file preservation. On the initial create request, do not pass confirmed; the tool will return confirmation args after the user confirms.",
    createInputSchema,
    async (rawInput, toolContext) => {
      const preferredSourceConflicts = getPreferredSourceConflicts(rawInput);
      if (preferredSourceConflicts.length > 0) {
        return {
          success: false,
          error: `source cannot be combined with transitional flat source fields: ${preferredSourceConflicts.join(", ")}. Use source or flat source fields, not both.`,
        };
      }

      const input = expandPreferredSource(rawInput);
      const conversationMessageSourceConflicts =
        getConversationMessageSourceConflicts(input);
      if (conversationMessageSourceConflicts.length > 0) {
        return {
          success: false,
          error: `A conversation-message source cannot be combined with other source fields: ${conversationMessageSourceConflicts.join(", ")}. Use either from to save a prior assistant response, or one of content, prompt, url, upload, or sourceAttachment.`,
        };
      }

      const visibilityScope = permissionToVisibilityScope(
        toolContext.userPermissionLevel,
      );
      const sourceAttachment = await resolveSourceAttachment(
        services,
        input.sourceAttachment,
        visibilityScope,
      );
      const normalizedSource = normalizeCreateSource({
        ...input,
        sourceAttachment,
      });
      if (!normalizedSource.success) return normalizedSource;

      const unregisteredError = assertEntityTypeRegistered(
        services,
        input.entityType,
      );
      if (unregisteredError) return unregisteredError;

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
        return resolvedConversationMessage;
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
          success: false,
          error:
            'Transform "extract-markdown" requires entityType "note" and an upload ref. Omit transform for raw file promotion to document/image.',
        };
      }
      const replace = input.replace === true;
      const targetEntityType = normalizeOptionalString(input.targetEntityType);
      const targetEntityId = normalizeOptionalString(input.targetEntityId);
      let coverImage = normalizeCoverImageInput(input.coverImage);

      if (!!targetEntityType !== !!targetEntityId)
        return {
          success: false,
          error:
            "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
        };

      if (!resolvedContent && !prompt && !url && !from)
        return {
          success: false,
          error:
            'Provide `source` with kind "text", "generate", "url", "prior-response", "upload", or "attachment".',
        };

      if (uploadRef) {
        const hasAccess = await isUploadRefInConversation(
          services,
          uploadRef,
          toolContext.conversationId ?? toolContext.channelId,
        );
        if (!hasAccess) {
          return {
            success: false,
            error:
              "Upload ref is not accessible in this conversation or no longer exists.",
          };
        }
      }

      if (resolvedContent && hasVisibilityFrontmatter(resolvedContent)) {
        const requestedVisibility =
          extractVisibilityFromMarkdown(resolvedContent);
        if (
          !canWriteVisibility(
            toolContext.userPermissionLevel,
            requestedVisibility,
          )
        ) {
          return {
            success: false,
            error: `Cannot create entity with visibility "${requestedVisibility}" — caller permission "${toolContext.userPermissionLevel ?? "public"}" is not allowed to write at that level.`,
          };
        }
      }

      const eventContext = buildEntityMutationEventContext(toolContext);

      let createInput: CreateInput = {
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
        if (validationError) return validationError;
      }

      const policyError = assertEntityActionAllowed(
        services,
        createInput.entityType,
        "create",
        toolContext,
      );
      if (policyError) return policyError;

      const interceptor = services.entityRegistry.getCreateInterceptor(
        createInput.entityType,
      );

      if (!createInput.content && !createInput.prompt && !interceptor) {
        return {
          success: false,
          error:
            'URL, upload, or attachment source creation is supported only for entity types that explicitly handle it. Provide source kind "text" or "generate" for this entity type.',
        };
      }

      if (input.confirmed) {
        const token = input.confirmationToken;
        if (!token || !pendingConfirmationTokens.has(token)) {
          return {
            success: false,
            error:
              "No pending create confirmation found. Please request creation again and confirm the new approval.",
          };
        }
        pendingConfirmationTokens.delete(token);
      } else {
        const confirmationToken = crypto.randomUUID();
        pendingConfirmationTokens.add(confirmationToken);
        const confirmation = buildCreateConfirmation({
          entityType: input.entityType,
          ...(title && { title }),
          ...(prompt && { prompt }),
          ...(resolvedContent && { content: resolvedContent }),
          ...(url && { url }),
          ...(uploadRef && { upload: uploadRef }),
          ...(sourceAttachment && {
            sourceAttachment,
          }),
        });
        const confirmationSource = toPreferredSource(createInput);
        const transitionalFlatSourceFallback = confirmationSource
          ? {}
          : {
              ...(createInput.prompt && { prompt: createInput.prompt }),
              ...(createInput.content && { content: createInput.content }),
              ...(createInput.url && { url: createInput.url }),
              ...(uploadRef && { upload: uploadRef }),
              ...(sourceAttachment && { sourceAttachment }),
              ...(createInput.transform && {
                transform: createInput.transform,
              }),
            };
        const confirmationArgs = {
          entityType: createInput.entityType,
          ...(createInput.title && { title: createInput.title }),
          ...(confirmationSource
            ? { source: confirmationSource }
            : transitionalFlatSourceFallback),
          ...(createInput.replace && { replace: createInput.replace }),
          ...(createInput.targetEntityType && {
            targetEntityType: createInput.targetEntityType,
          }),
          ...(createInput.targetEntityId && {
            targetEntityId: createInput.targetEntityId,
          }),
          ...(createInput.coverImage && { coverImage: createInput.coverImage }),
          confirmed: true,
          confirmationToken,
        };
        return {
          needsConfirmation: true,
          toolName: "system_create",
          summary: confirmation.summary,
          preview: confirmation.preview,
          args: confirmationArgs,
        };
      }
      if (interceptor) {
        const executionContext: CreateExecutionContext = {
          interfaceType: toolContext.interfaceType,
          userId: toolContext.userId,
          ...(toolContext.channelId && { channelId: toolContext.channelId }),
          ...(toolContext.channelName && {
            channelName: toolContext.channelName,
          }),
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
          return interception.result;
        }
        createInput = interception.input;
        const transformedPolicyError = assertEntityActionAllowed(
          services,
          createInput.entityType,
          "create",
          toolContext,
        );
        if (transformedPolicyError) return transformedPolicyError;

        coverImage = normalizeCoverImageInput(createInput.coverImage);
        if (coverImage) {
          const validationError = validateCoverImageSupport(
            services,
            createInput.entityType,
          );
          if (validationError) return validationError;
          createInput = { ...createInput, coverImage };
        }
      }

      if (!createInput.content && !createInput.prompt) {
        return {
          success: false,
          error:
            'URL, upload, or attachment source creation is supported only for entity types that explicitly handle it. Provide source kind "text" or "generate" for this entity type.',
        };
      }

      if (createInput.prompt) {
        const proposedId = slugify(
          createInput.title ?? createInput.prompt,
        ).slice(0, 100);
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
              prompt: createInput.prompt,
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
            data: {
              entityId: resolvedEntityId,
              status: "generating",
              jobId,
            },
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
          error:
            error instanceof Error ? error.message : "Failed to create entity",
        };
      }
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
