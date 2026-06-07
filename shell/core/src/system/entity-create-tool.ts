import type {
  BaseEntity,
  CreateCoverImageInput,
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import {
  canWriteVisibility,
  extractVisibilityFromMarkdown,
  hasVisibilityFrontmatter,
} from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { slugify } from "@brains/utils";
import { createInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import type { SystemServices } from "./types";
import {
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

function buildGenerationStubEntity(
  services: SystemServices,
  input: { entityType: string; id: string; title: string },
): BaseEntity | undefined {
  const adapter = services.entityRegistry.getAdapter(input.entityType);
  if (!adapter.buildStub) return undefined;

  const stub = adapter.buildStub({ id: input.id, title: input.title });
  const now = new Date().toISOString();
  return {
    id: input.id,
    entityType: input.entityType,
    content: stub.content,
    metadata: stub.metadata as Record<string, unknown>,
    visibility: "public",
    created: now,
    updated: now,
    contentHash: "",
  };
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

function parseMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(metadata) ? metadata : null;
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
    const metadata = parseMessageMetadata(message.metadata);
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

export function createEntityCreateTool(services: SystemServices): Tool {
  const { entityService, jobs, entityRegistry } = services;

  return createSystemTool(
    "create",
    "Create a new entity. Provide content for direct creation, a prompt for AI generation, a url for URL-first flows, upload for runtime upload promotion, or sourceAttachment for source attachment saves.",
    createInputSchema,
    async (input, toolContext) => {
      const prompt = normalizeOptionalString(input.prompt);
      const content = normalizeOptionalString(input.content);
      const title = normalizeOptionalString(input.title);
      const url = normalizeOptionalString(input.url);
      const uploadRef = input.upload;
      const from: CreateInput["from"] =
        uploadRef ??
        (input.sourceAttachment
          ? { kind: "entity-attachment", ...input.sourceAttachment }
          : undefined);
      const requestedTransform = normalizeOptionalString(input.transform);
      if (
        requestedTransform !== undefined &&
        requestedTransform !== "extract-markdown"
      ) {
        return {
          success: false,
          error:
            'Unsupported transform. Use "extract-markdown" only for upload-to-note imports, or omit transform.',
        };
      }
      if (
        requestedTransform === "extract-markdown" &&
        (!uploadRef || input.entityType !== "base")
      ) {
        return {
          success: false,
          error:
            'Transform "extract-markdown" requires entityType "base" and an upload ref. Omit transform for raw file promotion to document/image.',
        };
      }
      const transform: CreateInput["transform"] = requestedTransform;
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

      if (!content && !prompt && !url && !from)
        return {
          success: false,
          error:
            "Provide 'content' (direct create), 'prompt' (AI generation), 'url' (URL-first create), 'upload' (runtime upload promotion), or 'sourceAttachment' (source attachment create), or a supported combination.",
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

      if (content && hasVisibilityFrontmatter(content)) {
        const requestedVisibility = extractVisibilityFromMarkdown(content);
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

      let createInput: CreateInput = {
        entityType: input.entityType,
        ...(prompt && { prompt }),
        ...(title && { title }),
        ...(content && { content }),
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
            "URL-only, upload-derived, or attachment-derived creation is supported only for entity types that explicitly handle it. Provide 'content' or 'prompt' for this entity type.",
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
        const stub = buildGenerationStubEntity(services, {
          entityType: createInput.entityType,
          id: proposedId,
          title: stubTitle,
        });
        if (!stub) {
          return {
            success: false,
            error: `Entity type '${createInput.entityType}' does not support queued (prompt-based) creation. Provide 'content' instead.`,
          };
        }

        let resolvedEntityId: string;
        try {
          const result = await entityService.createEntity({
            entity: stub,
            options: { deduplicateId: true },
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
        const result =
          createInput.content && hasStructuredFrontmatter(frontmatterSchema)
            ? await entityService.createEntityFromMarkdown({
                input: {
                  entityType: createInput.entityType,
                  id,
                  markdown: createInput.content,
                },
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
    { visibility: "trusted" },
  );
}
