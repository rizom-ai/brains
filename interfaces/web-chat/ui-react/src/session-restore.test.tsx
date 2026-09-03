/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { App } from "./App";
import { createWebChatQueryClient } from "./query-client";

const originalFetch = globalThis.fetch;

let windowInstance: Window;
let root: Root;
let fetchCalls: string[];
let historyMessages: unknown[];

async function waitForRestoredMessage(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (windowInstance.document.body.textContent.includes("Before reload")) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("Persisted conversation history was not restored");
}

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  fetchCalls = [];
  historyMessages = [
    { id: "old-message", role: "user", content: "Before reload" },
  ];
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    localStorage: windowInstance.localStorage,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  windowInstance.localStorage.setItem(
    "brain:web-chat:conversation-id",
    "web-persisted",
  );
  // Object.assign rather than an assertion: Bun types `fetch` with a
  // `preconnect` member, so the stub carries one instead of claiming to.
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url === "/api/chat/sessions") {
        return Response.json({
          sessions: [
            {
              id: "web-persisted",
              title: "Persisted thread",
              lastActiveAt: "2026-07-16T10:00:00.000Z",
            },
          ],
        });
      }
      if (url === "/api/chat/messages?id=web-persisted") {
        return Response.json({ messages: historyMessages });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
    { preconnect: (): void => {} },
  );

  // globalThis.document is the happy-dom document assigned above, but typed as
  // lib.dom's — so the element it makes is the one React's createRoot declares,
  // and the object at runtime is still happy-dom's.
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
  globalThis.fetch = originalFetch;
});

describe("startup session restoration", () => {
  it("restores persisted history after a reload", async () => {
    const queryClient = createWebChatQueryClient();
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(App),
        ),
      );
    });
    await waitForRestoredMessage();

    expect(fetchCalls).toEqual([
      "/api/chat/sessions",
      "/api/chat/messages?id=web-persisted",
    ]);
    expect(
      windowInstance.document.querySelector("[data-web-chat-app]")?.textContent,
    ).toContain("Before reload");
    queryClient.clear();
  });

  it("starts a fresh conversation with visible Inbox context", async () => {
    windowInstance.history.replaceState(
      {
        webChatPrefill: {
          version: 2,
          text: "Help me understand this Inbox item and decide what to do next.",
          context: {
            sourceId: "mail-items",
            itemId: "mail-1",
            label: "Project question",
          },
        },
      },
      "",
      "/chat",
    );
    const queryClient = createWebChatQueryClient();

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(App),
        ),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(fetchCalls).toEqual(["/api/chat/sessions"]);
    const app = windowInstance.document.querySelector("[data-web-chat-app]");
    expect(app?.getAttribute("data-conversation-id")).toMatch(/^web-/);
    expect(app?.getAttribute("data-conversation-id")).not.toBe("web-persisted");
    const textarea = windowInstance.document.querySelector("#web-chat-input");
    if (!(textarea instanceof windowInstance.HTMLTextAreaElement)) {
      throw new Error("Expected the chat input to be a textarea");
    }
    expect(textarea.value).toBe(
      "Help me understand this Inbox item and decide what to do next.",
    );
    expect(windowInstance.document.body.textContent).toContain(
      "Project question",
    );
    const detach = windowInstance.document.querySelector(
      '[aria-label="Detach Inbox context: Project question"]',
    );
    if (!(detach instanceof windowInstance.HTMLButtonElement)) {
      throw new Error("Inbox context detach control was not rendered");
    }
    await act(async () => detach.click());
    expect(windowInstance.document.body.textContent).not.toContain(
      "Project question",
    );
    expect(windowInstance.history.state).toEqual({});
    queryClient.clear();
  });

  it("does not restore approval buttons after the action was resolved", async () => {
    historyMessages = [
      {
        id: "approval-request",
        role: "assistant",
        content: "Before reload, this action needed approval.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:save-note",
            toolCallId: "call:save-note",
            toolName: "system_update",
            input: { entityType: "note", id: "field-notes" },
            summary: "Save field notes?",
            state: "approval-requested",
          },
        ],
      },
      {
        id: "approval-result",
        role: "assistant",
        content: "Saved the note.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:save-note",
            toolCallId: "call:save-note",
            toolName: "system_update",
            input: { entityType: "note", id: "field-notes" },
            summary: "Save field notes?",
            state: "output-available",
            output: { success: true },
          },
        ],
      },
    ];
    const queryClient = createWebChatQueryClient();

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(App),
        ),
      );
    });
    await waitForRestoredMessage();

    expect(
      windowInstance.document.querySelectorAll(
        ".web-chat-confirmation-actions button",
      ),
    ).toHaveLength(0);
    expect(windowInstance.document.body.textContent).toContain(
      "Saved the note.",
    );
    queryClient.clear();
  });
});
