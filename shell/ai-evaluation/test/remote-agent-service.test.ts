import { afterEach, describe, expect, it, mock } from "bun:test";

import { RemoteAgentService } from "../src/remote-agent-service";

const originalFetch = globalThis.fetch;

describe("RemoteAgentService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should send explicit approval ids when confirming remote actions", async () => {
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            text: "Action confirmed.",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new RemoteAgentService({ baseUrl: "http://brain.test" });
    await service.confirmPendingAction(
      "conversation-1",
      true,
      "approval:delete",
      { userPermissionLevel: "anchor", interfaceType: "evaluation" },
    );

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://brain.test/api/chat/confirm");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      conversationId: "conversation-1",
      confirmed: true,
      approvalId: "approval:delete",
      context: { userPermissionLevel: "anchor", interfaceType: "evaluation" },
    });
  });

  it("should parse multiple pending confirmations and approval cards", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            text: "Confirmation required.",
            pendingConfirmations: [
              {
                id: "approval:update",
                toolName: "system_update",
                summary: "Update agent?",
                args: { id: "agent-1" },
              },
              {
                id: "approval:delete",
                toolName: "system_delete",
                summary: "Delete note?",
                args: { id: "note-1" },
              },
            ],
            cards: [
              {
                kind: "tool-approval",
                id: "approval:update",
                toolName: "system_update",
                summary: "Update agent?",
                state: "approval-requested",
              },
            ],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new RemoteAgentService({ baseUrl: "http://brain.test" });
    const response = await service.chat("change things", "conversation-1");

    expect(
      response.pendingConfirmations?.map((confirmation) => confirmation.id),
    ).toEqual(["approval:update", "approval:delete"]);
    expect(response.cards?.[0]?.id).toBe("approval:update");
  });

  it("should ignore legacy singular pending confirmations from remote responses", async () => {
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            text: "Confirmation required.",
            pendingConfirmation: {
              id: "approval:legacy",
              toolName: "system_delete",
              summary: "Delete note?",
              args: { id: "note-1" },
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new RemoteAgentService({ baseUrl: "http://brain.test" });
    const response = await service.chat("delete note", "conversation-1");

    expect(response.pendingConfirmations).toBeUndefined();
  });
});
