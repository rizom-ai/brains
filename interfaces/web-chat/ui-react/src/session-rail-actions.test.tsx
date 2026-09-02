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
let mutationCalls: Array<{ url: string; method: string }>;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function waitForRail(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (windowInstance.document.querySelector(".web-chat-session-archive")) {
      return;
    }
    await settle();
  }
  throw new Error("Session rail never rendered its actions");
}

function activeConversationId(): string | null {
  return (
    windowInstance.document
      .querySelector("[data-web-chat-app]")
      ?.getAttribute("data-conversation-id") ?? null
  );
}

function click(element: unknown, description: string): void {
  if (
    typeof element !== "object" ||
    element === null ||
    !("click" in element) ||
    typeof element.click !== "function"
  ) {
    throw new Error(`${description} is not a clickable element`);
  }
  const clickable = element.click.bind(element);
  act(() => {
    clickable();
  });
}

function clickByLabel(label: string): void {
  click(
    windowInstance.document.querySelector(`button[aria-label="${label}"]`),
    `Button labelled "${label}"`,
  );
}

function clickDialogButton(text: string): void {
  const buttons = [
    ...windowInstance.document.querySelectorAll(
      ".web-chat-session-dialog-actions button",
    ),
  ];
  click(
    buttons.find((candidate) => candidate.textContent === text),
    `Dialog button reading "${text}"`,
  );
}

async function renderApp(): Promise<
  ReturnType<typeof createWebChatQueryClient>
> {
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
  await waitForRail();
  return queryClient;
}

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  mutationCalls = [];
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
    "web-active",
  );
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/chat/sessions" && method === "GET") {
      return Response.json({
        sessions: [
          {
            id: "web-active",
            title: "Open thread",
            lastActiveAt: "2026-07-16T10:00:00.000Z",
          },
        ],
      });
    }
    if (url === "/api/chat/messages?id=web-active") {
      return Response.json({ messages: [] });
    }
    mutationCalls.push({ url, method });
    return Response.json({ ok: true });
  }) as typeof fetch;

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

describe("session rail actions", () => {
  it("moves off the open conversation once it is archived", async () => {
    const queryClient = await renderApp();
    expect(activeConversationId()).toBe("web-active");

    clickByLabel("Archive Open thread");
    await settle();
    expect(
      windowInstance.document.querySelector(".web-chat-session-dialog"),
    ).not.toBeNull();

    clickDialogButton("Archive");
    await settle();

    expect(mutationCalls).toContainEqual({
      url: "/api/chat/sessions/archive?id=web-active",
      method: "PUT",
    });
    expect(
      windowInstance.document.querySelector(".web-chat-session-dialog"),
    ).toBeNull();
    expect(activeConversationId()).not.toBe("web-active");
    queryClient.clear();
  });

  it("moves off the open conversation once it is deleted", async () => {
    const queryClient = await renderApp();
    expect(activeConversationId()).toBe("web-active");

    clickByLabel("Delete Open thread");
    await settle();
    clickDialogButton("Delete");
    await settle();

    expect(mutationCalls).toContainEqual({
      url: "/api/chat/sessions?id=web-active",
      method: "DELETE",
    });
    expect(activeConversationId()).not.toBe("web-active");
    queryClient.clear();
  });

  it("dismisses a rename that would not change the title without calling the API", async () => {
    const queryClient = await renderApp();

    clickByLabel("Rename Open thread");
    await settle();
    expect(
      windowInstance.document.querySelector("#web-chat-session-rename-input"),
    ).not.toBeNull();

    clickDialogButton("Rename");
    await settle();

    expect(mutationCalls).toEqual([]);
    expect(
      windowInstance.document.querySelector(".web-chat-session-dialog"),
    ).toBeNull();
    expect(activeConversationId()).toBe("web-active");
    queryClient.clear();
  });
});
