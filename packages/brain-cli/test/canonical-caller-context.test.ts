import { afterEach, describe, expect, it } from "bun:test";
import {
  AgentService,
  type BrainAgent,
  type BrainAgentFactory,
  type BrainAgentResult,
  type BrainCallOptions,
} from "@brains/ai-service";
import { AuthService, type AuthPrincipal } from "@brains/auth-service";
import type { IConversationService } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockMCPService, createSilentLogger } from "@brains/test-utils";
import { WebChatInterface } from "@brains/web-chat";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];
const services: Array<{ close(): Promise<void> }> = [];

async function tempStorageDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "canonical-caller-context-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

type StoredConversation = NonNullable<
  Awaited<ReturnType<IConversationService["getConversation"]>>
>;
type StoredMessages = Awaited<ReturnType<IConversationService["getMessages"]>>;

function createMemoryConversationService(): IConversationService {
  const conversations = new Map<string, StoredConversation>();
  const messages = new Map<string, StoredMessages>();
  return {
    startConversation: async (request): Promise<string> => {
      const now = new Date().toISOString();
      conversations.set(request.sessionId, {
        id: request.sessionId,
        sessionId: request.sessionId,
        interfaceType: request.interfaceType,
        channelId: request.channelId,
        personId: request.personId ?? null,
        started: now,
        lastActive: now,
        created: now,
        updated: now,
        metadata: JSON.stringify(request.metadata),
      });
      return request.sessionId;
    },
    addMessage: async (request): Promise<void> => {
      const conversationMessages = messages.get(request.conversationId) ?? [];
      conversationMessages.push({
        id: `msg_${conversationMessages.length + 1}`,
        conversationId: request.conversationId,
        role: request.role,
        content: request.content,
        timestamp: new Date().toISOString(),
        metadata: request.metadata ? JSON.stringify(request.metadata) : null,
      });
      messages.set(request.conversationId, conversationMessages);
    },
    getMessages: async (conversationId): Promise<StoredMessages> =>
      messages.get(conversationId) ?? [],
    countMessages: async (conversationId): Promise<number> =>
      messages.get(conversationId)?.length ?? 0,
    getConversation: async (
      conversationId,
    ): Promise<StoredConversation | null> =>
      conversations.get(conversationId) ?? null,
    listConversationsUpdatedSince: async (): Promise<
      StoredConversation[]
    > => [],
    listConversations: async (): Promise<StoredConversation[]> =>
      Array.from(conversations.values()),
    searchConversations: async (): Promise<StoredConversation[]> => [],
    updateConversationMetadata: async (): Promise<boolean> => true,
    deleteConversation: async (conversationId): Promise<boolean> =>
      conversations.delete(conversationId),
    close: (): void => {},
  };
}

async function sendChat(
  plugin: WebChatInterface,
  sessionCookie: string,
  conversationId: string,
): Promise<void> {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === "/api/chat" && candidate.method === "POST",
    );
  if (!route) throw new Error("Missing POST /api/chat route");

  const response = await route.handler(
    new Request("http://brain.example.com/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        id: conversationId,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Who am I to you?" }],
          },
        ],
      }),
    }),
  );
  expect(response.status).toBe(200);
  await response.text();
}

describe("canonical authenticated caller context", () => {
  it("carries resolved Anchor and permission facts into AI call options", async () => {
    const auth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "http://brain.example.com",
      anchor: "person",
    });
    services.push(auth);
    await auth.initialize();

    const anchorSession = await auth.createAuthSession();
    const trusted = await auth.createUser({
      displayName: "Trusted Member",
      role: "trusted",
    });
    const trustedSession = await auth.createAuthSession(trusted.userId);
    const additionalAdmin = await auth.createUser({
      displayName: "Additional Admin",
      role: "admin",
    });
    const additionalAdminSession = await auth.createAuthSession(
      additionalAdmin.userId,
    );

    const callOptions: BrainCallOptions[] = [];
    const agentFactory: BrainAgentFactory = (): BrainAgent => ({
      generate: async ({ options }): Promise<BrainAgentResult> => {
        callOptions.push(options);
        return {
          text: "Context captured.",
          steps: [],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    });
    const logger = createSilentLogger("canonical-caller-context");
    const harness = createPluginHarness<WebChatInterface>({ logger });
    const shell = harness.getMockShell();
    shell.setConversationService(createMemoryConversationService());
    const agent = AgentService.createFresh(
      createMockMCPService(),
      shell.getConversationService(),
      { getCharacter: () => shell.getIdentity() },
      { getProfile: () => shell.getProfile() },
      logger,
      { agentFactory },
    );
    services.push({ close: (): Promise<void> => agent.shutdown() });
    harness.setAgentService(agent);

    const plugin = new WebChatInterface(
      {},
      {
        resolveAuthPrincipal: (request): Promise<AuthPrincipal | undefined> =>
          auth.resolveSession(request),
      },
    );
    await harness.installPlugin(plugin);

    await sendChat(plugin, anchorSession.cookie, "anchor-conversation");
    await sendChat(plugin, trustedSession.cookie, "trusted-conversation");
    await sendChat(
      plugin,
      additionalAdminSession.cookie,
      "additional-admin-conversation",
    );

    expect(
      callOptions.map((options) => ({
        permissionLevel: options.userPermissionLevel,
        isAnchor: options.isAnchor,
      })),
    ).toEqual([
      { permissionLevel: "admin", isAnchor: true },
      { permissionLevel: "trusted", isAnchor: false },
      { permissionLevel: "admin", isAnchor: false },
    ]);
    for (const options of callOptions) {
      expect(options).not.toHaveProperty("session");
      expect(options).not.toHaveProperty("claims");
      expect(options).not.toHaveProperty("credentials");
    }
  });
});
