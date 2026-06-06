import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type {
  IAgentService,
  IConversationService,
  WebRouteDefinition,
  WebRouteMethod,
} from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { join } from "path";
import { mkdir, rm, utimes, writeFile } from "fs/promises";
import { WebChatInterface } from "../src";

type ChatContext = Parameters<IAgentService["chat"]>[2];
type AgentResponse = Awaited<ReturnType<IAgentService["chat"]>>;
type Conversation = NonNullable<
  Awaited<ReturnType<IConversationService["getConversation"]>>
>;
type Message = Awaited<ReturnType<IConversationService["getMessages"]>>[number];
type JobStatus = Awaited<
  ReturnType<ReturnType<PluginTestHarness["getMockShell"]>["jobs"]["getStatus"]>
>;

interface AgentChatCall {
  message: string;
  conversationId: string;
  context: ChatContext | undefined;
}

interface AgentConfirmCall {
  conversationId: string;
  confirmed: boolean;
  approvalId: string | undefined;
}

function makeJobStatus(
  jobId: string,
  status: "pending" | "processing" | "completed" | "failed",
  lastError: string | null = null,
): NonNullable<JobStatus> {
  return {
    id: jobId,
    type: "document_generate",
    data: "{}",
    status,
    source: "test",
    priority: 0,
    retryCount: 0,
    maxRetries: 3,
    lastError,
    createdAt: Date.now(),
    scheduledFor: Date.now(),
    startedAt: status === "pending" ? null : Date.now(),
    completedAt:
      status === "completed" || status === "failed" ? Date.now() : null,
    metadata: {
      operationType: "content_operations",
      rootJobId: jobId,
    },
    result: null,
  };
}

function createSpyAgentService(
  chatResponse: AgentResponse = {
    text: "Mock agent response",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  },
  confirmResponse: AgentResponse = {
    text: "Action confirmed.",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  },
): IAgentService & {
  readonly chatCalls: ReadonlyArray<AgentChatCall>;
  readonly confirmCalls: ReadonlyArray<AgentConfirmCall>;
} {
  const calls: AgentChatCall[] = [];
  const confirmCalls: AgentConfirmCall[] = [];
  return {
    get chatCalls(): ReadonlyArray<AgentChatCall> {
      return calls;
    },
    get confirmCalls(): ReadonlyArray<AgentConfirmCall> {
      return confirmCalls;
    },
    chat: async (
      message: string,
      conversationId: string,
      context?: ChatContext,
    ): Promise<AgentResponse> => {
      calls.push({ message, conversationId, context });
      return chatResponse;
    },
    confirmPendingAction: async (
      conversationId: string,
      confirmed: boolean,
      approvalId?: string,
    ): Promise<AgentResponse> => {
      confirmCalls.push({ conversationId, confirmed, approvalId });
      return confirmResponse;
    },
    invalidateAgent: (): void => {},
  };
}

function makeConversation(
  id: string,
  interfaceType: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    sessionId: id,
    interfaceType,
    channelId: id,
    started: "2026-05-24T00:00:00.000Z",
    lastActive: "2026-05-24T00:01:00.000Z",
    created: "2026-05-24T00:00:00.000Z",
    updated: "2026-05-24T00:01:00.000Z",
    metadata: JSON.stringify({ channelName: "Web Chat" }),
    ...overrides,
  };
}

function makeMessage(
  id: string,
  conversationId: string,
  role: Message["role"],
  content: string,
  metadata: Message["metadata"] = null,
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    timestamp: "2026-05-24T00:00:30.000Z",
    metadata,
  };
}

function makeFixedConversationService(input: {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  updateConversationMetadata?: (request: {
    conversationId: string;
    metadata: Record<string, unknown>;
  }) => Promise<boolean>;
  deleteConversation?: (conversationId: string) => Promise<boolean>;
}): IConversationService {
  return {
    startConversation: async () => "web-session",
    addMessage: async (): Promise<void> => {},
    getConversation: async (conversationId: string) =>
      input.conversations.find((c) => c.id === conversationId) ?? null,
    listConversations: async (options) =>
      input.conversations.filter(
        (c) =>
          options?.interfaceType === undefined ||
          c.interfaceType === options.interfaceType,
      ),
    searchConversations: async () => [],
    getMessages: async (conversationId: string) =>
      input.messagesByConversation[conversationId] ?? [],
    countMessages: async (conversationId: string) =>
      (input.messagesByConversation[conversationId] ?? []).length,
    updateConversationMetadata:
      input.updateConversationMetadata ?? (async (): Promise<boolean> => true),
    deleteConversation:
      input.deleteConversation ?? (async (): Promise<boolean> => true),
    close: (): void => {},
  };
}

function operatorPlugin(): WebChatInterface {
  return new WebChatInterface({}, { resolveOperatorSession: async () => true });
}

function textDataUrl(content: string): string {
  return `data:text/plain;base64,${Buffer.from(content, "utf8").toString("base64")}`;
}

function pngBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(8));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function pngDataUrl(bytes = pngBytes()): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

function getRoute(
  plugin: WebChatInterface,
  path: string,
  method: WebRouteMethod,
): WebRouteDefinition | undefined {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) => candidate.path === path && candidate.method === method,
    );
  if (!route) {
    throw new Error(`Missing ${method} ${path} route`);
  }
  return route;
}

describe("WebChatInterface", () => {
  let harness: PluginTestHarness<WebChatInterface>;

  beforeEach(() => {
    harness = createPluginHarness<WebChatInterface>();
  });

  afterEach(() => {
    harness.reset();
  });

  it("registers as the web-chat interface", async () => {
    const plugin = new WebChatInterface();

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("web-chat");
    expect(plugin.type).toBe("interface");
    expect(plugin.packageName).toBe("@brains/web-chat");
  });

  it("exposes chat page, AI SDK endpoint, and UI asset routes", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();

    expect(routes).toHaveLength(13);
    expect(routes[0]).toMatchObject({
      path: "/chat",
      method: "GET",
      public: true,
    });
    expect(routes[1]).toMatchObject({
      path: "/api/chat",
      method: "POST",
      public: true,
    });
    expect(routes[2]).toMatchObject({
      path: "/api/chat/sessions",
      method: "GET",
      public: true,
    });
    expect(routes[3]).toMatchObject({
      path: "/api/chat/sessions",
      method: "DELETE",
      public: true,
    });
    expect(routes[4]).toMatchObject({
      path: "/api/chat/sessions",
      method: "PUT",
      public: true,
    });
    expect(routes[5]).toMatchObject({
      path: "/api/chat/sessions/archive",
      method: "PUT",
      public: true,
    });
    expect(routes[6]).toMatchObject({
      path: "/api/chat/messages",
      method: "GET",
      public: true,
    });
    expect(routes[7]).toMatchObject({
      path: "/api/chat/attachments/document",
      method: "GET",
      public: true,
    });
    expect(routes[8]).toMatchObject({
      path: "/api/chat/attachments/image",
      method: "GET",
      public: true,
    });
    expect(routes[9]).toMatchObject({
      path: "/api/chat/jobs/status",
      method: "GET",
      public: true,
    });
    expect(routes[10]).toMatchObject({
      path: "/chat/assets/app.js",
      method: "GET",
      public: true,
    });
    expect(routes[11]).toMatchObject({
      path: "/api/chat/uploads",
      method: "POST",
      public: true,
    });
    expect(routes[12]).toMatchObject({
      path: "/api/chat/uploads",
      method: "GET",
      public: true,
    });
  });

  it("requires operator auth for the chat page", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const text = await response?.text();

    expect(response?.status).toBe(401);
    expect(text).toContain("Operator login required");
  });

  it("serves the chat page for operators", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Brain Chat");
    expect(html).toContain("/chat/assets/app.js");
    expect(html).toContain("data-web-chat-styles");
    expect(html).toContain("--chat-bg:");
    expect(html).toContain("--chat-accent:");
    expect(html).toContain('[data-theme="light"]');
    expect(html).toContain(".web-chat-session-dialog-backdrop");
    expect(html).toContain(
      ".web-chat-session-dialog-actions { flex-direction: column-reverse; }",
    );
    expect(html).toContain(".web-chat-session-rename,");
    expect(html).toContain(".web-chat-session-delete {");
    expect(html).toContain("opacity: 1;");
  });

  it("does not reach out to fonts.googleapis.com from the chat page", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat", "GET");

    const response = await route?.handler(new Request("http://brain/chat"));
    const html = await response?.text();

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).not.toContain("Fraunces");
  });

  it("serves the React UI asset when built or a clear 404 otherwise", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/chat/assets/app.js", "GET");

    const response = await route?.handler(
      new Request("http://brain/chat/assets/app.js"),
    );
    const text = await response?.text();

    if (response?.status === 200) {
      expect(response.headers.get("content-type")).toContain("text/javascript");
      expect(text).toContain("data-web-chat-app");
    } else {
      expect(response?.status).toBe(404);
      expect(text).toContain("not built");
    }
  });

  it("rejects chat POSTs without an operator session", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello web chat" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(403);
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("streams approval cards as AI SDK native tool chunks", async () => {
    const agent = createSpyAgentService({
      text: "Confirmation required.",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "approval-requested",
        },
      ],
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          summary: "Delete note?",
          args: { noteId: "123" },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Delete it" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("tool-input-available");
    expect(body).toContain("tool-approval-request");
    expect(body).toContain("approval:call-1");
    expect(body).not.toContain("data-approval-card");
  });

  it("streams progress notifications as structured data parts", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("job-progress", {
          id: "batch-1",
          type: "batch",
          status: "completed",
          message: "Finished indexing 24 files",
          metadata: {
            rootJobId: "batch-1",
            operationType: "batch_processing",
            operationTarget: "/tmp/brain-data",
            interfaceType: "web-chat",
            channelId: conversationId,
          },
        });
        return {
          text: "Batch finished.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Run batch" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-progress");
    expect(body).toContain('"status":"completed"');
    expect(body).toContain('"operationType":"batch_processing"');
    expect(body).toContain('"operationTarget":"/tmp/brain-data"');
    expect(body).toContain("Finished indexing 24 files");
    expect(body).not.toContain("✅");
    expect(body).not.toContain("**batch processing");
  });

  it("streams active tool activity as transient status parts", async () => {
    const agent: IAgentService = {
      chat: async (_message, conversationId) => {
        await harness.sendMessage("tool:invoking", {
          toolName: "search_notes",
          conversationId,
          interfaceType: "web-chat",
          channelId: conversationId,
        });
        return {
          text: "Search complete.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Search notes" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-status");
    expect(body).toContain("tool-invoking");
    expect(body).toContain("Using search_notes…");
  });

  it("ignores tool activity outside the active web-chat channel", async () => {
    const agent: IAgentService = {
      chat: async () => {
        await harness.sendMessage("tool:invoking", {
          toolName: "background_tool",
          conversationId: "other-conversation",
          interfaceType: "web-chat",
          channelId: "other-conversation",
        });
        return {
          text: "No visible tool status.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Search notes" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).not.toContain("background_tool");
    expect(body).not.toContain("tool-invoking");
  });

  it("ignores progress notifications outside the active web-chat channel", async () => {
    const agent: IAgentService = {
      chat: async () => {
        await harness.sendMessage("job-progress", {
          id: "batch-2",
          type: "batch",
          status: "completed",
          metadata: {
            rootJobId: "batch-2",
            operationType: "batch_processing",
            operationTarget: "/tmp/background",
            interfaceType: "web-chat",
            channelId: "other-conversation",
          },
        });
        return {
          text: "No visible progress.",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
      confirmPendingAction: async () => ({
        text: "Action confirmed.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
      invalidateAgent: (): void => {},
    };
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Run batch" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).not.toContain("data-progress");
    expect(body).not.toContain("/tmp/background");
  });

  it("does not infer artifact cards from assistant text without structured cards", async () => {
    const agent = createSpyAgentService({
      text: "Started generating image wild-robot.",
      toolResults: [
        {
          toolName: "system_create",
          jobId: "job-1",
          data: {
            success: true,
            entityId: "wild-robot",
            status: "generating",
          },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Generate a wild robot" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("Started generating image wild-robot.");
    expect(body).toContain("data-tool-result");
    expect(body).not.toContain("data-attachment");
    expect(body).not.toContain("/api/chat/attachments/image");
  });

  it("streams attachment cards as Brain data parts", async () => {
    const agent = createSpyAgentService({
      text: "Export ready.",
      cards: [
        {
          kind: "attachment",
          id: "attachment:report-1",
          title: "Weekly export",
          description: "PDF export generated by the publish tool.",
          attachment: {
            mediaType: "application/pdf",
            url: "/media/documents/report-1",
            downloadUrl: "/media/documents/report-1?download=1",
            filename: "weekly-export.pdf",
            sizeBytes: 42_000,
            source: {
              entityType: "document",
              entityId: "report-1",
              attachmentType: "export",
            },
          },
        },
      ],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Export this" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("data-attachment");
    expect(body).toContain("attachment:report-1");
    expect(body).toContain("Weekly export");
    expect(body).toContain("/media/documents/report-1");
    expect(body).not.toContain("tool-input-available");
  });

  it("serves generated PDF document attachments to operators", async () => {
    const plugin = operatorPlugin();
    harness.addEntities([
      {
        id: "deck-carousel",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0xLjc=",
        metadata: {
          filename: "deck-carousel.pdf",
          mimeType: "application/pdf",
        },
      },
    ]);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/document", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/document?id=deck-carousel&download=1",
      ),
    );
    const body = await response?.arrayBuffer();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/pdf");
    expect(response?.headers.get("content-disposition")).toBe(
      'attachment; filename="deck-carousel.pdf"',
    );
    expect(Buffer.from(body ?? new ArrayBuffer(0)).toString("utf8")).toBe(
      "%PDF-1.7",
    );
  });

  it("serves generated image attachments to operators", async () => {
    const plugin = operatorPlugin();
    harness.addEntities([
      {
        id: "mossy-robot",
        entityType: "image",
        content: "data:image/png;base64,iVBORw0KGgo=",
        metadata: {
          title: "Mossy robot",
          alt: "Mossy robot",
          format: "png",
          width: 1,
          height: 1,
        },
      },
    ]);
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/image", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/image?id=mossy-robot&download=1",
      ),
    );
    const body = await response?.arrayBuffer();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/png");
    expect(response?.headers.get("content-disposition")).toBe(
      'attachment; filename="mossy-robot.png"',
    );
    expect(Buffer.from(body ?? new ArrayBuffer(0)).toString("base64")).toBe(
      "iVBORw0KGgo=",
    );
  });

  it("rejects image attachment requests from non-operators", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/image", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/attachments/image?id=mossy-robot"),
    );

    expect(response?.status).toBe(401);
  });

  it("rejects document attachment requests from non-operators", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/attachments/document", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/attachments/document?id=deck-carousel",
      ),
    );

    expect(response?.status).toBe(401);
  });

  it("reports queued artifact job status to operators", async () => {
    const plugin = operatorPlugin();
    const shell = harness.getMockShell();
    shell.jobs.getStatus = async (jobId: string): Promise<JobStatus> =>
      makeJobStatus(jobId, "processing");
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/jobs/status", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/jobs/status?id=job-1"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ id: "job-1", status: "processing" });
  });

  it("rejects artifact job status requests from non-operators", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/jobs/status", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/jobs/status?id=job-1"),
    );

    expect(response?.status).toBe(401);
  });

  it("accepts multipart text uploads and returns a durable upload ref", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Notes\n\nShip durable uploads"], "../notes.md", {
        type: "text/markdown",
      }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as {
      id: string;
      ref: { kind: string; id: string };
      filename: string;
      mediaType: string;
      sizeBytes: number;
      createdAt: string;
      url: string;
      downloadUrl: string;
    };

    expect(response?.status).toBe(201);
    expect(body.id).toStartWith("upload-");
    expect(body.ref).toEqual({ kind: "web-chat-upload", id: body.id });
    expect(body.filename).toBe("notes.md");
    expect(body.mediaType).toBe("text/markdown");
    expect(body.sizeBytes).toBe(29);
    expect(Date.parse(body.createdAt)).not.toBeNaN();
    expect(body.url).toBe(`/api/chat/uploads?id=${body.id}`);
    expect(body.downloadUrl).toBe(`/api/chat/uploads?id=${body.id}&download=1`);

    const uploadDir = join(
      "/tmp/mock-shell-test-data",
      "web-chat",
      "uploads",
      body.id,
    );
    expect(await Bun.file(join(uploadDir, "content")).text()).toBe(
      "# Notes\n\nShip durable uploads",
    );
    expect(await Bun.file(join(uploadDir, "metadata.json")).json()).toEqual({
      id: body.id,
      ref: body.ref,
      filename: body.filename,
      mediaType: body.mediaType,
      sizeBytes: body.sizeBytes,
      createdAt: body.createdAt,
    });
  });

  it("stores multipart uploads in runtime data, not content brain-data", async () => {
    const root = "/tmp/web-chat-upload-path-test";
    await rm(root, { recursive: true, force: true });
    const scopedHarness = createPluginHarness<WebChatInterface>({
      dataDir: join(root, "brain-data"),
    });
    const plugin = new WebChatInterface(
      {},
      { resolveOperatorSession: async (): Promise<boolean> => true },
    );
    await scopedHarness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Runtime"], "runtime.md", { type: "text/markdown" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as { id: string };

    expect(response?.status).toBe(201);
    expect(
      await Bun.file(
        join(root, "data", "web-chat", "uploads", body.id, "content"),
      ).text(),
    ).toBe("# Runtime");
    expect(
      await Bun.file(
        join(root, "brain-data", "web-chat", "uploads", body.id, "content"),
      ).exists(),
    ).toBe(false);

    scopedHarness.reset();
    await rm(root, { recursive: true, force: true });
  });

  it("serves stored multipart text uploads to operators", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const downloadRoute = getRoute(plugin, "/api/chat/uploads", "GET");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Downloadable"], "notes.md", { type: "text/markdown" }),
    );
    const uploadResponse = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      id: string;
      url: string;
    };

    const response = await downloadRoute?.handler(
      new Request(`http://brain${upload.url}`),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/markdown");
    expect(response?.headers.get("Content-Disposition")).toBe(
      'inline; filename="notes.md"',
    );
    expect(await response?.text()).toBe("# Downloadable");
  });

  it("accepts and serves multipart image uploads to operators", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const downloadRoute = getRoute(plugin, "/api/chat/uploads", "GET");
    const image = pngBytes();
    const form = new FormData();
    form.set("file", new File([image], "robot.png", { type: "image/png" }));

    const uploadResponse = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      filename: string;
      mediaType: string;
      sizeBytes: number;
      url: string;
    };

    expect(uploadResponse?.status).toBe(201);
    expect(upload).toEqual(
      expect.objectContaining({
        filename: "robot.png",
        mediaType: "image/png",
        sizeBytes: image.byteLength,
      }),
    );

    const response = await downloadRoute?.handler(
      new Request(`http://brain${upload.url}`),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("image/png");
    expect(response?.headers.get("Content-Disposition")).toBe(
      'inline; filename="robot.png"',
    );
    if (!response) throw new Error("Missing download response");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
  });

  it("rejects stored upload downloads from non-operators", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "GET");

    const response = await route?.handler(
      new Request(
        "http://brain/api/chat/uploads?id=upload-00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(response?.status).toBe(403);
  });

  it("rejects multipart uploads from non-operators", async () => {
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("rejects unsupported multipart upload types", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["not text"], "image.png", { type: "image/png" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
  });

  it("rejects oversized multipart text uploads", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["x".repeat(100_001)], "large.txt", { type: "text/plain" }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("File upload too large");
  });

  it("rejects oversized uploads via Content-Length before buffering", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set("file", new File(["small"], "notes.txt", { type: "text/plain" }));

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        // Declared length far exceeds the upload limit + envelope slack, so the
        // guard rejects before the multipart body is buffered. No filename is
        // known yet, so the message carries no filename suffix.
        headers: { "content-length": "6000000" },
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toBe("File upload too large");
  });

  it("rejects binary content uploaded under a text filename", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0x68, 0x69, 0x00, 0xff])], "notes.txt", {
        type: "text/plain",
      }),
    );

    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
  });

  it("prunes stale stored uploads when a new upload arrives", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/uploads", "POST");

    const uploadsRoot = join(
      "/tmp/mock-shell-test-data",
      "web-chat",
      "uploads",
    );
    // Seed a stale upload dir (>24h old) that should be swept.
    const staleDir = join(
      uploadsRoot,
      "upload-00000000-0000-4000-8000-000000000000",
    );
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, "content"), "old");
    const staleAge = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(staleDir, staleAge, staleAge);

    const form = new FormData();
    form.set(
      "file",
      new File(["# Fresh"], "fresh.md", { type: "text/markdown" }),
    );
    const response = await route?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const body = (await response?.json()) as { id: string };

    expect(response?.status).toBe(201);
    // Stale dir removed, fresh upload retained.
    expect(await Bun.file(join(staleDir, "content")).exists()).toBe(false);
    expect(await Bun.file(join(uploadsRoot, body.id, "content")).exists()).toBe(
      true,
    );
  });

  it("passes durable upload refs to the agent as native text attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const form = new FormData();
    form.set(
      "file",
      new File(["# Durable Notes"], "durable-notes.md", {
        type: "text/markdown",
      }),
    );
    const uploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              content: "Summarize this",
              parts: [{ type: "data-upload", data: { ref: upload.ref } }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.message).toBe("Summarize this");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "text",
        filename: "durable-notes.md",
        mediaType: "text/markdown",
        content: "# Durable Notes",
        sizeBytes: 15,
        source: { kind: "web-chat-upload", id: upload.ref.id },
      },
    ]);
  });

  it("passes durable image upload refs to the agent as native file attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const image = pngBytes();
    const form = new FormData();
    form.set("file", new File([image], "robot.png", { type: "image/png" }));
    const uploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              content: "Describe this image",
              parts: [{ type: "data-upload", data: { ref: upload.ref } }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.message).toBe("Describe this image");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "file",
        filename: "robot.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
        source: { kind: "web-chat-upload", id: upload.ref.id },
      },
    ]);
  });

  it("reuses a prior durable upload ref for explicit follow-up image requests", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const image = pngBytes();
    const form = new FormData();
    form.set(
      "file",
      new File([image], "flirty-robot.png", { type: "image/png" }),
    );
    const uploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: form,
      }),
    );
    const upload = (await uploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              content: "",
              parts: [{ type: "data-upload", data: { ref: upload.ref } }],
            },
            {
              role: "assistant",
              content:
                "I got `flirty-robot.png`. What would you like me to do with it?",
              parts: [
                {
                  type: "text",
                  text: "I got `flirty-robot.png`. What would you like me to do with it?",
                },
              ],
            },
            {
              role: "user",
              content: "can you describe that picture for me",
              parts: [
                { type: "text", text: "can you describe that picture for me" },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.message).toBe(
      "can you describe that picture for me",
    );
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "file",
        filename: "flirty-robot.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
        source: { kind: "web-chat-upload", id: upload.ref.id },
      },
    ]);
  });

  it("asks which prior upload to use when a follow-up reference is ambiguous", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const uploadRoute = getRoute(plugin, "/api/chat/uploads", "POST");
    const chatRoute = getRoute(plugin, "/api/chat", "POST");
    const firstImage = pngBytes();
    const secondImage = pngBytes();
    const firstForm = new FormData();
    firstForm.set(
      "file",
      new File([firstImage], "first-robot.png", { type: "image/png" }),
    );
    const secondForm = new FormData();
    secondForm.set(
      "file",
      new File([secondImage], "second-robot.png", { type: "image/png" }),
    );
    const firstUploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: firstForm,
      }),
    );
    const secondUploadResponse = await uploadRoute?.handler(
      new Request("http://brain/api/chat/uploads", {
        method: "POST",
        body: secondForm,
      }),
    );
    const firstUpload = (await firstUploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };
    const secondUpload = (await secondUploadResponse?.json()) as {
      ref: { kind: string; id: string };
    };

    const response = await chatRoute?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "data-upload", data: { ref: firstUpload.ref } }],
            },
            {
              role: "user",
              parts: [{ type: "data-upload", data: { ref: secondUpload.ref } }],
            },
            {
              role: "user",
              content: "describe that image",
              parts: [{ type: "text", text: "describe that image" }],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(body).toContain("first-robot.png");
    expect(body).toContain("second-robot.png");
  });

  it("rejects invalid durable upload refs", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "data-upload",
                  data: { ref: { kind: "web-chat-upload", id: "../bad" } },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Invalid upload ref");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("handles AI SDK approval responses through the chat endpoint", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed: Delete note?",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          trigger: "submit-message",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  input: { noteId: "123" },
                  approval: {
                    id: "approval:call-1",
                    approved: true,
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      {
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
      },
    ]);
    expect(body).toContain("tool-output-available");
    expect(body).toContain("call-1");
  });

  it("handles approval responses when full message history includes prior user input", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed: Delete note?",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "user-message-1",
              role: "user",
              parts: [{ type: "text", text: "Delete it" }],
            },
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                { type: "text", text: "Confirmation required." },
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  input: { noteId: "123" },
                  approval: {
                    id: "approval:call-1",
                    approved: true,
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      {
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
      },
    ]);
    expect(body).toContain("tool-output-available");
    expect(body).toContain("call-1");
  });

  it("handles multiple AI SDK approval responses through one chat request", async () => {
    const agent = createSpyAgentService(undefined, {
      text: "Completed approval.",
      cards: [
        {
          kind: "tool-approval",
          id: "approval:call-1",
          toolCallId: "call-1",
          toolName: "delete_note",
          input: { noteId: "123" },
          summary: "Delete note?",
          state: "output-available",
          output: { success: true },
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-1", approved: true },
                },
                {
                  type: "dynamic-tool",
                  toolCallId: "call-2",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-2", approved: false },
                },
              ],
            },
          ],
        }),
      }),
    );

    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(0);
    expect(agent.confirmCalls).toEqual([
      {
        conversationId: "test-conversation",
        confirmed: true,
        approvalId: "approval:call-1",
      },
      {
        conversationId: "test-conversation",
        confirmed: false,
        approvalId: "approval:call-2",
      },
    ]);
    expect(body).toContain("tool-output-available");
  });

  it("routes new user messages instead of replaying old approval responses", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              id: "assistant-message-1",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolCallId: "call-1",
                  toolName: "delete_note",
                  state: "approval-responded",
                  approval: { id: "approval:call-1", approved: true },
                },
              ],
            },
            {
              role: "user",
              parts: [{ type: "text", text: "What happened next?" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.confirmCalls).toHaveLength(0);
    expect(agent.chatCalls).toEqual([
      {
        message: "What happened next?",
        conversationId: "test-conversation",
        context: expect.objectContaining({ interfaceType: "web-chat" }),
      },
    ]);
  });

  it("passes anchor permission level when caller has an operator session", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "Hello operator" }],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.context?.userPermissionLevel).toBe("anchor");
  });

  it("passes inline uploaded text file content to the agent as native attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Summarize this" },
                {
                  type: "file",
                  mediaType: "text/markdown",
                  filename: "meeting-notes.md",
                  url: textDataUrl("# Notes\n\n- Ship uploads"),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls).toHaveLength(1);
    expect(agent.chatCalls[0]?.message).toBe("Summarize this");
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "text",
        filename: "meeting-notes.md",
        mediaType: "text/markdown",
        content: "# Notes\n\n- Ship uploads",
        sizeBytes: 23,
      },
    ]);
  });

  it("passes inline uploaded image file parts to the agent as native file attachments", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");
    const image = pngBytes();

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Describe this" },
                {
                  type: "file",
                  mediaType: "image/png",
                  filename: "diagram.png",
                  url: pngDataUrl(image),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(agent.chatCalls[0]?.context?.attachments).toEqual([
      {
        kind: "file",
        filename: "diagram.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
      },
    ]);
  });

  it("rejects unsupported uploaded file types", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Read this" },
                {
                  type: "file",
                  mediaType: "application/octet-stream",
                  filename: "archive.bin",
                  url: "data:application/octet-stream;base64,AAECAw==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects binary content in an inline text file part", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const binaryDataUrl = `data:text/plain;base64,${Buffer.from(
      new Uint8Array([0x68, 0x69, 0x00, 0xff]),
    ).toString("base64")}`;

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                { type: "text", text: "Read this" },
                {
                  type: "file",
                  mediaType: "text/plain",
                  filename: "notes.txt",
                  url: binaryDataUrl,
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("Unsupported file upload type");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects oversized uploaded text files", async () => {
    const agent = createSpyAgentService();
    harness.setAgentService(agent);
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test-conversation",
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "file",
                  mediaType: "text/plain",
                  filename: "large.txt",
                  url: textDataUrl("x".repeat(100_001)),
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain("File upload too large");
    expect(agent.chatCalls).toHaveLength(0);
  });

  it("rejects sessions list requests from non-operators", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Hello"),
          ],
        },
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.text();

    expect(response?.status).toBe(403);
    expect(body).toBe("Forbidden");
  });

  it("lists web chat sessions for an operator", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat"),
          makeConversation("discord-session", "discord", {
            metadata: JSON.stringify({ channelName: "Discord" }),
          }),
        ],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "user",
              "What did Rover do today?\nPlease summarize it.",
            ),
          ],
          "discord-session": [],
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      sessions: [
        {
          id: "web-session",
          title: "What did Rover do today?",
          lastActiveAt: "2026-05-24T00:01:00.000Z",
        },
      ],
    });
  });

  it("uses renamed session titles from conversation metadata", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("web-session", "web-chat", {
            metadata: JSON.stringify({
              channelName: "Web Chat",
              title: "Renamed thread",
            }),
          }),
        ],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Original title"),
          ],
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body.sessions[0].title).toBe("Renamed thread");
  });

  it("does not list archived web chat sessions", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [
          makeConversation("active-session", "web-chat"),
          makeConversation("archived-session", "web-chat", {
            metadata: JSON.stringify({
              channelName: "Web Chat",
              archivedAt: "2026-05-24T00:02:00.000Z",
            }),
          }),
        ],
        messagesByConversation: {
          "active-session": [
            makeMessage("message-1", "active-session", "user", "Active"),
          ],
          "archived-session": [
            makeMessage("message-2", "archived-session", "user", "Archived"),
          ],
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body.sessions.map((session: { id: string }) => session.id)).toEqual([
      "active-session",
    ]);
  });

  it("rejects session deletes from non-operators", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "DELETE",
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("deletes web chat sessions for an operator", async () => {
    const shell = harness.getMockShell();
    const deleteCalls: string[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "DELETE",
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ deleted: true });
    expect(deleteCalls).toEqual(["web-session"]);
  });

  it("does not delete sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const deleteCalls: string[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        deleteConversation: async (conversationId): Promise<boolean> => {
          deleteCalls.push(conversationId);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=discord-session", {
        method: "DELETE",
      }),
    );

    expect(response?.status).toBe(404);
    expect(deleteCalls).toEqual([]);
  });

  it("rejects session deletes without an id", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "DELETE");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions", { method: "DELETE" }),
    );

    expect(response?.status).toBe(400);
  });

  it("rejects session renames from non-operators", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("renames web chat sessions for an operator", async () => {
    const shell = harness.getMockShell();
    const updateCalls: Array<{
      conversationId: string;
      metadata: Record<string, unknown>;
    }> = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ renamed: true, title: "Renamed thread" });
    expect(updateCalls).toEqual([
      { conversationId: "web-session", metadata: { title: "Renamed thread" } },
    ]);
  });

  it("does not rename sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const updateCalls: unknown[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=discord-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed thread" }),
      }),
    );

    expect(response?.status).toBe(404);
    expect(updateCalls).toEqual([]);
  });

  it("rejects invalid session rename requests", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions?id=web-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("rejects session archives from non-operators", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=web-session", {
        method: "PUT",
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("archives web chat sessions for an operator", async () => {
    const shell = harness.getMockShell();
    const updateCalls: Array<{
      conversationId: string;
      metadata: Record<string, unknown>;
    }> = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=web-session", {
        method: "PUT",
      }),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({ archived: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.conversationId).toBe("web-session");
    expect(typeof updateCalls[0]?.metadata["archivedAt"]).toBe("string");
  });

  it("does not archive sessions owned by other interfaces", async () => {
    const shell = harness.getMockShell();
    const updateCalls: unknown[] = [];
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("discord-session", "discord")],
        messagesByConversation: {},
        updateConversationMetadata: async (request): Promise<boolean> => {
          updateCalls.push(request);
          return true;
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/sessions/archive", "PUT");

    const response = await route?.handler(
      new Request("http://brain/api/chat/sessions/archive?id=discord-session", {
        method: "PUT",
      }),
    );

    expect(response?.status).toBe(404);
    expect(updateCalls).toEqual([]);
  });

  it("refuses to load session messages for non-operators", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage("message-1", "web-session", "user", "Hello"),
          ],
        },
      }),
    );
    const plugin = new WebChatInterface();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );

    expect(response?.status).toBe(403);
  });

  it("loads stored generated attachment cards for an operator", async () => {
    const card = {
      kind: "attachment",
      id: "attachment:mossy-robot",
      jobId: "job-1",
      title: "mossy-robot.png",
      description: "image generation has been queued.",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=mossy-robot",
        downloadUrl: "/api/chat/attachments/image?id=mossy-robot&download=1",
        filename: "mossy-robot.png",
        source: {
          entityType: "image",
          entityId: "mossy-robot",
          attachmentType: "generated",
        },
      },
    };
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "assistant",
              'Queued image generation.\n\n[Entities affected this turn: image "mossy-robot" (generating). Reference these IDs directly in follow-ups instead of searching for them.]',
              JSON.stringify({ cards: [card] }),
            ),
          ],
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          content: "Queued image generation.",
          cards: [card],
        },
      ],
    });
  });

  it("loads web chat session messages for an operator", async () => {
    const shell = harness.getMockShell();
    shell.setConversationService(
      makeFixedConversationService({
        conversations: [makeConversation("web-session", "web-chat")],
        messagesByConversation: {
          "web-session": [
            makeMessage(
              "message-1",
              "web-session",
              "user",
              "Hello",
              JSON.stringify({
                attachments: [
                  {
                    kind: "text",
                    filename: "notes.md",
                    mediaType: "text/markdown",
                    sizeBytes: 7,
                    source: { kind: "web-chat-upload", id: "upload-123" },
                  },
                ],
              }),
            ),
          ],
        },
      }),
    );
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat/messages", "GET");

    const response = await route?.handler(
      new Request("http://brain/api/chat/messages?id=web-session"),
    );
    const body = await response?.json();

    expect(response?.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Hello",
          attachments: [
            {
              kind: "text",
              filename: "notes.md",
              mediaType: "text/markdown",
              sizeBytes: 7,
              createdAt: "2026-05-24T00:00:30.000Z",
              source: { kind: "web-chat-upload", id: "upload-123" },
            },
          ],
        },
      ],
    });
  });

  it("rejects malformed chat POSTs", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const response = await route?.handler(
      new Request("http://brain/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("generates unique conversation ids across many calls", async () => {
    const plugin = operatorPlugin();
    await harness.installPlugin(plugin);
    const route = getRoute(plugin, "/api/chat", "POST");

    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const response = await route?.handler(
        new Request("http://brain/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                parts: [{ type: "text", text: `Hello ${i}` }],
              },
            ],
          }),
        }),
      );
      const body = (await response?.text()) ?? "";
      const match = /text-[0-9a-f-]+/.exec(body);
      if (match) ids.add(match[0]);
    }

    expect(ids.size).toBeGreaterThan(990);
  });
});
