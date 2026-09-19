/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { StudioChatHandoff } from "./operator-launch";
import { StudioChatDraftStore, studioChatDraftKey } from "./studio-chat-drafts";
import { useChatHandoff } from "./use-chat-handoff";

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
  windowInstance.close();
  restoreGlobals();
});

const handoff: StudioChatHandoff = {
  sourceId: "unified-inbox",
  itemId: "item-1",
  label: "Release decision",
  prompt: "Help me decide what to do with this.",
};

interface Harness {
  store: StudioChatDraftStore;
  opened: unknown[];
  navigations: (string | undefined)[];
  errors: (string | null)[];
  render: (props?: {
    handoff?: StudioChatHandoff | null;
    sessionId?: string | null;
  }) => Promise<void>;
}

async function renderHandoff(
  open: (request: unknown) => Promise<{ conversationId: string }>,
): Promise<Harness> {
  const store = new StudioChatDraftStore();
  const harness: Harness = {
    store,
    opened: [],
    navigations: [],
    errors: [],
    render: async (): Promise<void> => undefined,
  };
  function Probe(props: {
    handoff: StudioChatHandoff | null;
    sessionId: string | null;
  }): null {
    const mountedRef = useRef(true);
    const draftKey = studioChatDraftKey("/api/chat", props.sessionId);
    const currentDraftKey = useRef(draftKey);
    currentDraftKey.current = draftKey;
    useChatHandoff({
      chatClient: {
        openContextSession: async (
          request,
        ): Promise<{ conversationId: string }> => {
          harness.opened.push(request);
          return open(request);
        },
      },
      handoff: props.handoff,
      sessionId: props.sessionId,
      apiPath: "/api/chat",
      draftStore: store,
      draftKey,
      currentDraftKey,
      mountedRef,
      setDraft: (text): void => store.update(draftKey, { text }),
      setError: (value): void => {
        harness.errors.push(value);
      },
      navigateToSession: (id): void => {
        harness.navigations.push(id);
      },
    });
    return null;
  }
  harness.render = async (props = {}): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(Probe, {
          handoff: props.handoff === undefined ? handoff : props.handoff,
          sessionId: props.sessionId ?? null,
        }),
      );
    });
  };
  return harness;
}

describe("useChatHandoff", () => {
  it("seeds the composer and moves the draft to the conversation it opened", async () => {
    const harness = await renderHandoff(() =>
      Promise.resolve({ conversationId: "context-1" }),
    );

    await harness.render();

    expect(harness.opened).toEqual([
      {
        version: 1,
        sourceId: "unified-inbox",
        itemId: "item-1",
        titleSeed: "Release decision",
      },
    ]);
    expect(
      harness.store.read(studioChatDraftKey("/api/chat", "context-1")).text,
    ).toBe(handoff.prompt);
    expect(harness.navigations).toEqual(["context-1"]);
  });

  it("acts on one handoff once, however often it rerenders", async () => {
    const harness = await renderHandoff(() =>
      Promise.resolve({ conversationId: "context-1" }),
    );

    await harness.render();
    await harness.render();
    await harness.render();

    expect(harness.opened).toHaveLength(1);
  });

  it("leaves an already-open conversation alone", async () => {
    const harness = await renderHandoff(() =>
      Promise.resolve({ conversationId: "context-1" }),
    );

    await harness.render({ sessionId: "existing" });

    expect(harness.opened).toEqual([]);
    expect(harness.navigations).toEqual([]);
  });

  it("reports a failure and lets the reader try the same item again", async () => {
    let attempts = 0;
    const harness = await renderHandoff(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("Item is not readable"))
        : Promise.resolve({ conversationId: "context-1" });
    });

    await harness.render();
    expect(harness.errors).toEqual([null, "Item is not readable"]);
    expect(harness.navigations).toEqual([]);

    await harness.render({ handoff: null });
    await harness.render();

    expect(harness.opened).toHaveLength(2);
    expect(harness.navigations).toEqual(["context-1"]);
  });
});
