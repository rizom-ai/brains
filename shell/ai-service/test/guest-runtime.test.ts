import { afterEach, describe, expect, it, mock, type Mock } from "bun:test";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
} from "@brains/identity-service";
import { guestInterfaceType } from "@brains/contracts/chat";
import { testGuestExecution } from "./fixtures/guest-execution";
import { createMockMCPService } from "@brains/mcp-service/test";
import type { Tool, IMCPService } from "@brains/mcp-service";
import type {
  IConversationService,
  Message,
} from "@brains/conversation-service";
import { createSilentLogger } from "@brains/test-utils";
import { AgentService } from "../src/agent-service";
import { EmbeddingUsageMeter } from "../src/embedding-usage-meter";
import {
  openAiEmbeddingPricingRevision,
  openAiGuestPricingRevision,
} from "../src/openai-guest-pricing";
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
  guestExecution: testGuestExecution,
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
  config: Partial<AgentConfig> = {},
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
      ...config,
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

  it("requires reserved runtime limits and rejects oversized input before storage writes", async () => {
    const h = harness();
    expect(
      h.service.chat("hello", conversation.id, {
        interfaceType: guestInterfaceType,
        userPermissionLevel: "public",
      }),
    ).rejects.toThrow("Guest execution limits required");
    expect(
      h.service.chat(
        "x".repeat(testGuestExecution.limits.messageCharacters + 1),
        conversation.id,
        guestContext,
      ),
    ).rejects.toThrow("Guest input limit exceeded");
    expect(h.conversations.getMessages).not.toHaveBeenCalled();
    expect(h.conversations.addMessage).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("surfaces failed guest execution as a failure rather than a successful error-text response", () => {
    const h = harness();
    h.generate.mockImplementationOnce(async () => {
      throw new Error("PRIVATE execution details");
    });
    expect(
      h.service.chat("Question", conversation.id, guestContext),
    ).rejects.toThrow("Guest execution unavailable");
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

  it("gives the guest the brain's identity and public profile, but no email, enrichment, uploads or private history", async () => {
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
    expect(h.generate.mock.calls[0]?.[0].options.guestExecution).toEqual(
      testGuestExecution,
    );
    expect(h.conversations.startConversation).not.toHaveBeenCalled();
    expect(h.agentContextProvider).not.toHaveBeenCalled();
    expect(h.uploadAttachmentResolver).not.toHaveBeenCalled();
    expect(h.canonicalIdentityResolver.enrichActor).not.toHaveBeenCalled();
    const [guestConfig] = h.factory.mock.calls[0] ?? [];
    expect(guestConfig?.identity.name).toBe("PRIVATE CHARACTER");
    expect(guestConfig?.profile?.name).toBe("PRIVATE ANCHOR");
    expect(JSON.stringify(h.factory.mock.calls)).not.toContain(
      "private@example.test",
    );
    expect(JSON.stringify(h.generate.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(h.generate.mock.calls)).toContain(
      "Previous public answer",
    );
    expect(h.conversations.addMessage).toHaveBeenCalledTimes(2);
  });

  it("persists only projected source cards in guest history", async () => {
    const h = harness();
    h.generate.mockResolvedValue({
      text: "Public answer",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      steps: [
        {
          toolCalls: [
            {
              toolName: "system_get",
              toolCallId: "read",
              input: { entityType: "note", id: "public-note" },
            },
          ],
          toolResults: [
            {
              toolName: "system_get",
              toolCallId: "read",
              output: {
                success: true,
                data: {
                  entity: {
                    id: "public-note",
                    entityType: "note",
                    content: "Public evidence",
                    metadata: {
                      title: "Public note",
                      url: "https://example.org/source",
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    });
    await h.service.chat("What is public?", conversation.id, guestContext);
    const stored = JSON.stringify(h.conversations.addMessage.mock.calls);
    expect(stored).toContain("sources:tool-results");
    expect(stored).toContain("note:public-note");
    expect(stored).not.toContain("provenance");
    expect(stored).not.toContain("system_get");
    expect(stored).not.toContain("PRIVATE");
  });

  describe("gives an answer the public pages closest to it as its sources", () => {
    // The lookup found a social post about an essay; the answer is about the essay.
    const lookupSteps = [
      {
        toolCalls: [
          {
            toolName: "system_search",
            toolCallId: "search",
            input: { query: "memory" },
          },
        ],
        toolResults: [
          {
            toolName: "system_search",
            toolCallId: "search",
            output: {
              success: true,
              data: {
                results: [
                  {
                    entity: {
                      id: "announcement",
                      entityType: "social-post",
                      content: "I published an essay",
                      metadata: { title: "Announcement" },
                    },
                    score: 0.9,
                  },
                ],
              },
            },
          },
        ],
      },
    ];
    const essay = {
      id: "post:hiding-in-plain-sight",
      title: "Hiding in Plain Sight",
      source: "post",
      entityType: "post",
      entityId: "hiding-in-plain-sight",
      url: "/essays/hiding-in-plain-sight",
    };
    function sourceIds(cards: unknown): string[] {
      return (Array.isArray(cards) ? cards : []).flatMap((card: unknown) =>
        typeof card === "object" &&
        card !== null &&
        "kind" in card &&
        card.kind === "sources" &&
        "sources" in card &&
        Array.isArray(card.sources)
          ? card.sources.map((source: { id: string }) => source.id)
          : [],
      );
    }

    it("instead of what the lookups happened to return", async () => {
      const guestAnswerSources = mock(async () => [essay]);
      const h = harness(conversation, [], { guestAnswerSources });
      h.generate.mockResolvedValue({
        text: "Storage is not memory.",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        steps: lookupSteps,
      });
      const response = await h.service.chat(
        "What is memory?",
        conversation.id,
        guestContext,
      );
      expect(guestAnswerSources).toHaveBeenCalledWith({
        answer: "Storage is not memory.",
      });
      expect(sourceIds(response.cards)).toEqual(["post:hiding-in-plain-sight"]);
      const stored = JSON.stringify(h.conversations.addMessage.mock.calls);
      expect(stored).toContain("post:hiding-in-plain-sight");
      expect(stored).not.toContain("social-post:announcement");
    });

    it("keeps the lookups' sources when the closest pages cannot be found", async () => {
      const guestAnswerSources = mock(async () => {
        throw new Error("index unavailable");
      });
      const h = harness(conversation, [], { guestAnswerSources });
      h.generate.mockResolvedValue({
        text: "Storage is not memory.",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        steps: lookupSteps,
      });
      const response = await h.service.chat(
        "What is memory?",
        conversation.id,
        guestContext,
      );
      expect(sourceIds(response.cards)).toEqual(["social-post:announcement"]);
    });

    it("only for a visitor's answer", async () => {
      const guestAnswerSources = mock(async () => [essay]);
      const h = harness(null, [], { guestAnswerSources });
      h.generate.mockResolvedValue({
        text: "Storage is not memory.",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        steps: lookupSteps,
      });
      await h.service.chat("What is memory?", "operator-conversation", {
        interfaceType: "cli",
        userPermissionLevel: "admin",
        isAnchor: true,
      });
      expect(guestAnswerSources).not.toHaveBeenCalled();
    });
  });

  describe("a question asked before", () => {
    const citedIds = (cards: unknown): string[] =>
      (Array.isArray(cards) ? cards : []).flatMap((card: unknown) =>
        typeof card === "object" &&
        card !== null &&
        "kind" in card &&
        card.kind === "sources" &&
        "sources" in card &&
        Array.isArray(card.sources)
          ? card.sources.map((source: { id: string }) => source.id)
          : [],
      );
    const askedBefore = {
      faqId: "how-does-rizom-keep-memory",
      answer: "Rizom keeps memory in the brains of the people who hold it.",
      sources: [
        {
          id: "network-piece:plc-peer--post--3kabc",
          source: "network-piece",
          entityType: "network-piece",
          entityId: "plc-peer--post--3kabc",
          title: "Handoffs between teams",
          url: "https://becca.rizom.ai/essays/handoffs",
          brain: { name: "Becca", url: "https://becca.rizom.ai" },
        },
      ],
    };
    it("is answered from the FAQ, with its sources, before the model", async () => {
      const guestAskedBefore = mock(async () => askedBefore);
      const h = harness(conversation, [], { guestAskedBefore });
      const response = await h.service.chat(
        "How does Rizom keep memory?",
        conversation.id,
        guestContext,
      );
      expect(guestAskedBefore).toHaveBeenCalledWith({
        question: "How does Rizom keep memory?",
      });
      expect(h.generate).not.toHaveBeenCalled();
      // Nothing was prepared for a model that was never asked.
      expect(h.agentContextProvider).not.toHaveBeenCalled();
      // The turn cost nothing but its own check, and says so.
      expect(response.guestSettlement).toEqual({
        usage: {
          modelCalls: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          embeddingTokens: 0,
        },
        cost: {
          state: "known",
          microUsd: 0,
          pricing: openAiGuestPricingRevision,
        },
      });
      expect(response.text).toBe(askedBefore.answer);
      expect(response.askedBefore).toEqual({
        faqId: "how-does-rizom-keep-memory",
      });
      expect(citedIds(response.cards)).toEqual([
        "network-piece:plc-peer--post--3kabc",
      ]);
      // The question and the answer are the conversation's, as any turn's.
      const roles = h.conversations.addMessage.mock.calls.map(
        ([message]) => message.role,
      );
      expect(roles).toEqual(["user", "assistant"]);
      const stored = JSON.stringify(h.conversations.addMessage.mock.calls);
      expect(stored).toContain("network-piece:plc-peer--post--3kabc");
      expect(stored).toContain("Becca");
      // History knows a FAQ answered, as the live box does.
      const [, reply] = h.conversations.addMessage.mock.calls;
      expect(reply?.[0].metadata).toMatchObject({
        askedBefore: { faqId: "how-does-rizom-keep-memory" },
      });
    });
    it("charges the check's own embedding to the turn", async () => {
      const embeddingUsage = EmbeddingUsageMeter.createFresh();
      const guestAskedBefore = mock(async () => {
        // Finding the FAQ embeds the question.
        embeddingUsage.record("text-embedding-3-small", 12);
        return askedBefore;
      });
      const h = harness(conversation, [], { guestAskedBefore, embeddingUsage });
      const response = await h.service.chat(
        "How does Rizom keep memory?",
        conversation.id,
        guestContext,
      );
      expect(response.guestSettlement?.usage.embeddingTokens).toBe(12);
      expect(response.guestSettlement?.cost).toMatchObject({
        state: "known",
        pricing: `${openAiGuestPricingRevision}+${openAiEmbeddingPricingRevision}`,
      });
    });

    it("goes to the model when no FAQ asks it, or the check fails", async () => {
      const h = harness(conversation, [], {
        guestAskedBefore: mock(async () => undefined),
      });
      await h.service.chat("Something new?", conversation.id, guestContext);
      expect(h.generate).toHaveBeenCalledTimes(1);
      const failing = harness(conversation, [], {
        guestAskedBefore: mock(async () => {
          throw new Error("faq index unavailable");
        }),
      });
      const response = await failing.service.chat(
        "Something new?",
        conversation.id,
        guestContext,
      );
      expect(failing.generate).toHaveBeenCalledTimes(1);
      expect(response.askedBefore).toBeUndefined();
    });
    it("is never consulted for an owner's turn", async () => {
      const guestAskedBefore = mock(async () => askedBefore);
      const h = harness(null, [], { guestAskedBefore });
      await h.service.chat(
        "How does Rizom keep memory?",
        "operator-conversation",
        {
          interfaceType: "cli",
          userPermissionLevel: "admin",
          isAnchor: true,
        },
      );
      expect(guestAskedBefore).not.toHaveBeenCalled();
      expect(h.generate).toHaveBeenCalledTimes(1);
    });
  });

  it("carries a guest turn's settled usage to its transport", async () => {
    const h = harness();
    const guestSettlement = {
      usage: {
        modelCalls: 1,
        inputTokens: 10,
        cachedInputTokens: 3,
        outputTokens: 4,
        reasoningTokens: 1,
        embeddingTokens: 0,
      },
      cost: { state: "known" as const, microUsd: 9, pricing: "test-revision" },
    };
    h.generate.mockResolvedValue({
      text: "Public answer",
      steps: [],
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      guestSettlement,
    });
    const response = await h.service.chat(
      "What is public?",
      conversation.id,
      guestContext,
    );
    expect(response.guestSettlement).toEqual(guestSettlement);
  });

  it("adds the embeddings a guest turn made, in its searches and in finding its sources, to its settlement", async () => {
    const embeddingUsage = EmbeddingUsageMeter.createFresh();
    const guestAnswerSources = mock(async () => {
      // Finding the answer's sources embeds the answer.
      embeddingUsage.record("text-embedding-3-small", 40);
      return [];
    });
    const h = harness(conversation, [], { guestAnswerSources, embeddingUsage });
    h.generate.mockImplementation(async () => {
      // The model's own search embeds its query.
      embeddingUsage.record("text-embedding-3-small", 10);
      return {
        text: "Public answer",
        steps: [],
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
        guestSettlement: {
          usage: {
            modelCalls: 1,
            inputTokens: 10,
            cachedInputTokens: 3,
            outputTokens: 4,
            reasoningTokens: 1,
            embeddingTokens: 0,
          },
          cost: { state: "known", microUsd: 9, pricing: "test-revision" },
        },
      };
    });
    // Embeddings outside the turn are not its cost.
    embeddingUsage.record("text-embedding-3-small", 1_000);
    const response = await h.service.chat(
      "What is public?",
      conversation.id,
      guestContext,
    );
    expect(response.guestSettlement?.usage.embeddingTokens).toBe(50);
    expect(response.guestSettlement?.cost).toEqual({
      state: "known",
      microUsd: 10,
      pricing: `test-revision+${openAiEmbeddingPricingRevision}`,
    });
  });

  describe("screens a visitor's question", () => {
    const guestScreening = {
      topics: ["essays on memory"],
      refusal: "I only talk about my essays.",
    };

    it("with the site's topics and refusal", async () => {
      const h = harness();
      await h.service.chat("What is memory?", conversation.id, {
        ...guestContext,
        guestScreening,
      });
      expect(h.generate.mock.calls[0]?.[0].options.guestScreening).toEqual(
        guestScreening,
      );
    });

    it("and carries a refusal out without finding sources for it", async () => {
      const guestAnswerSources = mock(async () => []);
      const h = harness(conversation, [], { guestAnswerSources });
      h.generate.mockResolvedValue({
        text: guestScreening.refusal,
        steps: [],
        usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
        guestScreening: { outcome: "refused", category: "off-topic" },
      });
      const response = await h.service.chat(
        "Write my homework",
        conversation.id,
        { ...guestContext, guestScreening },
      );
      expect(response.text).toBe(guestScreening.refusal);
      expect(response.guestScreening).toEqual({
        outcome: "refused",
        category: "off-topic",
      });
      expect(response.cards).toBeUndefined();
      expect(guestAnswerSources).not.toHaveBeenCalled();
    });

    it("and carries an answered outcome with the answer", async () => {
      const h = harness();
      h.generate.mockResolvedValue({
        text: "Public answer",
        steps: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        guestScreening: { outcome: "answered" },
      });
      const response = await h.service.chat(
        "What is memory?",
        conversation.id,
        guestContext,
      );
      expect(response.guestScreening).toEqual({ outcome: "answered" });
    });

    it("never for the owner", async () => {
      const h = harness(null);
      await h.service.chat("What is memory?", "operator-conversation", {
        interfaceType: "cli",
        userPermissionLevel: "admin",
        isAnchor: true,
        guestScreening,
      });
      expect(
        h.generate.mock.calls[0]?.[0].options.guestScreening,
      ).toBeUndefined();
    });
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
    expect(JSON.stringify(h.factory.mock.calls[0])).toContain(
      "private@example.test",
    );
    expect(JSON.stringify(h.factory.mock.calls[1])).not.toContain(
      "private@example.test",
    );
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

  // The model relays these outcomes to the visitor, so each says what happened
  // without the handler's own words.
  describe("tells the model what a guest lookup found", () => {
    async function lookup(read: Tool): Promise<unknown> {
      const tools = convertToSDKTools(
        [read],
        {
          conversationId: conversation.id,
          interfaceType: guestInterfaceType,
          userPermissionLevel: "public",
        },
        { emit: mock(() => {}) },
      );
      const execute = tools[read.name]?.execute;
      if (!execute) throw new Error("Expected guest read tool");
      return execute({}, { toolCallId: "read", messages: [] });
    }

    it("passes a lookup's own answer to the model, so it can correct its request", async () => {
      const read = tool("system_list", {
        handler: mock(async () => ({
          success: false,
          error: "Unknown entity type: projects. Available: post, project",
        })),
      });
      expect(await lookup(read)).toEqual({
        success: false,
        error: "Unknown entity type: projects. Available: post, project",
      });
    });

    it("bounds a lookup's own answer", async () => {
      const read = tool("system_get", {
        handler: mock(async () => ({
          success: false,
          error: "x".repeat(2000),
        })),
      });
      const result = await lookup(read);
      expect(result).toMatchObject({ success: false });
      expect(JSON.stringify(result).length).toBeLessThan(600);
    });

    it("reports a lookup that fails with an empty answer as no match", async () => {
      const read = tool("system_get", {
        handler: mock(async () => ({ success: false, error: " " })),
      });
      expect(await lookup(read)).toEqual({
        success: false,
        error: "Nothing public matches that request.",
      });
    });

    it("keeps a failing lookup's details private and reports it unavailable", async () => {
      const read = tool("system_search", {
        handler: mock(async () => {
          throw new Error("PRIVATE storage failure");
        }),
      });
      expect(await lookup(read)).toEqual({
        success: false,
        error: "Public retrieval unavailable",
      });
    });
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
