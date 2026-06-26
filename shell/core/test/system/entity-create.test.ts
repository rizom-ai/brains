import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import {
  createInputSchema,
  createOutputSchema,
} from "../../src/system/schemas";
import { createMockSystemServices } from "./mock-services";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import { z, slugify } from "@brains/utils";

const createEntityRequestSchema = z
  .object({
    options: z
      .object({
        eventContext: z
          .object({
            conversationId: z.string().optional(),
            channelId: z.string().optional(),
            runId: z.string().optional(),
            toolCallId: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

const enqueuedCreateJobSchema = z.object({
  targetEntityType: z.string(),
  targetEntityId: z.string(),
});

const enqueuedCoverImageJobSchema = z.object({
  prompt: z.string(),
  title: z.string(),
  aspectRatio: z.string(),
  targetEntityType: z.string(),
  targetEntityId: z.string(),
  entityTitle: z.string().optional(),
  entityContent: z.string().optional(),
});

const enqueuedLinkJobSchema = z.object({
  url: z.string().url(),
  metadata: z.object({
    interfaceId: z.string(),
    userId: z.string(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    timestamp: z.string(),
  }),
});

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/i;
type MockServices = ReturnType<typeof createMockSystemServices>;

// Entity types these tests treat as registered by an installed plugin. The
// create tool now rejects unregistered types up front, so every mock must
// register the types it exercises (mirrors real plugin registration).
const STANDARD_ENTITY_TYPES = [
  "base",
  "note",
  "post",
  "deck",
  "document",
  "image",
  "link",
  "agent",
  "social-post",
  "summary",
];

function createSeededSystemServices(
  overrides?: Partial<Parameters<typeof createMockSystemServices>[0]>,
): MockServices {
  const services = createMockSystemServices(overrides);
  services.registerEntityTypes(STANDARD_ENTITY_TYPES);
  return services;
}

function extractFirstUrl(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    const url = value?.match(URL_PATTERN)?.[0];
    if (url) return url;
  }

  return undefined;
}

async function resolveMockEntityByIdentifier(
  services: MockServices,
  entityType: string,
  identifier: string,
): Promise<BaseEntity | null> {
  const byId = await services.entityService.getEntity({
    entityType: entityType,
    id: identifier,
  });
  if (byId) return byId;

  const bySlug = await services.entityService.listEntities({
    entityType: entityType,
    options: {
      filter: { metadata: { slug: identifier } },
    },
  });
  if (bySlug[0]) return bySlug[0];

  const byTitle = await services.entityService.listEntities({
    entityType: entityType,
    options: {
      filter: { metadata: { title: identifier } },
    },
  });
  return byTitle[0] ?? null;
}

function registerLinkCreateInterceptor(services: MockServices): void {
  services.entityRegistry.registerCreateInterceptor(
    "link",
    async (
      input: CreateInput,
      executionContext: CreateExecutionContext,
    ): Promise<CreateInterceptionResult> => {
      if (input.content) {
        try {
          const adapter = services.entityRegistry.getAdapter("link");
          const parsed = adapter.fromMarkdown(input.content);
          const parsedMetadata = parsed.metadata as
            | Record<string, unknown>
            | undefined;
          const parsedTitle =
            typeof parsedMetadata?.["title"] === "string"
              ? parsedMetadata["title"]
              : undefined;
          const parsedStatus =
            typeof parsedMetadata?.["status"] === "string"
              ? parsedMetadata["status"]
              : undefined;
          const parsedUrl = extractFirstUrl(input.content);

          if (parsedTitle && parsedStatus && parsedUrl) {
            const id =
              slugify(parsedUrl) ||
              slugify(parsedTitle) ||
              `${input.entityType}-${Date.now()}`;
            const now = new Date().toISOString();
            const result = await services.entityService.createEntity({
              entity: {
                id,
                entityType: input.entityType,
                content: input.content,
                metadata: {
                  title: parsedTitle,
                  status: parsedStatus,
                },
                created: now,
                updated: now,
              },
            });

            return {
              kind: "handled",
              result: {
                success: true,
                data: { entityId: result.entityId, status: "created" },
              },
            };
          }
        } catch {
          // Fall through: raw URLs should route to capture below.
        }
      }

      const url =
        input.url ?? extractFirstUrl(input.content, input.prompt, input.title);
      if (url) {
        const jobId = await services.jobs.enqueue({
          type: "link-capture",
          data: {
            url,
            metadata: {
              interfaceId: executionContext.interfaceType,
              userId: executionContext.userId,
              ...(executionContext.channelId
                ? { channelId: executionContext.channelId }
                : {}),
              ...(executionContext.channelName
                ? { channelName: executionContext.channelName }
                : {}),
              timestamp: new Date().toISOString(),
            },
          },
        });

        return {
          kind: "handled",
          result: {
            success: true,
            data: { status: "generating", jobId },
          },
        };
      }

      if (input.content) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              "Direct link creation requires full link markdown/frontmatter, or provide a URL to capture.",
          },
        };
      }

      if (input.prompt) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              "Link creation requires a URL in the prompt, content, or title, or full link markdown content for direct creation.",
          },
        };
      }

      return { kind: "continue", input };
    },
  );
}

function registerImageCreateInterceptor(services: MockServices): void {
  services.entityRegistry.registerCreateInterceptor(
    "image",
    async (input: CreateInput): Promise<CreateInterceptionResult> => {
      if (!input.targetEntityType || !input.targetEntityId) {
        return { kind: "continue", input };
      }

      const resolved = await resolveMockEntityByIdentifier(
        services,
        input.targetEntityType,
        input.targetEntityId,
      );
      if (!resolved) {
        return {
          kind: "handled",
          result: {
            success: false,
            error: `Target entity not found: ${input.targetEntityType}/${input.targetEntityId}`,
          },
        };
      }

      return {
        kind: "continue",
        input: {
          ...input,
          targetEntityId: resolved.id,
        },
      };
    },
  );
}

describe("system_create tool", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createSeededSystemServices();
    registerLinkCreateInterceptor(services);
    registerImageCreateInterceptor(services);
    tools = createSystemTools(services);
  });

  interface CreateToolTestContext {
    interfaceType?: string;
    userId?: string;
    conversationId?: string;
    channelId?: string;
    channelName?: string;
    runId?: string;
    toolCallId?: string;
    userPermissionLevel?: UserPermissionLevel;
  }

  function buildContext(context?: CreateToolTestContext): ToolContext {
    return {
      interfaceType: context?.interfaceType ?? "test",
      userId: context?.userId ?? "test",
      ...(context?.conversationId
        ? { conversationId: context.conversationId }
        : {}),
      ...(context?.channelId ? { channelId: context.channelId } : {}),
      ...(context?.channelName ? { channelName: context.channelName } : {}),
      ...(context?.runId ? { runId: context.runId } : {}),
      ...(context?.toolCallId ? { toolCallId: context.toolCallId } : {}),
      ...(context?.userPermissionLevel
        ? { userPermissionLevel: context.userPermissionLevel }
        : {}),
    };
  }

  function withSource(input: Record<string, unknown>): Record<string, unknown> {
    if (input["source"]) return input;
    const {
      content,
      prompt,
      url,
      upload,
      transform,
      sourceAttachment,
      from,
      ...rest
    } = input;
    if (typeof content === "string" && content.trim().length > 0) {
      return transform === undefined || transform === ""
        ? { ...rest, source: { kind: "text", content } }
        : { ...rest, transform, source: { kind: "text", content } };
    }
    if (typeof prompt === "string" && prompt.trim().length > 0) {
      return { ...rest, source: { kind: "generate", prompt } };
    }
    if (typeof url === "string" && url.trim().length > 0) {
      return { ...rest, source: { kind: "url", url } };
    }
    if (upload && transform === "extract-markdown") {
      return { ...rest, source: { kind: "upload", upload, transform } };
    }
    if (sourceAttachment && typeof sourceAttachment === "object") {
      return { ...rest, source: { kind: "attachment", ...sourceAttachment } };
    }
    if (from && typeof from === "object") {
      const messageId = (from as { messageId?: unknown }).messageId;
      return {
        ...rest,
        source: {
          kind: "prior-response",
          ...(typeof messageId === "string" ? { messageId } : {}),
        },
      };
    }
    return input;
  }

  function execRaw(
    input: Record<string, unknown>,
    context?: CreateToolTestContext,
  ): Promise<ToolResponse> {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");
    return tool.handler(withSource(input), buildContext(context));
  }

  async function exec(
    input: Record<string, unknown>,
    context?: CreateToolTestContext,
  ): Promise<ToolResponse> {
    const result = await execRaw(input, context);
    if (!("needsConfirmation" in result)) return result;
    return execRaw(result.args as Record<string, unknown>, context);
  }

  it("rejects unregistered entity types before confirming or generating", async () => {
    const result = await execRaw({
      entityType: "post",
      title: "Queens Are Not Invincible",
      prompt: "Write a fuller article from the outline.",
    });

    // Sanity: "post" is registered in this suite, so it must NOT be rejected.
    expect(result).not.toMatchObject({ success: false });

    const unregistered = await execRaw({
      entityType: "blog-post",
      title: "Queens Are Not Invincible",
      prompt: "Write a fuller article from the outline.",
    });

    expect(unregistered).toMatchObject({ success: false });
    expect((unregistered as { error: string }).error).toContain(
      'Entity type "blog-post" is not available in this brain.',
    );
    // No confirmation card and no generation job for an unregistered type.
    expect(unregistered).not.toHaveProperty("needsConfirmation");
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("rejects creating an entity that already exists and routes to update", async () => {
    const now = new Date().toISOString();
    await services.entityService.createEntity({
      entity: {
        id: "resilience-is-not-redundancy",
        entityType: "post",
        content: "# Resilience Is Not Redundancy",
        metadata: {
          title: "Resilience Is Not Redundancy",
          status: "published",
        },
        created: now,
        updated: now,
      },
    });
    const before = await services.entityService.listEntities({
      entityType: "post",
    });

    // Misrouted status change: "make the Resilience post a draft" reaches
    // system_create instead of system_update. The derived id resolves to the
    // existing post, so the tool must refuse and name the right tool — before
    // any confirmation card — instead of silently minting a deduped copy.
    const result = await execRaw({
      entityType: "post",
      title: "Resilience Is Not Redundancy",
      content: "# Resilience Is Not Redundancy\n\nMake this a draft.",
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("use system_update");
    expect(result).not.toHaveProperty("needsConfirmation");

    const after = await services.entityService.listEntities({
      entityType: "post",
    });
    expect(after.length).toBe(before.length);
  });

  it("allows replace:true to bypass the already-exists guard", async () => {
    const now = new Date().toISOString();
    await services.entityService.createEntity({
      entity: {
        id: "resilience-is-not-redundancy",
        entityType: "post",
        content: "# Resilience Is Not Redundancy",
        metadata: { title: "Resilience Is Not Redundancy" },
        created: now,
        updated: now,
      },
    });

    const result = await exec({
      entityType: "post",
      title: "Resilience Is Not Redundancy",
      content: "# A deliberate new copy",
      replace: true,
    });

    expect(result).toMatchObject({ success: true });
  });

  it("should require confirmation before creating durable entities", async () => {
    const result = await execRaw({
      entityType: "note",
      title: "Confirm Me",
      content: "Confirm this create.",
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_create",
      summary: 'Create "Confirm Me"?',
    });
    expect(result).toHaveProperty("args.confirmed", true);
  });

  it("omits stale upload refs from direct-content confirmation preview copy", async () => {
    const uploadId = "upload-00000000-0000-4000-8000-000000000777";
    const conversationService: IConversationService = {
      startConversation: async () => "conv-1",
      addMessage: async () => undefined,
      getMessages: async () => [
        {
          id: "message-1",
          conversationId: "conv-1",
          role: "user",
          content: "",
          timestamp: new Date(0).toISOString(),
          metadata: JSON.stringify({
            attachments: [
              {
                kind: "file",
                filename: "brief.pdf",
                mediaType: "application/pdf",
                source: { kind: "upload", id: uploadId },
              },
            ],
          }),
        },
      ],
      countMessages: async () => 1,
      getConversation: async () => null,
      listConversations: async () => [],
      updateConversationMetadata: async () => false,
      deleteConversation: async () => false,
      searchConversations: async () => [],
      close: () => undefined,
    };
    services = createSeededSystemServices({ conversationService });
    tools = createSystemTools(services);

    const result = await execRaw(
      {
        entityType: "note",
        title: "Brief",
        content: "Preserve uploaded PDF.",
        upload: { kind: "upload", id: uploadId },
      },
      { conversationId: "conv-1" },
    );

    const parsedConfirmation = z
      .object({ preview: z.string() })
      .passthrough()
      .parse(result);
    expect(result).toMatchObject({ needsConfirmation: true });
    expect(parsedConfirmation.preview).not.toContain("Upload: uploaded file");
    expect(parsedConfirmation.preview).not.toContain(uploadId);
  });

  it("uses deduplicated ids for direct content creates", async () => {
    let createRequest: unknown;
    services.entityService.createEntity = async (
      request,
    ): Promise<{ entityId: string; jobId: string; skipped: boolean }> => {
      createRequest = request;
      return {
        entityId: "duplicate-title-2",
        jobId: "job-duplicate-title-2",
        skipped: false,
      };
    };

    const result = await exec({
      entityType: "note",
      title: "Duplicate Title",
      content: "Create a sibling instead of failing on a duplicate slug.",
    });

    expect(result).toEqual({
      success: true,
      data: { entityId: "duplicate-title-2", status: "created" },
    });
    expect(createRequest).toMatchObject({
      entity: { id: "duplicate-title", entityType: "note" },
      options: { deduplicateId: true },
    });
  });

  it("uses deduplicated ids for finalized markdown creates", async () => {
    services.addEntities([
      {
        id: "existing-deck",
        entityType: "deck",
        content: "Existing deck",
        metadata: { title: "Existing Deck" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-existing-deck",
      },
    ]);
    let markdownRequest: unknown;
    services.entityService.createEntityFromMarkdown = async (
      request,
    ): Promise<{ entityId: string; jobId: string; skipped: boolean }> => {
      markdownRequest = request;
      return {
        entityId: "duplicate-deck-2",
        jobId: "job-duplicate-deck-2",
        skipped: false,
      };
    };

    const markdown = `---
title: Duplicate Deck
slug: duplicate-deck
status: draft
---

# Duplicate Deck

---

## Final Slide`;

    const result = await exec({
      entityType: "deck",
      title: "Duplicate Deck",
      content: markdown,
    });

    expect(result).toEqual({
      success: true,
      data: { entityId: "duplicate-deck-2", status: "created" },
    });
    expect(markdownRequest).toMatchObject({
      input: {
        entityType: "deck",
        id: "duplicate-deck",
        markdown,
      },
      options: { deduplicateId: true },
    });
  });

  it("should reject confirmed create calls without a pending confirmation token", async () => {
    const result = await execRaw({
      entityType: "note",
      title: "No Token",
      content: "Do not create directly.",
      confirmed: true,
    });

    expect(result).toEqual({
      success: false,
      error:
        "No pending create confirmation found. Please request creation again and confirm the new approval.",
    });
  });

  it("should reject confirmed create calls when the confirmed source is changed", async () => {
    const confirmation = await execRaw({
      entityType: "note",
      title: "Original Source",
      content: "Create this original content.",
    });

    expect(confirmation).toMatchObject({ needsConfirmation: true });
    const confirmationArgs = z
      .object({
        confirmationToken: z.string(),
      })
      .passthrough()
      .parse((confirmation as { args: unknown }).args);

    const result = await execRaw({
      ...confirmationArgs,
      source: { kind: "text", content: "Create swapped content instead." },
    });

    expect(result).toEqual({
      success: false,
      error:
        "Confirmed create arguments do not match the pending approval. Please request creation again and confirm the new approval.",
    });
  });

  it("passes separate conversation, channel, run, and tool call provenance to entity creation", async () => {
    const result = await exec(
      {
        entityType: "base",
        title: "Provenance Note",
        content: "remember this",
      },
      {
        conversationId: "conversation-1",
        channelId: "channel-1",
        runId: "run-1",
        toolCallId: "call-1",
      },
    );

    expect("success" in result && result.success).toBe(true);
    const request = createEntityRequestSchema.parse(
      services.getLastCreateRequest(),
    );
    expect(request.options?.eventContext).toEqual({
      conversationId: "conversation-1",
      channelId: "channel-1",
      runId: "run-1",
      toolCallId: "call-1",
    });
  });

  it("should pass normalized input and execution context to registered create interceptors", async () => {
    let capturedInput: CreateInput | undefined;
    let capturedContext: CreateExecutionContext | undefined;

    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input, executionContext) => {
        capturedInput = input;
        capturedContext = executionContext;
        return {
          kind: "handled",
          result: {
            success: true,
            data: { status: "intercepted", entityId: "intercepted-id" },
          },
        } as const;
      },
    );

    const result = await exec(
      {
        entityType: "note",
        prompt: "Write about TypeScript.",
        title: "",
        content: "",
      },
      {
        interfaceType: "matrix",
        userId: "alice",
        channelId: "!room:test",
        channelName: "#general",
      },
    );

    expect(result).toEqual({
      success: true,
      data: { status: "intercepted", entityId: "intercepted-id" },
    });
    expect(capturedInput).toEqual({
      entityType: "note",
      prompt: "Write about TypeScript.",
    });
    expect(capturedContext).toEqual({
      interfaceType: "matrix",
      userId: "alice",
      channelId: "!room:test",
      channelName: "#general",
    });
  });

  it("should pass accessible upload transform refs to registered create interceptors", async () => {
    let capturedInput: CreateInput | undefined;
    services = createSeededSystemServices({
      conversationService: {
        ...services.conversationService,
        getMessages: async () => [
          {
            id: "message-1",
            conversationId: "web-conversation-1",
            role: "user",
            content: "",
            metadata: JSON.stringify({
              attachments: [
                {
                  kind: "file",
                  filename: "brief.pdf",
                  mediaType: "application/pdf",
                  source: {
                    kind: "upload",
                    id: "upload-00000000-0000-4000-8000-000000000301",
                  },
                },
              ],
            }),
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    tools = createSystemTools(services);
    services.entityRegistry.registerCreateInterceptor("note", async (input) => {
      capturedInput = input;
      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: "brief" },
        },
      };
    });

    const result = await exec(
      {
        entityType: "note",
        upload: {
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000301",
        },
        transform: "extract-markdown",
      },
      { interfaceType: "web-chat", channelId: "web-conversation-1" },
    );

    expect(result).toEqual({
      success: true,
      data: { status: "created", entityId: "brief" },
    });
    expect(capturedInput).toEqual({
      entityType: "note",
      from: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000301",
      },
      transform: "extract-markdown",
    });
  });

  it("should pass upload markdown transforms to registered create interceptors", async () => {
    let capturedInput: CreateInput | undefined;
    services = createSeededSystemServices({
      conversationService: {
        ...services.conversationService,
        getMessages: async () => [
          {
            id: "message-1",
            conversationId: "web-conversation-1",
            role: "user",
            content: "",
            metadata: JSON.stringify({
              attachments: [
                {
                  kind: "file",
                  filename: "brief.pdf",
                  mediaType: "application/pdf",
                  source: {
                    kind: "upload",
                    id: "upload-00000000-0000-4000-8000-000000000304",
                  },
                },
              ],
            }),
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    tools = createSystemTools(services);
    services.entityRegistry.registerCreateInterceptor("note", async (input) => {
      capturedInput = input;
      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: "brief-note" },
        },
      };
    });

    const result = await exec(
      {
        entityType: "note",
        upload: {
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000304",
        },
        transform: "extract-markdown",
      },
      { interfaceType: "web-chat", channelId: "web-conversation-1" },
    );

    expect(result).toEqual({
      success: true,
      data: { status: "created", entityId: "brief-note" },
    });
    expect(capturedInput).toEqual({
      entityType: "note",
      from: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000304",
      },
      transform: "extract-markdown",
    });
  });

  it("should reject extract-markdown transform without an upload ref", async () => {
    const result = await exec({
      entityType: "note",
      content: "# Notes\n\nStore this directly.",
      transform: "extract-markdown",
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("Unrecognized key");
  });

  it("should reject extract-markdown transform for raw document upload promotion", async () => {
    services = createSeededSystemServices({
      conversationService: {
        ...services.conversationService,
        getMessages: async () => [
          {
            id: "message-1",
            conversationId: "web-conversation-1",
            role: "user",
            content: "",
            metadata: JSON.stringify({
              attachments: [
                {
                  kind: "file",
                  filename: "brief.pdf",
                  mediaType: "application/pdf",
                  source: {
                    kind: "upload",
                    id: "upload-00000000-0000-4000-8000-000000000305",
                  },
                },
              ],
            }),
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    tools = createSystemTools(services);
    let interceptorCalled = false;
    services.entityRegistry.registerCreateInterceptor("document", async () => {
      interceptorCalled = true;
      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: "brief" },
        },
      };
    });

    const result = await exec(
      {
        entityType: "document",
        upload: {
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000305",
        },
        transform: "extract-markdown",
      },
      { interfaceType: "web-chat", channelId: "web-conversation-1" },
    );

    expect(result).toEqual({
      success: false,
      error:
        'Transform "extract-markdown" requires entityType "note" and an upload ref. Omit transform for raw file promotion to document/image.',
    });
    expect(interceptorCalled).toBe(false);
  });

  it("should treat empty transform strings as omitted for direct creates", async () => {
    let capturedInput: CreateInput | undefined;
    services.entityRegistry.registerCreateInterceptor("note", async (input) => {
      capturedInput = input;
      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: "operating-notes" },
        },
      };
    });

    const result = await exec({
      entityType: "note",
      title: "Operating Notes",
      content: "# Operating Notes\n\n- Store it as-is.",
      transform: "",
    });

    expect(result).toEqual({
      success: true,
      data: { status: "created", entityId: "operating-notes" },
    });
    expect(capturedInput).toEqual({
      entityType: "note",
      title: "Operating Notes",
      content: "# Operating Notes\n\n- Store it as-is.",
    });
  });

  it("should use conversationId for upload-transform access when channelId is not the conversation id", async () => {
    let capturedInput: CreateInput | undefined;
    services = createSeededSystemServices({
      conversationService: {
        ...services.conversationService,
        getMessages: async (conversationId: string) =>
          conversationId === "web-conversation-1"
            ? [
                {
                  id: "message-1",
                  conversationId: "web-conversation-1",
                  role: "user",
                  content: "",
                  metadata: JSON.stringify({
                    attachments: [
                      {
                        kind: "file",
                        filename: "brief.pdf",
                        mediaType: "application/pdf",
                        source: {
                          kind: "upload",
                          id: "upload-00000000-0000-4000-8000-000000000303",
                        },
                      },
                    ],
                  }),
                  timestamp: new Date().toISOString(),
                },
              ]
            : [],
      },
    });
    tools = createSystemTools(services);
    services.entityRegistry.registerCreateInterceptor("note", async (input) => {
      capturedInput = input;
      return {
        kind: "handled",
        result: {
          success: true,
          data: { status: "created", entityId: "brief" },
        },
      };
    });

    const result = await exec(
      {
        entityType: "note",
        upload: {
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000303",
        },
        transform: "extract-markdown",
      },
      {
        interfaceType: "web-chat",
        conversationId: "web-conversation-1",
        channelId: "web-channel-1",
      },
    );

    expect(result).toEqual({
      success: true,
      data: { status: "created", entityId: "brief" },
    });
    expect(capturedInput?.from).toEqual({
      kind: "upload",
      id: "upload-00000000-0000-4000-8000-000000000303",
    });
  });

  it("should reject upload refs outside the current conversation", async () => {
    const result = await exec(
      {
        entityType: "note",
        upload: {
          kind: "upload",
          id: "upload-00000000-0000-4000-8000-000000000302",
        },
        transform: "extract-markdown",
      },
      { interfaceType: "web-chat", channelId: "web-conversation-1" },
    );

    expect(result).toEqual({
      success: false,
      error:
        "Upload ref is not accessible in this conversation or no longer exists.",
    });
  });

  it("should return handled interceptor results without falling through", async () => {
    services.entityRegistry.registerCreateInterceptor("note", async () => ({
      kind: "handled",
      result: {
        success: true,
        data: { status: "handled", entityId: "from-interceptor" },
      },
    }));

    const result = await exec({
      entityType: "note",
      title: "My Note",
      content: "This is a test.",
    });

    expect(result).toEqual({
      success: true,
      data: { status: "handled", entityId: "from-interceptor" },
    });
    expect(services.getEntities().size).toBe(0);
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("should continue with rewritten input for generation jobs", async () => {
    services.addEntities([
      {
        id: "existing-base",
        entityType: "note",
        content: "Existing base",
        metadata: { title: "Existing Base" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-existing-base",
      },
    ]);
    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input) => ({
        kind: "continue",
        input: {
          ...input,
          prompt: "Rewritten prompt",
          title: "Rewritten Title",
        },
      }),
    );

    await exec({
      entityType: "note",
      prompt: "Original prompt",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("note:generation");
    expect(enqueuedJob.data).toEqual({
      entityId: "rewritten-title",
      prompt: "Rewritten prompt",
      title: "Rewritten Title",
    });
  });

  it("should continue with rewritten input for direct create", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input) => ({
        kind: "continue",
        input: {
          ...input,
          title: "Interceptor Title",
          content: "Interceptor body.",
        },
      }),
    );

    const result = await exec({
      entityType: "note",
      title: "Original Title",
      content: "Original body.",
    });

    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("interceptor-title");
    const entity = await services.entityService.getEntity({
      entityType: "note",
      id: "interceptor-title",
    });
    expect(entity?.content).toBe("Interceptor body.");
    expect(entity?.metadata["title"]).toBe("Interceptor Title");
  });

  it("should create entity with title and content", async () => {
    const result = await exec({
      entityType: "note",
      title: "My Note",
      content: "This is a test.",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("created");
    expect(data.entityId).toBeDefined();
  });

  it("should slugify title as entity ID", async () => {
    const result = await exec({
      entityType: "note",
      title: "My Cool Note Title",
      content: "Body.",
    });

    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("my-cool-note-title");
  });

  it("should store entity in entity service", async () => {
    await exec({
      entityType: "note",
      title: "Retrievable Note",
      content: "Find me.",
    });

    const entity = await services.entityService.getEntity({
      entityType: "note",
      id: "retrievable-note",
    });
    expect(entity).not.toBeNull();
  });

  it("should use adapter-validated markdown creation for structured content", async () => {
    services.addEntities([
      {
        id: "existing-deck",
        entityType: "deck",
        content: "Existing deck",
        metadata: { title: "Existing Deck" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-existing-deck",
      },
    ]);
    const markdown = `---
title: Approved Deck
slug: approved-deck
status: draft
---

# Approved Deck

---

## Final Slide`;

    const result = await exec({
      entityType: "deck",
      title: "Approved Deck",
      content: markdown,
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data).toEqual({ status: "created", entityId: "approved-deck" });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
    expect(services.getLastMarkdownCreate()).toEqual({
      entityType: "deck",
      id: "approved-deck",
      markdown,
    });
  });

  it("should keep note direct content on the generic create path", async () => {
    await exec({
      entityType: "note",
      title: "Plain Note",
      content: "No frontmatter required.",
    });

    expect(services.getLastMarkdownCreate()).toBeUndefined();
    const entity = await services.entityService.getEntity({
      entityType: "note",
      id: "plain-note",
    });
    expect(entity?.content).toBe("No frontmatter required.");
  });

  it("should queue generation job when prompt provided", async () => {
    services.addEntities([
      {
        id: "existing-base",
        entityType: "note",
        content: "Existing base",
        metadata: { title: "Existing Base" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-existing-base",
      },
    ]);

    const result = await exec({
      entityType: "note",
      prompt: "Write about TypeScript.",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");
    expect(data.entityId).toBe("write-about-typescript");
    expect(data.jobId).toBeDefined();
    const stub = await services.entityService.getEntity({
      entityType: "note",
      id: "write-about-typescript",
    });
    expect(stub?.metadata["status"]).toBe("generating");
  });

  it("should require a create source", async () => {
    const result = await exec({
      entityType: "note",
      title: "Nothing else",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Invalid input: source: Required",
    );
  });

  it("should reject url-only create for unsupported entity types", async () => {
    const result = await exec({
      entityType: "note",
      source: { kind: "url", url: "https://example.com/test" },
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "URL, upload, or attachment source creation is supported only for entity types that explicitly handle it",
    );
  });

  it("should queue agent generation from top-level url", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "agent",
      async (input) => ({
        kind: "continue",
        input:
          input.url && !input.prompt && !input.content
            ? { ...input, prompt: input.url }
            : input,
      }),
    );

    const result = await exec({
      entityType: "agent",
      url: "https://yeehaa.io",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("agent:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["prompt"]).toBe("https://yeehaa.io");
  });

  it("should route top-level url link creation to link capture", async () => {
    const result = await exec({
      entityType: "link",
      url: "https://anthropic.com/research",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");
    expect(data.jobId).toBeDefined();

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("link-capture");
    const jobData = enqueuedLinkJobSchema.parse(enqueuedJob.data);
    expect(jobData.url).toBe("https://anthropic.com/research");
  });

  it("should route prompted link creation with a URL to link capture", async () => {
    const result = await exec({
      entityType: "link",
      prompt: "Save this link for me: https://anthropic.com/research",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");
    expect(data.jobId).toBeDefined();

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("link-capture");
    const jobData = enqueuedLinkJobSchema.parse(enqueuedJob.data);
    expect(jobData.url).toBe("https://anthropic.com/research");
    expect(jobData.metadata.interfaceId).toBe("test");
    expect(jobData.metadata.userId).toBe("test");
  });

  it("should create a link directly from full markdown/frontmatter content", async () => {
    const markdown = `---
status: draft
title: Anthropic Research
url: https://anthropic.com/research
description: Research updates from Anthropic
keywords:
  - ai
  - research
domain: anthropic.com
capturedAt: "2026-04-14T08:00:00.000Z"
source:
  ref: "manual:local"
  label: MANUAL
---

A saved research link.`;

    const result = await exec({
      entityType: "link",
      content: markdown,
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("created");
    expect(data.entityId).toBeDefined();
    if (!data.entityId) throw new Error("Expected entityId to be defined");

    const stored = await services.entityService.getEntity({
      entityType: "link",
      id: data.entityId,
    });
    expect(stored).not.toBeNull();
    expect(stored?.metadata["title"]).toBe("Anthropic Research");
    expect(stored?.metadata["status"]).toBe("draft");
    expect(stored?.content).toBe(markdown);
  });

  it("should route raw link content to link capture", async () => {
    const result = await exec({
      entityType: "link",
      content: "https://en.wikipedia.org/wiki/The_Drama_(film)",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("link-capture");
    const jobData = enqueuedLinkJobSchema.parse(enqueuedJob.data);
    expect(jobData.url).toBe("https://en.wikipedia.org/wiki/The_Drama_(film)");
  });

  it("should reject invalid direct link content that is not full markdown/frontmatter", async () => {
    const result = await exec({
      entityType: "link",
      content: "This is not a valid link entity body.",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Direct link creation requires full link markdown/frontmatter",
    );
  });

  it("should reject prompted link creation without a URL", async () => {
    const result = await exec({
      entityType: "link",
      prompt: "Save the article I mentioned earlier",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain("requires a URL");
  });

  it("should ignore empty optional strings when queuing generation jobs", async () => {
    await exec({
      entityType: "post",
      prompt: "Write about TypeScript.",
      title: "",
      content: "",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("post:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["title"]).toBeUndefined();
    expect(rawJobData["content"]).toBeUndefined();
    expect(rawJobData["targetEntityType"]).toBeUndefined();
    expect(rawJobData["targetEntityId"]).toBeUndefined();
    expect(rawJobData["prompt"]).toBe("Write about TypeScript.");
  });

  it("should reject targetEntityType without targetEntityId", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
    );
  });

  it("should reject targetEntityId without targetEntityType", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityId: "my-post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
    );
  });

  it("should ignore placeholder target fields for standalone generated artifacts", async () => {
    await exec({
      entityType: "image",
      prompt: "Generate a robot image",
      targetEntityType: "image",
      targetEntityId: "temp",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const jobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(jobData["targetEntityType"]).toBeUndefined();
    expect(jobData["targetEntityId"]).toBeUndefined();
  });

  it("should ignore target fields when creating a non-attachable entity with its own cover image", async () => {
    await exec({
      entityType: "post",
      prompt: "Write about continuous learning",
      coverImage: { generate: true },
      targetEntityType: "post",
      targetEntityId: "temp",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const jobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(jobData["targetEntityType"]).toBeUndefined();
    expect(jobData["targetEntityId"]).toBeUndefined();
    expect(jobData["coverImage"]).toEqual({ generate: true });
  });

  it("should resolve image generation targets to canonical entity ids", async () => {
    services.addEntities([
      {
        id: "my-blog-post",
        entityType: "post",
        content: "---\ntitle: My Blog Post\nslug: my-blog-post\n---\nContent",
        metadata: { title: "My Blog Post", slug: "my-blog-post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-1",
      },
    ]);

    await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "My Blog Post",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const jobData = enqueuedCreateJobSchema.parse(enqueuedJob.data);
    expect(jobData.targetEntityType).toBe("post");
    expect(jobData.targetEntityId).toBe("my-blog-post");
  });

  it("should reject image generation when the target entity does not exist", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "missing-post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Target entity not found: post/missing-post",
    );
  });

  it("should expose canonical source and no transitional flat source fields", () => {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");

    expect(tool.inputSchema).toHaveProperty("source");
    expect(tool.inputSchema).not.toHaveProperty("content");
    expect(tool.inputSchema).not.toHaveProperty("prompt");
    expect(tool.inputSchema).not.toHaveProperty("url");
    expect(tool.inputSchema).not.toHaveProperty("from");
    expect(tool.inputSchema).not.toHaveProperty("upload");
    expect(tool.inputSchema).not.toHaveProperty("transform");
    expect(tool.inputSchema).not.toHaveProperty("sourceAttachment");
    expect(tool.inputSchema).not.toHaveProperty("fromUpload");
    expect(tool.inputSchema).toHaveProperty("replace");
    expect(tool.inputSchema).toHaveProperty("coverImage");
    expect(tool.inputSchema).not.toHaveProperty("options");
  });

  it("should accept every canonical source branch and reject cross-branch fields", () => {
    const validInputs = [
      { entityType: "note", source: { kind: "text", content: "Body" } },
      { entityType: "note", source: { kind: "generate", prompt: "Draft" } },
      {
        entityType: "link",
        source: { kind: "url", url: "https://example.com" },
      },
      {
        entityType: "note",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: "upload-1" },
          transform: "extract-markdown",
        },
      },
      {
        entityType: "document",
        source: {
          kind: "attachment",
          sourceEntityType: "deck",
          sourceEntityId: "deck-1",
          attachmentType: "carousel",
        },
      },
      { entityType: "note", source: { kind: "prior-response" } },
    ];

    for (const input of validInputs) {
      expect(createInputSchema.safeParse(input).success).toBe(true);
    }

    expect(
      createInputSchema.safeParse({
        entityType: "note",
        source: { kind: "text", content: "Body", prompt: "Nope" },
      }).success,
    ).toBe(false);
    expect(
      createInputSchema.safeParse({
        entityType: "note",
        content: "Body",
      }).success,
    ).toBe(false);
    expect(
      createInputSchema.safeParse({
        entityType: "note",
        source: { kind: "text", content: "Body" },
        content: "Other body",
      }).success,
    ).toBe(false);
  });

  it("should reject direct content combined with stale upload refs", async () => {
    const result = await execRaw({
      entityType: "note",
      title: "Image Discussion",
      source: {
        kind: "text",
        content: "Notes from the image discussion.",
      },
      upload: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000951",
      },
      transform: "extract-markdown",
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("Unrecognized key");
  });

  it("should reject image prompts combined with stale upload refs", async () => {
    const result = await execRaw({
      entityType: "image",
      source: {
        kind: "generate",
        prompt: "Editorial cover image for the social post.",
      },
      targetEntityType: "social-post",
      targetEntityId: "ecosystems-over-extraction",
      upload: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000952",
      },
      transform: "extract-markdown",
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("Unrecognized key");
  });

  it("should canonicalize sourceAttachment sourceEntityId before confirmation and create interceptors", async () => {
    services.addEntities([
      {
        id: "resilience-in-distributed-systems",
        entityType: "post",
        content: "Resilience post content",
        metadata: {
          title: "Resilience Is Not Redundancy",
          slug: "resilience-in-distributed-systems",
        },
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
        visibility: "public",
        contentHash: "hash-resilience-post",
      },
    ]);
    let capturedInput: CreateInput | undefined;
    services.entityRegistry.registerCreateInterceptor(
      "document",
      async (input: CreateInput): Promise<CreateInterceptionResult> => {
        capturedInput = input;
        return {
          kind: "handled",
          result: {
            success: true,
            data: { entityId: "printable-post", status: "generated" },
          },
        };
      },
    );

    const confirmation = await execRaw({
      entityType: "document",
      sourceAttachment: {
        sourceEntityType: "post",
        sourceEntityId: "Resilience Is Not Redundancy",
        attachmentType: "printable",
      },
    });

    expect(confirmation).toMatchObject({ needsConfirmation: true });
    if (!("needsConfirmation" in confirmation)) {
      throw new Error("Expected create confirmation");
    }
    expect(confirmation).toHaveProperty("args.source", {
      kind: "attachment",
      sourceEntityType: "post",
      sourceEntityId: "resilience-in-distributed-systems",
      attachmentType: "printable",
    });
    expect(confirmation).not.toHaveProperty("args.sourceAttachment");
    const confirmationArgs = z
      .record(z.string(), z.unknown())
      .parse(confirmation.args);

    const result = await execRaw(confirmationArgs);

    expect(result).toMatchObject({
      success: true,
      data: { entityId: "printable-post", status: "generated" },
    });
    expect(capturedInput).toMatchObject({
      entityType: "document",
      from: {
        kind: "entity-attachment",
        sourceEntityType: "post",
        sourceEntityId: "resilience-in-distributed-systems",
        attachmentType: "printable",
      },
    });
  });

  it("should let sourceAttachment take precedence over upload and forward normalized from plus replace to create interceptors", async () => {
    let capturedInput: CreateInput | undefined;
    services.entityRegistry.registerCreateInterceptor(
      "document",
      async (input: CreateInput): Promise<CreateInterceptionResult> => {
        capturedInput = input;
        return {
          kind: "handled",
          result: {
            success: true,
            data: {
              entityId: "deck-carousel",
              status: "generating",
              jobId: "job-document",
            },
          },
        };
      },
    );

    const result = await exec({
      entityType: "document",
      upload: {
        kind: "upload",
        id: "upload-00000000-0000-4000-8000-000000000951",
      },
      sourceAttachment: {
        sourceEntityType: "deck",
        sourceEntityId: "distributed-systems-primer",
        attachmentType: "carousel",
      },
      replace: true,
      targetEntityType: "social-post",
      targetEntityId: "launch-post",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        entityId: "deck-carousel",
        status: "generating",
        jobId: "job-document",
      },
    });
    expect(capturedInput).toEqual({
      entityType: "document",
      from: {
        kind: "entity-attachment",
        sourceEntityType: "deck",
        sourceEntityId: "distributed-systems-primer",
        attachmentType: "carousel",
      },
      replace: true,
      targetEntityType: "social-post",
      targetEntityId: "launch-post",
    });
  });

  it("should queue cover image generation after direct create with actual entity id", async () => {
    const result = await exec({
      entityType: "post",
      title: "Cover Ready Post",
      content: "A post that needs a visual cover.",
      coverImage: {
        generate: true,
        prompt: "Editorial abstract for a cover-ready post",
      },
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("cover-ready-post");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("image:image-generate");
    const jobData = enqueuedCoverImageJobSchema.parse(enqueuedJob.data);
    expect(jobData).toMatchObject({
      prompt: "Editorial abstract for a cover-ready post",
      title: "Cover Ready Post Cover",
      aspectRatio: "16:9",
      targetEntityType: "post",
      targetEntityId: "cover-ready-post",
      entityTitle: "Cover Ready Post",
      entityContent: "A post that needs a visual cover.",
    });
  });

  it("should pass normalized coverImage option through generation jobs", async () => {
    await exec({
      entityType: "social-post",
      prompt: "Write a LinkedIn post about continuous learning",
      coverImage: true,
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("social-post:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["coverImage"]).toEqual({ generate: true });
  });

  it("should reject coverImage for entity types without cover support", async () => {
    const result = await exec({
      entityType: "note",
      title: "Plain Note",
      content: "Notes do not support cover images in this mock registry.",
      coverImage: true,
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Entity type 'note' doesn't support cover images",
    );
    expect(services.getEntities().size).toBe(0);
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("should enforce entity action policy before generic direct create", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "*": { create: "trusted" },
        summary: { create: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "summary",
        content: "Protected summary",
      },
      { userPermissionLevel: "trusted" },
    );

    expect(result).toMatchObject({
      success: false,
      error:
        "Creating `summary` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
    expect(services.getEntities().size).toBe(0);
  });

  it("should enforce entity action policy after create interceptors rewrite entity type", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "*": { create: "trusted" },
        summary: { create: "anchor" },
      },
    });
    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input) => ({
        kind: "continue",
        input: { ...input, entityType: "summary" },
      }),
    );

    const result = await exec(
      {
        entityType: "note",
        content: "Rewritten summary",
      },
      { userPermissionLevel: "trusted" },
    );

    expect(result).toMatchObject({
      success: false,
      error:
        "Creating `summary` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
    expect(services.getEntities().size).toBe(0);
  });

  it("should pass target fields as top-level (not nested in options)", async () => {
    services.addEntities([
      {
        id: "test-post",
        entityType: "post",
        content: "---\ntitle: Test Post\nslug: test-post\n---\nContent",
        metadata: { title: "Test Post", slug: "test-post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-2",
      },
    ]);

    await exec({
      entityType: "image",
      prompt: "Generate image",
      targetEntityType: "post",
      targetEntityId: "test-post",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData).not.toHaveProperty("options");
    const jobData = enqueuedCreateJobSchema.parse(rawJobData);
    expect(jobData.targetEntityType).toBe("post");
  });
});
