/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import type {
  ChatHistoryMessage,
  ChatMessage,
  ChatMessageRequest,
  ChatClient,
} from "@brains/contracts/chat";
import { Window } from "happy-dom";
import { act, createElement, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioChatDraftStore } from "./studio-chat-drafts";
import { createStudioQueryClient } from "./query-client";
import { studioChatKeys } from "./studio-chat-contracts";
import { useChatStream, type ChatStream } from "./use-chat-stream";

const encoder = new TextEncoder();

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

/** A stream that stays open until released, so a second send can supersede it. */
function heldStream(): {
  response: Response;
  release: (event?: string) => void;
  aborted: () => boolean;
  signal: (value: AbortSignal | undefined) => void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let abortSignal: AbortSignal | undefined;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController): void {
        controller = streamController;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
  return {
    response,
    release: (event): void => {
      if (event) controller?.enqueue(encoder.encode(`data: ${event}\n\n`));
      controller?.close();
    },
    aborted: (): boolean => abortSignal?.aborted === true,
    signal: (value): void => {
      abortSignal = value;
    },
  };
}

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

interface StreamCall {
  request: ChatMessageRequest;
  signal: AbortSignal | undefined;
}

interface Harness {
  stream: () => ChatStream;
  calls: StreamCall[];
  history: ChatHistoryMessage[];
  navigations: string[];
  client: ReturnType<typeof createStudioQueryClient>;
}

async function renderStream(
  respond: (call: StreamCall) => Response | Promise<Response>,
  sessionId: string | null = "c1",
): Promise<Harness> {
  const client = createStudioQueryClient();
  const draftStore = new StudioChatDraftStore();
  const harness: Harness = {
    calls: [],
    history: [{ id: "m1", role: "assistant", content: "Stored" }],
    navigations: [],
    client,
    stream: (): ChatStream => {
      throw new Error("hook did not render");
    },
  };
  let latest: ChatStream | undefined;
  function Probe(): ReactElement | null {
    const mountedRef = useRef(true);
    const currentDraftKey = useRef("key");
    const adoptedSessionRef = useRef<string | null>(null);
    latest = useChatStream({
      chatClient: {
        streamMessages: async (request, options): Promise<Response> => {
          const call = { request, signal: options?.signal };
          harness.calls.push(call);
          return respond(call);
        },
        getMessages: async (): Promise<ChatHistoryMessage[]> => harness.history,
        runAction: async (): Promise<
          Awaited<ReturnType<ChatClient["runAction"]>>
        > => ({
          text: "acted",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      },
      queryClient: client,
      sessionId,
      apiPath: undefined,
      draftStore,
      draftKey: "key",
      currentDraftKey,
      mountedRef,
      adoptedSessionRef,
      uploads: [],
      uploading: false,
      uploadAttemptCount: 0,
      navigateToSession: (conversationId): void => {
        harness.navigations.push(conversationId ?? "");
      },
    });
    return null;
  }
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  harness.stream = (): ChatStream => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

const userTurn: ChatMessage[] = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
];

describe("useChatStream", () => {
  it("replaces the optimistic copy with authoritative history when a turn completes", async () => {
    const harness = await renderStream(() =>
      sse('{"type":"text-delta","id":"r","delta":"Hi"}', '{"type":"finish"}'),
    );

    await act(async () => {
      await harness.stream().runStream("c1", userTurn);
    });

    expect(harness.stream().pendingMessages).toEqual([]);
    expect(harness.stream().stream).toBeNull();
    expect(harness.stream().sending).toBe(false);
    expect(
      harness.client.getQueryData<ChatHistoryMessage[]>(
        studioChatKeys.messages("c1"),
      ),
    ).toEqual(harness.history);
  });

  it("records an interrupted response with its retry when the server stops", async () => {
    const harness = await renderStream(() =>
      sse(
        '{"type":"text-delta","id":"r","delta":"Partial"}',
        '{"type":"abort","reason":"Server stopped"}',
      ),
    );

    await act(async () => {
      await harness.stream().runStream("c1", userTurn, undefined, {
        text: "hello",
        uploads: [],
      });
    });

    expect(harness.stream().interrupted).toMatchObject({
      kind: "stopped",
      retry: { text: "hello", uploads: [] },
    });
    // The partial answer is kept so the reader can still see it.
    expect(harness.stream().pendingMessages).toHaveLength(1);
  });

  it("supersedes an in-flight turn when a second one starts", async () => {
    const held = heldStream();
    let first = true;
    const harness = await renderStream((call) => {
      if (!first) {
        return sse('{"type":"finish"}');
      }
      first = false;
      held.signal(call.signal);
      return held.response;
    });

    let firstAccepted: Promise<boolean> | undefined;
    await act(async () => {
      firstAccepted = harness.stream().runStream("c1", userTurn);
      await Promise.resolve();
    });
    await act(async () => {
      await harness.stream().runStream("c1", userTurn);
    });
    held.release('{"type":"finish"}');
    await act(async () => {
      await firstAccepted;
    });

    expect(harness.calls).toHaveLength(2);
    expect(held.aborted()).toBe(true);
    // The superseded turn must not leave the hook mid-send.
    expect(harness.stream().sending).toBe(false);
  });

  it("aborts and clears everything on reset", async () => {
    const held = heldStream();
    const harness = await renderStream((call) => {
      held.signal(call.signal);
      return held.response;
    });

    await act(async () => {
      void harness.stream().runStream("c1", userTurn);
      await Promise.resolve();
    });
    expect(harness.stream().sending).toBe(true);

    await act(async () => harness.stream().reset());

    expect(held.aborted()).toBe(true);
    expect(harness.stream().sending).toBe(false);
    expect(harness.stream().stream).toBeNull();
    expect(harness.stream().pendingMessages).toEqual([]);
    expect(harness.stream().interrupted).toBeNull();
    expect(harness.stream().error).toBeNull();
  });
});
