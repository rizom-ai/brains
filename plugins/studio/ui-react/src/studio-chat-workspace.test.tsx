/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioChatWorkspace } from "./studio-chat-workspace";

const originalFetch = globalThis.fetch;
let windowInstance: Window;
let root: Root;
let queryClient: QueryClient;
let navigations: string[];

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function click(element: unknown, description: string): void {
  if (
    typeof element !== "object" ||
    element === null ||
    !("click" in element) ||
    typeof element.click !== "function"
  ) {
    throw new Error(`${description} is not interactive`);
  }
  const activate = element.click.bind(element);
  void act(() => activate());
}

async function waitForSessions(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.querySelectorAll(".studio-chat-session").length === 2) return;
    await settle();
  }
  throw new Error("Studio Chat sessions did not render");
}

beforeEach(() => {
  windowInstance = new Window({
    url: "http://brain.test/studio/workspaces/web-chat%3Achat",
  });
  navigations = [];
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
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
  windowInstance.Element.prototype.scrollIntoView = (): void => {};
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/chat/sessions") {
      return Response.json({
        sessions: [
          {
            id: "conversation-1",
            title: "Launch narrative",
            lastActiveAt: "2026-09-02T09:48:00.000Z",
            contextHandoff: {
              version: 1,
              sourceId: "unified-inbox",
              itemId: "item-1",
              titleSeed: "Release decision",
            },
          },
          {
            id: "conversation-2",
            title: "Quarterly review",
            lastActiveAt: "2026-09-02T08:12:00.000Z",
          },
        ],
      });
    }
    if (url === "/api/chat/messages?id=conversation-1") {
      return Response.json({ messages: [] });
    }
    throw new Error(`Unexpected Studio Chat request: ${url}`);
  }) as typeof fetch;

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  windowInstance.close();
  globalThis.fetch = originalFetch;
});

describe("native Studio Chat workspace", () => {
  it("opens an authorized context session and seeds the native composer", async () => {
    let contextBody: unknown;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url === "/custom/chat/sessions") {
        return Response.json({ sessions: [] });
      }
      if (url === "/custom/chat/context-sessions" && init?.method === "POST") {
        contextBody = JSON.parse(String(init.body));
        return Response.json({ conversationId: "context-conversation" });
      }
      throw new Error(`Unexpected Studio Chat request: ${url}`);
    }) as typeof fetch;

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(StudioChatWorkspace, {
            apiPath: "/custom/chat",
            studioBasePath: "/studio",
            sessionId: null,
            handoff: {
              sourceId: "mail-items",
              itemId: "mail-1",
              label: "Mercury launch",
              prompt:
                "Help me understand this Inbox item and decide what to do next.",
            },
            workspaces: [],
            navigate: (href: string) => navigations.push(href),
            selectWorkspace: () => {},
          }),
        ),
      );
    });
    await settle();

    expect(contextBody).toEqual({
      version: 1,
      sourceId: "mail-items",
      itemId: "mail-1",
      titleSeed: "Mercury launch",
    });
    expect(navigations).toContain(
      "/studio/workspaces/web-chat%3Achat?session=context-conversation",
    );
    expect(
      document.querySelector<HTMLTextAreaElement>(
        ".studio-chat-composer textarea",
      )?.value,
    ).toBe("Help me understand this Inbox item and decide what to do next.");
  });

  it("navigates sessions and mobile destinations without mounting Web Chat", async () => {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(StudioChatWorkspace, {
            apiPath: "/api/chat",
            studioBasePath: "/studio",
            sessionId: "conversation-1",
            handoff: null,
            workspaces: [
              {
                id: "studio:overview",
                pluginId: "studio",
                label: "Overview",
                rendererName: "DeclarativeOperatorWorkspace",
                priority: -100,
                permission: "trusted",
                entityTypes: [],
              },
            ],
            navigate: (href: string) => navigations.push(href),
            selectWorkspace: () => {},
          }),
        ),
      );
    });
    await waitForSessions();
    expect(document.body.textContent).toContain("Linked context");
    expect(document.body.textContent).toContain("Release decision");

    const launch = [...document.querySelectorAll(".studio-chat-session")].find(
      (element) => element.textContent.includes("Launch narrative"),
    );
    click(launch, "Launch narrative session");
    expect(navigations).toContain(
      "/studio/workspaces/web-chat%3Achat?session=conversation-1",
    );

    const contextDestination = [
      ...document.querySelectorAll(".studio-chat-mobile-destination"),
    ].find((element) => element.textContent === "context");
    click(contextDestination, "Context destination");
    expect(
      document
        .querySelector(".studio-chat-room")
        ?.getAttribute("data-mobile-destination"),
    ).toBe("context");

    expect(document.querySelector("[data-web-chat-root]")).toBeNull();
    expect(
      document.querySelectorAll(".studio-chat-mobile-destination"),
    ).toHaveLength(3);
  });
});
