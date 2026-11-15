import { createMockMCPService } from "@brains/mcp-service/test";
import { describe, expect, it, mock } from "bun:test";
import type { Channel } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import type { IConversationService } from "@brains/conversation-service";
import { AgentService } from "../src/agent-service";
import type { BrainAgent, BrainAgentResult } from "../src/agent-types";
import {
  agentTurnCompletedChannel,
  type AgentTurnCompletedEvent,
} from "../src/turn-events";
import type { ToolEventEmitter } from "../src/tool-events";

const generated: BrainAgentResult = {
  text: "Found it.",
  steps: [
    {
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "system_get",
          input: { entityType: "note", id: "note-1" },
        },
      ],
      toolResults: [
        {
          toolCallId: "call-1",
          toolName: "system_get",
          output: { success: true, data: { id: "note-1" } },
        },
      ],
    },
  ],
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
};

const conversationService: IConversationService = {
  startConversation: mock(() => Promise.resolve("conversation-1")),
  addMessage: mock(() => Promise.resolve()),
  getMessages: mock(() => Promise.resolve([])),
  countMessages: mock(() => Promise.resolve(0)),
  getConversation: mock(() => Promise.resolve(null)),
  listConversations: mock(() => Promise.resolve([])),
  searchConversations: mock(() => Promise.resolve([])),
  updateConversationMetadata: mock(() => Promise.resolve(false)),
  deleteConversation: mock(() => Promise.resolve(false)),
  deleteExpiredGuestConversations: mock(() => Promise.resolve(0)),
  close: mock(() => {}),
};

function createService(emitter: ToolEventEmitter): AgentService {
  const agent: BrainAgent = { generate: mock(async () => generated) };
  return AgentService.createFresh(
    createMockMCPService(),
    conversationService,
    {
      getCharacter: () => ({
        name: "Test Brain",
        role: "Test assistant",
        purpose: "Help with testing",
        values: [],
      }),
    },
    { getProfile: () => ({ name: "Test Anchor", description: "Test" }) },
    createSilentLogger(),
    { agentFactory: () => agent, turnEvents: emitter },
  );
}

describe("agent turn events", () => {
  it("announces a finished turn with the tool results its response carries", async () => {
    const events: Array<{ channel: string; payload: unknown }> = [];
    const emitter: ToolEventEmitter = {
      emit: <TPayload>(channel: Channel<TPayload>, payload: TPayload) => {
        events.push({ channel: channel.name, payload });
      },
    };
    const service = createService(emitter);

    const response = await service.chat("Find note-1", "conversation-1", {
      userPermissionLevel: "admin",
      interfaceType: "mcp",
    });

    const expected: AgentTurnCompletedEvent = {
      conversationId: "conversation-1",
      toolResults: response.toolResults ?? [],
    };
    expect(response.toolResults).toHaveLength(1);
    expect(events).toEqual([
      { channel: agentTurnCompletedChannel.name, payload: expected },
    ]);
  });
});
