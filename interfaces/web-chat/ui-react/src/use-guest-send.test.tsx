/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import {
  ChatApiError,
  CHAT_CONVERSATION_ID_HEADER,
  type ChatCard,
  type ChatHistoryMessage,
  type GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { useGuestGate, type GuestGate } from "./use-guest-gate";
import { useGuestSend, type GuestSend } from "./use-guest-send";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

const locator = `guest-${"a".repeat(64)}`;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/ask" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

const session: GuestChatSessionResponse = {
  expiresAt: Date.now() + 3_600_000,
  provider: "Mock provider",
  notice: "Do not share sensitive text.",
  deletionLimitations: "Provider records are separate.",
  retention: { idleSeconds: 3600, maxAgeSeconds: 7200 },
  messageCharacters: 4000,
  canSend: true,
};

function stream(
  events: unknown[],
  headers: Record<string, string> = { [CHAT_CONVERSATION_ID_HEADER]: locator },
): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { ...headers, "Content-Type": "text/event-stream" } },
  );
}

const answered = [
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: "A public answer" },
  { type: "text-end", id: "answer" },
  { type: "finish", finishReason: "stop" },
];

interface Harness {
  send: () => GuestSend;
  gate: () => GuestGate;
  messages: () => ChatHistoryMessage[];
  remembered: string[];
  draft: () => string;
}

async function render(options: {
  streamMessages: (signal: AbortSignal) => Promise<Response>;
  onAnswered?: (cards: ChatCard[]) => void;
  getMessages?: () => Promise<ChatHistoryMessage[]>;
  conversationId?: string;
}): Promise<Harness> {
  let latestSend: GuestSend | undefined;
  let latestGate: GuestGate | undefined;
  let latestMessages: ChatHistoryMessage[] = [];
  let latestDraft = "A question";
  const remembered: string[] = [];

  function Probe(): null {
    const gate = useGuestGate();
    const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
    const [draft, setDraft] = useState("A question");
    const controller = useRef<AbortController | undefined>(undefined);
    latestGate = gate;
    latestMessages = messages;
    latestDraft = draft;
    latestSend = useGuestSend({
      client: {
        streamMessages: (_submission, init): Promise<Response> =>
          options.streamMessages(init?.signal ?? new AbortController().signal),
        getMessages: (): Promise<ChatHistoryMessage[]> =>
          options.getMessages?.() ?? Promise.resolve([]),
      },
      gate,
      session,
      canSend: true,
      hasElapsed: (): boolean => false,
      markExpired: (): void => undefined,
      conversationId: options.conversationId,
      remember: (value): void => {
        remembered.push(value);
      },
      setMessages,
      showHistory: setMessages,
      draft,
      setDraft,
      onStart: (): void => undefined,
      ...(options.onAnswered ? { onAnswered: options.onAnswered } : {}),
      controller,
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe));
  });
  // The gate is held until the session opens; these tests start past that.
  await act(async () => {
    await latestGate?.runBoot(async () => undefined);
  });

  return {
    send: (): GuestSend => {
      if (!latestSend) throw new Error("hook did not render");
      return latestSend;
    },
    gate: (): GuestGate => {
      if (!latestGate) throw new Error("hook did not render");
      return latestGate;
    },
    messages: (): ChatHistoryMessage[] => latestMessages,
    remembered,
    draft: (): string => latestDraft,
  };
}

describe("useGuestSend", () => {
  it("shows the answer, keeps the locator and clears the submission", async () => {
    const harness = await render({
      streamMessages: () => Promise.resolve(stream(answered)),
    });

    await act(async () => harness.send().send());

    expect(harness.remembered).toEqual([locator]);
    expect(harness.messages().map((entry) => entry.content)).toContain(
      "A public answer",
    );
    expect(harness.send().pending).toBeUndefined();
    expect(harness.gate().boxState).toBe("complete");
    expect(harness.draft()).toBe("");
  });

  it("reports what a completed answer drew on, once", async () => {
    const reported: ChatCard[][] = [];
    const sources = {
      kind: "sources",
      id: "sources:tool-results",
      sources: [
        {
          id: "post:hiding",
          entityId: "hiding",
          entityType: "post",
          source: "post",
          title: "Hiding in Plain Sight",
        },
      ],
    };
    const harness = await render({
      streamMessages: () =>
        Promise.resolve(
          stream([
            { type: "text-start", id: "answer" },
            { type: "data-sources", id: sources.id, data: sources },
            ...answered.slice(1),
          ]),
        ),
      onAnswered: (cards): void => {
        reported.push(cards);
      },
    });

    await act(async () => harness.send().send());

    expect(reported).toHaveLength(1);
    expect(JSON.stringify(reported[0])).toContain("post:hiding");
  });

  it("reports nothing for an answer that never finished", async () => {
    const reported: ChatCard[][] = [];
    const harness = await render({
      streamMessages: () => Promise.resolve(stream(answered.slice(0, 2))),
      onAnswered: (cards): void => {
        reported.push(cards);
      },
    });

    await act(async () => harness.send().send());

    expect(reported).toHaveLength(0);
  });

  it("reports uncertainty, and offers no retry, when no locator came back", async () => {
    const harness = await render({
      streamMessages: () => Promise.resolve(stream(answered, {})),
    });

    await act(async () => harness.send().send());

    expect(harness.gate().boxState).toBe("uncertain");
    expect(harness.gate().status).toContain("cannot safely retry");
    // The visible question is preserved, and the submission carries no id, so
    // the page cannot offer to resend it.
    expect(harness.send().pending?.id).toBeUndefined();
    expect(harness.remembered).toEqual([]);
  });

  it("restores a receipted request rather than sending it again", async () => {
    let streamed = 0;
    const harness = await render({
      streamMessages: () => {
        streamed += 1;
        return Promise.reject(
          new ChatApiError("Already received", 409, "http", {
            conversationId: locator,
            state: "completed",
          }),
        );
      },
      getMessages: () =>
        Promise.resolve([
          { id: "q", role: "user", content: "A question" },
          { id: "a", role: "assistant", content: "A public answer" },
        ]),
    });

    await act(async () => harness.send().send());

    expect(streamed).toBe(1);
    expect(harness.remembered).toEqual([locator]);
    expect(harness.messages().map((entry) => entry.id)).toEqual(["q", "a"]);
    expect(harness.gate().boxState).toBe("complete");
    expect(harness.send().pending).toBeUndefined();
  });

  it("ends a receipted request that failed, without resending it", async () => {
    const harness = await render({
      streamMessages: () =>
        Promise.reject(
          new ChatApiError("Already received", 409, "http", {
            conversationId: locator,
            state: "failed",
          }),
        ),
      getMessages: () => Promise.resolve([]),
    });

    await act(async () => harness.send().send());

    expect(harness.gate().boxState).toBe("ended");
    expect(harness.send().pending).toBeUndefined();
  });

  it("reports a guest limit and retries nothing", async () => {
    const harness = await render({
      streamMessages: () =>
        Promise.reject(new ChatApiError("Too many requests", 429)),
    });

    await act(async () => harness.send().send());

    expect(harness.gate().boxState).toBe("limit");
    expect(harness.gate().status).toContain("Nothing will be retried");
  });

  it("says stopping is not a cancellation guarantee", async () => {
    const harness = await render({
      conversationId: locator,
      streamMessages: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("Stopped waiting")),
          );
        }),
    });

    let running: Promise<void> | undefined;
    await act(async () => {
      running = harness.send().send();
    });
    await act(async () => {
      harness.send().stopWaiting();
      await running;
    });

    expect(harness.gate().boxState).toBe("incomplete");
    expect(harness.gate().status).toContain("not a cancellation guarantee");
  });

  it("refuses a retry that carries no locator to check against", async () => {
    let streamed = 0;
    const harness = await render({
      streamMessages: () => {
        streamed += 1;
        return Promise.resolve(stream(answered));
      },
    });

    await act(async () =>
      harness.send().send({ messages: [{ id: "q", role: "user", parts: [] }] }),
    );

    expect(streamed).toBe(0);
  });
});
