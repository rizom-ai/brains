import { afterEach, describe, expect, it, mock } from "bun:test";
import { Effect } from "@brains/utils/effect";
import type { Clock } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";

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
    expect(call?.[0]).toBe("http://brain.test/api/agent/chat/confirm");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      conversationId: "conversation-1",
      confirmed: true,
      approvalId: "approval:delete",
    });
  });

  it("should parse multiple pending confirmations and approval cards", async () => {
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://brain.test/api/agent/chat",
    );
    expect(
      response.pendingConfirmations?.map((confirmation) => confirmation.id),
    ).toEqual(["approval:update", "approval:delete"]);
    expect(response.cards?.[0]?.id).toBe("approval:update");
  });

  it("should preserve caller abort reasons", async () => {
    const fetchMock = mock(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new RemoteAgentService({ baseUrl: "http://brain.test" });
    const controller = new AbortController();
    const request = service.chat(
      "hello",
      "conversation-1",
      {
        userPermissionLevel: "anchor",
        interfaceType: "evaluation",
      },
      controller.signal,
    );
    const abortReason = new Error("evaluation cancelled");

    controller.abort(abortReason);

    expect(await request.catch((error: unknown) => error)).toBe(abortReason);
  });

  it("should time out stalled requests with the Effect clock", async () => {
    const fetchMock = mock(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const ServiceWithClock = RemoteAgentService as unknown as new (
          config: { baseUrl: string; timeoutMs: number },
          runtimeOptions: { clock: Clock.Clock },
        ) => RemoteAgentService;
        const service = new ServiceWithClock(
          { baseUrl: "http://brain.test", timeoutMs: 100 },
          { clock },
        );
        const request = service
          .chat("hello", "conversation-1")
          .catch((error: unknown) => error);

        yield* Effect.yieldNow();
        yield* TestClock.adjust(99);
        yield* TestClock.adjust(1);
        const error = yield* Effect.promise(() => request);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
          "Remote agent request timed out after 100ms",
        );
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("should ignore legacy singular pending confirmations from remote responses", async () => {
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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
