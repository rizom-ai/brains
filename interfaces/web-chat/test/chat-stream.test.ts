import { describe, expect, it, mock } from "bun:test";
import {
  handleStreamedChat,
  handleStreamedConfirmations,
} from "../src/chat-stream";

const leakedFooter =
  '\n\n[Entities affected this turn: anchor-profile "anchor-profile" (updated). Reference these IDs directly in follow-ups instead of searching for them.]';

function createWriter(): {
  writer: { write: ReturnType<typeof mock> };
  writes: unknown[];
} {
  const writes: unknown[] = [];
  const writer = {
    write: mock((part: unknown) => {
      writes.push(part);
    }),
  };
  return { writer, writes };
}

function textDeltas(writes: unknown[]): string[] {
  return writes.flatMap((write) => {
    if (
      typeof write === "object" &&
      write !== null &&
      "type" in write &&
      write.type === "text-delta" &&
      "delta" in write &&
      typeof write.delta === "string"
    ) {
      return [write.delta];
    }
    return [];
  });
}

function createDeps(agent: {
  chat?: ReturnType<typeof mock>;
  confirmPendingAction?: ReturnType<typeof mock>;
}): Parameters<typeof handleStreamedChat>[1] {
  return {
    activeStreams: new Map(),
    agent: agent as never,
    startProcessingInput: mock(() => {}),
    endProcessingInput: mock(() => {}),
    handleAgentResponseToolStatuses: mock(async () => {}),
    createId: (prefix: string) => `${prefix}-id`,
  };
}

describe("chat stream", () => {
  it("does not stream internal entity memory footer text from chat responses", async () => {
    const { writer, writes } = createWriter();
    const deps = createDeps({
      chat: mock(async () => ({
        text: `Completed: Updated anchor profile.${leakedFooter}`,
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })),
    });

    await handleStreamedChat(
      {
        writer: writer as never,
        conversationId: "conversation-1",
        message: "Yeehaa",
        permissionLevel: "anchor",
        attachments: [],
        interfaceType: "web-chat",
      },
      deps,
    );

    const streamedText = textDeltas(writes).join("\n");
    expect(streamedText).toBe("Completed: Updated anchor profile.");
    expect(streamedText).not.toContain("Entities affected this turn");
    expect(streamedText).not.toContain("Reference these IDs directly");
  });

  it("does not stream internal entity memory footer text from confirmation responses", async () => {
    const { writer, writes } = createWriter();
    const deps = createDeps({
      confirmPendingAction: mock(async () => ({
        text: `Completed: Updated anchor profile.${leakedFooter}`,
        toolResults: [],
        cards: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })),
    });

    await handleStreamedConfirmations(
      {
        writer: writer as never,
        conversationId: "conversation-1",
        approvalResponses: [{ id: "approval-1", approved: true }],
        permissionLevel: "anchor",
        interfaceType: "web-chat",
      },
      deps,
    );

    const streamedText = textDeltas(writes).join("\n");
    expect(streamedText).toBe("Completed: Updated anchor profile.");
    expect(streamedText).not.toContain("Entities affected this turn");
    expect(streamedText).not.toContain("Reference these IDs directly");
  });
});
