/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { ChatCard, ChatHistoryMessage } from "@brains/contracts/chat";
import {
  createStudioChatStreamState,
  type StudioChatStreamState,
} from "./chat-workspace-model";
import { studioChatKeys } from "./studio-chat-contracts";
import { useChatThread, type ChatThread } from "./use-chat-thread";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
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

function message(
  id: string,
  content: string,
  cards?: ChatCard[],
): ChatHistoryMessage {
  return { id, role: "assistant", content, ...(cards ? { cards } : {}) };
}

function streaming(text: string): StudioChatStreamState {
  return { ...createStudioChatStreamState(), text };
}

const sources: ChatCard = { kind: "sources", id: "s1", sources: [] };
const attachment: ChatCard = {
  kind: "attachment",
  id: "a1",
  title: "Report",
  attachment: { mediaType: "text/plain", url: "/uploads/report.txt" },
};
const approval: ChatCard = {
  kind: "tool-approval",
  id: "p1",
  toolName: "write",
  summary: "Write the note",
  state: "approval-requested",
};

interface Harness {
  thread: () => ChatThread;
  fetches: () => number;
}

async function renderThread(
  options: {
    sessionId?: string | null;
    sending?: boolean;
    pendingMessages?: ChatHistoryMessage[];
    stream?: StudioChatStreamState | null;
    stored?: ChatHistoryMessage[];
    cached?: ChatHistoryMessage[];
  } = {},
): Promise<Harness> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const sessionId = options.sessionId === undefined ? "one" : options.sessionId;
  if (options.cached)
    queryClient.setQueryData(
      studioChatKeys.messages(sessionId ?? ""),
      options.cached,
    );
  let latest: ChatThread | undefined;
  let fetches = 0;
  function Probe(): null {
    latest = useChatThread({
      chatClient: {
        getMessages: async (): Promise<ChatHistoryMessage[]> => {
          fetches += 1;
          return options.stored ?? [];
        },
      },
      sessionId,
      sending: options.sending ?? false,
      pendingMessages: options.pendingMessages ?? [],
      stream: options.stream ?? null,
    });
    return null;
  }
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Probe),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return {
    thread: (): ChatThread => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
    fetches: (): number => fetches,
  };
}

describe("useChatThread", () => {
  it("shows the stored history on its own", async () => {
    const harness = await renderThread({ stored: [message("a", "Stored")] });

    expect(harness.thread().visibleMessages.map((entry) => entry.id)).toEqual([
      "a",
    ]);
  });

  it("appends the optimistic copy after the history already shown", async () => {
    const harness = await renderThread({
      cached: [message("a", "Stored")],
      pendingMessages: [message("b", "Just sent")],
    });

    expect(harness.thread().visibleMessages.map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("shows a stream that has produced something", async () => {
    const harness = await renderThread({ stream: streaming("Partial") });

    expect(
      harness.thread().visibleMessages.map((entry) => entry.content),
    ).toContain("Partial");
  });

  it("shows nothing for a stream that has produced nothing yet", async () => {
    const harness = await renderThread({ stream: streaming("") });

    expect(harness.thread().visibleMessages).toHaveLength(0);
  });

  it("leaves history alone while the optimistic copy is still standing", async () => {
    const harness = await renderThread({
      pendingMessages: [message("b", "Just sent")],
      sending: true,
    });

    expect(harness.fetches()).toBe(0);
  });

  it("asks for nothing when no conversation is open", async () => {
    const harness = await renderThread({ sessionId: null });

    expect(harness.fetches()).toBe(0);
    expect(harness.thread().visibleMessages).toHaveLength(0);
  });

  it("collects the cards the context panel reads, and no others", async () => {
    const harness = await renderThread({
      stored: [message("a", "With cards", [sources, attachment, approval])],
    });

    expect(harness.thread().contextCards.map((card) => card.kind)).toEqual([
      "sources",
      "attachment",
    ]);
  });
});
