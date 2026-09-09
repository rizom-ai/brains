import { afterEach, describe, expect, it, mock, type Mock } from "bun:test";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
} from "@brains/identity-service";
import { guestInterfaceType } from "@brains/contracts/chat";
import { createMockMCPService } from "@brains/mcp-service/test";
import type { Tool, IMCPService } from "@brains/mcp-service";
import type {
  IConversationService,
  Message,
} from "@brains/conversation-service";
import { createSilentLogger } from "@brains/test-utils";
import { AgentService } from "../src/agent-service";
import { filterToolsForCallOptions } from "../src/brain-agent";
import { convertToSDKTools } from "../src/sdk-tools";
import type { AgentConversationStore } from "../src/turn-processor";
import type {
  BrainAgent,
  BrainAgentConfig,
  BrainAgentFactory,
  ChatContext,
  AgentConfig,
  ActorEnricher,
} from "../src/agent-types";

const guestContext: ChatContext = {
  interfaceType: guestInterfaceType,
  userPermissionLevel: "public",
  isAnchor: false,
};
type Conversation = NonNullable<
  Awaited<ReturnType<IConversationService["getConversation"]>>
>;
const conversation: Conversation = {
  id: "visitor-conversation",
  sessionId: "visitor-conversation",
  channelId: "visitor-conversation",
  interfaceType: guestInterfaceType,
  personId: null,
  started: new Date().toISOString(),
  lastActive: new Date().toISOString(),
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  metadata: "{}",
};

function tool(name: string, overrides: Partial<Tool> = {}): Tool {
  return {
    name,
    description: name,
    inputSchema: {},
    visibility: "public",
    sideEffects: "none",
    handler: mock(async () => ({ success: true as const })),
    ...overrides,
  };
}

const services: AgentService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
});

interface GuestRuntimeHarness {
  service: AgentService;
  generate: Mock<BrainAgent["generate"]>;
  factory: Mock<BrainAgentFactory>;
  conversations: {
    [K in keyof AgentConversationStore]: Mock<AgentConversationStore[K]>;
  };
  getCharacter: Mock<IBrainCharacterService["getCharacter"]>;
  getProfile: Mock<IAnchorProfileService["getProfile"]>;
  getInstructions: Mock<IMCPService["getInstructions"]>;
  agentContextProvider: Mock<NonNullable<AgentConfig["agentContextProvider"]>>;
  uploadAttachmentResolver: Mock<
    NonNullable<AgentConfig["uploadAttachmentResolver"]>
  >;
  canonicalIdentityResolver: {
    enrichActor: Mock<ActorEnricher["enrichActor"]>;
  };
}

function harness(
  stored: Conversation | null = conversation,
  history: Message[] = [],
): GuestRuntimeHarness {
  const generate = mock<BrainAgent["generate"]>(async () => ({
    text: "Public answer",
    steps: [],
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  }));
  const factory = mock((config: BrainAgentConfig): BrainAgent => {
    void config;
    return { generate };
  });
  const conversations = {
    startConversation: mock(async () => conversation.id),
    getConversation: mock(async () => stored),
    getMessages: mock(async () => history),
    addMessage: mock(async () => {}),
  } satisfies AgentConversationStore;
  const getCharacter = mock(() => ({
    name: "PRIVATE CHARACTER",
    role: "private role",
    purpose: "private purpose",
    values: ["PRIVATE VALUE"],
  }));
  const getProfile = mock(() => ({
    name: "PRIVATE ANCHOR",
    description: "private description",
    email: "private@example.test",
  }));
  const mcp = createMockMCPService();
  const getInstructions = mock(() => ["PRIVATE PLUGIN INSTRUCTIONS"]);
  mcp.getInstructions = getInstructions;
  const agentContextProvider = mock(async () => []);
  const uploadAttachmentResolver = mock(async () => null);
  const canonicalIdentityResolver = {
    enrichActor: mock<ActorEnricher["enrichActor"]>(async (actor) => actor),
  };
  const service = AgentService.createFresh(
    mcp,
    conversations,
    { getCharacter },
    { getProfile },
    createSilentLogger(),
    {
      agentFactory: factory,
      agentInstructions: ["PRIVATE BRAIN INSTRUCTIONS"],
      agentContextProvider,
      uploadAttachmentResolver,
      canonicalIdentityResolver,
    },
  );
  services.push(service);
  return {
    service,
    generate,
    factory,
    conversations,
    getCharacter,
    getProfile,
    getInstructions,
    agentContextProvider,
    uploadAttachmentResolver,
    canonicalIdentityResolver,
  };
}

describe("guest runtime boundary", () => {
  it("rejects privilege, anchor, actor, source and attachment escalation before model or storage writes", async () => {
    const h = harness();
    const escalations: ChatContext[] = [
      { userPermissionLevel: "admin" },
      { userPermissionLevel: "trusted" },
      { isAnchor: true },
      {
        actor: {
          identity: { kind: "user", userId: "owner" },
          displayName: "Owner",
          interfaceType: "web-chat",
          role: "user",
        },
      },
      { source: { channelName: "Private inbox" } },
      {
        attachments: [
          {
            kind: "text",
            filename: "private.txt",
            mediaType: "text/plain",
            content: "PRIVATE",
          },
        ],
      },
    ];
    for (const escalation of escalations) {
      expect(
        h.service.chat("hello", conversation.id, {
          ...guestContext,
          ...escalation,
        }),
      ).rejects.toThrow("Guest execution denied");
    }
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.conversations.startConversation).not.toHaveBeenCalled();
    expect(h.conversations.addMessage).not.toHaveBeenCalled();
  });

  it("never creates a missing guest conversation or reads an operator conversation", async () => {
    for (const stored of [
      null,
      { ...conversation, interfaceType: "web-chat" },
      { ...conversation, personId: "owner" },
    ]) {
      const h = harness(stored);
      expect(
        h.service.chat("hello", conversation.id, guestContext),
      ).rejects.toThrow("Guest conversation unavailable");
      expect(h.generate).not.toHaveBeenCalled();
      expect(h.conversations.getMessages).not.toHaveBeenCalled();
      expect(h.conversations.startConversation).not.toHaveBeenCalled();
    }
  });

  it("denies authenticated runtime access to a guest conversation", async () => {
    const h = harness();
    expect(
      h.service.chat("hello", conversation.id, {
        interfaceType: "web-chat",
        userPermissionLevel: "admin",
      }),
    ).rejects.toThrow("Guest conversation unavailable");
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("excludes private configuration, enrichment, uploads and history metadata from guest context", async () => {
    const history: Message[] = [
      {
        id: "public-message",
        conversationId: conversation.id,
        role: "assistant",
        content: "Previous public answer",
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({
          userPermissionLevel: "public",
          entityMemoryRefs: [
            {
              entityType: "note",
              entityId: "PRIVATE REF",
              title: "PRIVATE TITLE",
            },
          ],
          uploadRefs: [
            {
              filename: "PRIVATE FILE",
              mediaType: "text/plain",
              source: { kind: "upload", id: "private-upload" },
            },
          ],
        }),
      },
      {
        id: "private-message",
        conversationId: conversation.id,
        role: "user",
        content: "PRIVATE HISTORY",
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({ userPermissionLevel: "admin" }),
      },
    ];
    const h = harness(conversation, history);
    const result = await h.service.chat("hello", conversation.id, guestContext);
    expect(result.text).toBe("Public answer");
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.conversations.startConversation).not.toHaveBeenCalled();
    expect(h.getCharacter).not.toHaveBeenCalled();
    expect(h.getProfile).not.toHaveBeenCalled();
    expect(h.getInstructions).not.toHaveBeenCalled();
    expect(h.agentContextProvider).not.toHaveBeenCalled();
    expect(h.uploadAttachmentResolver).not.toHaveBeenCalled();
    expect(h.canonicalIdentityResolver.enrichActor).not.toHaveBeenCalled();
    expect(JSON.stringify(h.factory.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(h.generate.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(h.generate.mock.calls)).toContain(
      "Previous public answer",
    );
    expect(h.conversations.addMessage).toHaveBeenCalledTimes(2);
  });

  it("keeps operator and guest agent caches separate and invalidates both", async () => {
    const h = harness();
    h.conversations.getConversation.mockImplementation(async (id) =>
      id === "operator" ? null : conversation,
    );
    const operatorContext: ChatContext = {
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
    };
    await h.service.chat("hello", "operator", operatorContext);
    await h.service.chat("hello", conversation.id, guestContext);
    expect(h.factory).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.factory.mock.calls[0])).toContain("PRIVATE");
    expect(JSON.stringify(h.factory.mock.calls[1])).not.toContain("PRIVATE");
    await h.service.chat("again", "operator", operatorContext);
    await h.service.chat("again", conversation.id, guestContext);
    expect(h.factory).toHaveBeenCalledTimes(2);
    h.service.invalidateAgent();
    await h.service.chat("again", conversation.id, guestContext);
    await h.service.chat("again", "operator", operatorContext);
    expect(h.factory).toHaveBeenCalledTimes(4);
  });

  it("rejects guest approval execution without enumerating pending actions", async () => {
    const h = harness();
    expect(
      h.service.confirmPendingAction(
        conversation.id,
        true,
        "approval",
        guestContext,
      ),
    ).rejects.toThrow("Guest execution denied");
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.conversations.addMessage).not.toHaveBeenCalled();
  });
});

describe("guest tool dispatch", () => {
  it("admits only explicitly public, side-effect-free reviewed tools", () => {
    const tools = [
      tool("system_search"),
      tool("system_get"),
      tool("system_list"),
      tool("system_create"),
      tool("new_plugin_read"),
      tool("remote-agent_ask"),
      tool("system_search", { sideEffects: "writes" }),
      tool("system_get", { visibility: "admin" }),
      tool("system_list", { agentTool: false }),
    ];
    expect(
      filterToolsForCallOptions(tools, {
        interfaceType: guestInterfaceType,
      }).map((entry) => entry.name),
    ).toEqual(["system_search", "system_get", "system_list"]);
  });

  it("filters at SDK conversion too and does not broadcast guest queries", async () => {
    const read = tool("system_search");
    const emit = mock(() => {});
    const tools = convertToSDKTools(
      [read, tool("system_create"), tool("new_plugin_read")],
      {
        conversationId: conversation.id,
        interfaceType: guestInterfaceType,
        userPermissionLevel: "public",
        isAnchor: false,
      },
      { emit },
    );
    expect(Object.keys(tools)).toEqual(["system_search"]);
    const execute = tools["system_search"]?.execute;
    if (!execute) throw new Error("Expected guest read tool");
    await execute({}, { toolCallId: "read", messages: [] });
    expect(read.handler).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userPermissionLevel: "public",
        isAnchor: false,
      }),
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it("rechecks tool declarations at dispatch rather than relying only on initial filtering", () => {
    const read = tool("system_search");
    const tools = convertToSDKTools(
      [read],
      {
        conversationId: conversation.id,
        interfaceType: guestInterfaceType,
        userPermissionLevel: "public",
      },
      { emit: mock(() => {}) },
    );
    const execute = tools["system_search"]?.execute;
    if (!execute) throw new Error("Expected reviewed read");
    read.sideEffects = "writes";
    expect(
      execute({}, { toolCallId: "changed", messages: [] }),
    ).rejects.toThrow("Guest execution denied");
    expect(read.handler).not.toHaveBeenCalled();
  });

  it("rejects privileged direct SDK conversion rather than passing authority into handlers", () => {
    expect(() =>
      convertToSDKTools(
        [tool("system_search")],
        {
          conversationId: conversation.id,
          interfaceType: guestInterfaceType,
          userPermissionLevel: "admin",
          isAnchor: true,
        },
        { emit: mock(() => {}) },
      ),
    ).toThrow("Guest execution denied");
  });
});
