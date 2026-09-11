/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioChatWorkspace } from "./studio-chat-workspace";
import { StudioChatDraftStore, studioChatDraftKey } from "./studio-chat-drafts";

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
  windowInstance = new Window({ url: "http://brain.test/chat" });
  navigations = [];
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    HTMLFormElement: windowInstance.HTMLFormElement,
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
  // Object.assign rather than an assertion: Bun types `fetch` with a
  // `preconnect` member, so the stub carries one instead of claiming to.
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
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
      if (url.startsWith("/api/chat/messages?id=")) {
        return Response.json({ messages: [] });
      }
      throw new Error(`Unexpected Studio Chat request: ${url}`);
    },
    { preconnect: originalFetch.preconnect },
  );

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

async function mountChat(
  store: StudioChatDraftStore,
  sessionId: string | null = "conversation-1",
  apiPath = "/api/chat",
): Promise<void> {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(StudioChatWorkspace, {
          draftStore: store,
          apiPath,
          studioBasePath: "/studio",
          sessionId,
          handoff: null,
          types: [],
          workspaces: [],
          navigate: (href) => navigations.push(href),
          selectEntityType: () => {},
          selectWorkspace: () => {},
        }),
      ),
    ),
  );
  await settle();
}

describe("native Studio Chat workspace", () => {
  it("restores each session's draft without persisting it outside the mounted Studio", async () => {
    const store = new StudioChatDraftStore();
    store.update(studioChatDraftKey("/api/chat", "conversation-1"), {
      text: "First unfinished message",
    });
    store.update(studioChatDraftKey("/api/chat", "conversation-2"), {
      text: "Second unfinished message",
    });
    await mountChat(store);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "First unfinished message",
    );
    await mountChat(store, "conversation-2");
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Second unfinished message",
    );
    await mountChat(store);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "First unfinished message",
    );
  });

  it("shows the new-conversation prompt while the disabled history query is pending", async () => {
    await mountChat(new StudioChatDraftStore(), null);
    expect(
      document.querySelector('section[aria-label="New conversation"]')
        ?.textContent,
    ).toContain(
      "No messages yet. Your draft stays in the composer until you send it.",
    );
    expect(document.body.textContent).not.toContain("Opening conversation…");
    expect(document.body.textContent).not.toContain("Working set");
  });

  it("does not reserve an empty desktop conversation rail", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === "/api/chat/sessions"
          ? Response.json({ sessions: [] })
          : previous(input, init),
      { preconnect: previous.preconnect },
    );
    await mountChat(new StudioChatDraftStore(), null);
    expect(document.querySelector(".studio-chat-sessions")).toBeNull();
    expect(
      document.querySelector('section[aria-label="New conversation"]'),
    ).not.toBeNull();
  });

  for (const sessionId of ["conversation-1", null]) {
    it(`keeps a rejected send in ${sessionId ?? "a new conversation"} for correction or retry`, async () => {
      const store = new StudioChatDraftStore(),
        key = studioChatDraftKey("/api/chat", sessionId);
      store.update(key, { text: "Keep this if sending fails" });
      const previous = globalThis.fetch;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) =>
          String(input) === "/api/chat" && init?.method === "POST"
            ? new Response("Unavailable", { status: 503 })
            : previous(input, init),
        { preconnect: originalFetch.preconnect },
      );
      await mountChat(store, sessionId);
      click(document.querySelector('[aria-label="Send message"]'), "Send");
      await settle();
      expect(store.read(key).text).toBe("Keep this if sending fails");
      expect(
        document.querySelector<HTMLTextAreaElement>("textarea")?.value,
      ).toBe("Keep this if sending fails");
      expect(document.querySelector('[role="alert"]')).not.toBeNull();
      expect(
        document.querySelectorAll('.studio-chat-turn[data-role="user"]'),
      ).toHaveLength(0);
      expect(navigations).toHaveLength(0);
    });
  }

  it("keeps attached drafts reachable and allows removing an attachment without sending it", async () => {
    const store = new StudioChatDraftStore(),
      key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, {
      uploads: [
        {
          id: "upload-1",
          ref: { kind: "upload", id: "upload-1" },
          filename: "notes.txt",
          mediaType: "text/plain",
          sizeBytes: 3,
          createdAt: "2026-09-05T12:00:00Z",
          url: "/api/chat/uploads/upload-1",
          downloadUrl: "/api/chat/uploads/upload-1?download=true",
        },
      ],
    });
    await mountChat(store);
    expect(
      document.querySelector<HTMLButtonElement>(".studio-chat-header-action")
        ?.disabled,
    ).toBe(true);
    click(
      document.querySelector('[aria-label="Remove notes.txt from message"]'),
      "Remove attachment",
    );
    await settle();
    expect(store.read(key).uploads).toHaveLength(0);
    expect(store.hasDrafts()).toBe(false);
    expect(
      document.querySelector<HTMLButtonElement>(".studio-chat-header-action")
        ?.disabled,
    ).toBe(false);
  });

  for (const switchSession of [false, true]) {
    it(`protects composition during archive and ${switchSession ? "ignores a late result after switching sessions" : "returns after acknowledgement"}`, async () => {
      const store = new StudioChatDraftStore(),
        previous = globalThis.fetch;
      const pending: { finish?: () => void } = {};
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method !== "PUT") return previous(input, init);
          return new Promise<Response>((resolve) => {
            pending.finish = (): void =>
              resolve(Response.json({ archived: true }));
          });
        },
        { preconnect: originalFetch.preconnect },
      );
      await mountChat(store);
      click(document.querySelector(".studio-chat-header-action"), "Archive");
      await settle();
      expect(
        document.querySelector<HTMLTextAreaElement>("textarea")?.disabled,
      ).toBe(true);
      expect(navigations).toHaveLength(0);
      if (switchSession) await mountChat(store, "conversation-2");
      await act(async () => pending.finish?.());
      await settle();
      expect(
        document.querySelector<HTMLTextAreaElement>("textarea")?.disabled,
      ).toBe(false);
      expect(navigations).toEqual(switchSession ? [] : ["/chat"]);
    });
  }

  it("adopts a new session only after acceptance and keeps text composed while waiting", async () => {
    const store = new StudioChatDraftStore(),
      key = studioChatDraftKey("/api/chat", null);
    store.update(key, { text: "First message" });
    const previous = globalThis.fetch;
    const pending: { accept?: () => void } = {};
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== "/api/chat" || init?.method !== "POST")
          return previous(input, init);
        return new Promise<Response>((resolve, reject) => {
          pending.accept = (): void =>
            resolve(
              new Response(
                'data: {"type":"text-delta","id":"reply","delta":"Accepted"}\n\n',
                { headers: { "Content-Type": "text/event-stream" } },
              ),
            );
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          );
        });
      },
      { preconnect: originalFetch.preconnect },
    );
    await mountChat(store, null);
    click(document.querySelector('[aria-label="Send message"]'), "Send");
    await settle();
    expect(navigations).toHaveLength(0);
    expect(store.read(key).text).toBe("First message");
    await act(async () =>
      store.update(key, { text: "My next unsent thought" }),
    );
    await act(async () => pending.accept?.());
    await settle();
    const href = navigations[0];
    if (!href) throw new Error("Missing adopted conversation route");
    const sessionId = new URL(href, "http://brain.test").searchParams.get(
      "session",
    );
    if (!sessionId) throw new Error("Missing adopted conversation id");
    expect(store.read(key).text).toBe("");
    expect(store.read(studioChatDraftKey("/api/chat", sessionId)).text).toBe(
      "My next unsent thought",
    );
  });

  it("reconciles the first persisted turn without duplicating its optimistic messages", async () => {
    const store = new StudioChatDraftStore();
    store.update(studioChatDraftKey("/api/chat", null), {
      text: "First message",
    });
    const previous = globalThis.fetch;
    let conversationId = "";
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/chat" && init?.method === "POST") {
          const body: unknown = JSON.parse(String(init.body));
          if (
            typeof body !== "object" ||
            body === null ||
            !("id" in body) ||
            typeof body.id !== "string"
          )
            throw new Error("Missing streamed conversation id");
          conversationId = body.id;
          return new Response(
            'data: {"type":"text-delta","id":"reply","delta":"Accepted"}\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }
        if (
          conversationId &&
          url === `/api/chat/messages?id=${encodeURIComponent(conversationId)}`
        ) {
          return Response.json({
            messages: [
              {
                id: "stored-user",
                role: "user",
                content: "First message",
              },
              {
                id: "stored-assistant",
                role: "assistant",
                content: "Accepted",
              },
            ],
          });
        }
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );

    await mountChat(store, null);
    click(document.querySelector('[aria-label="Send message"]'), "Send");
    for (
      let attempt = 0;
      attempt < 20 && navigations.length === 0;
      attempt += 1
    )
      await settle();
    const href = navigations[0];
    if (!href) throw new Error("Missing adopted conversation route");
    const adoptedId = new URL(href, "http://brain.test").searchParams.get(
      "session",
    );
    if (!adoptedId) throw new Error("Missing adopted conversation id");

    await mountChat(store, adoptedId);
    expect(
      document.querySelectorAll('.studio-chat-turn[data-role="user"]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('.studio-chat-turn[data-role="assistant"]'),
    ).toHaveLength(1);
  });

  it("stops the active stream, retains received text, and does not erase the next draft", async () => {
    const store = new StudioChatDraftStore(),
      key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, { text: "Start a response" });
    const previous = globalThis.fetch;
    const request: { signal?: AbortSignal | null | undefined } = {};
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== "/api/chat" || init?.method !== "POST")
          return previous(input, init);
        request.signal = init.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"text-delta","id":"reply","delta":"Received partial response"}\n\n',
                ),
              );
              init.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new DOMException("Stopped", "AbortError")),
                { once: true },
              );
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
      { preconnect: originalFetch.preconnect },
    );
    await mountChat(store);
    click(document.querySelector('[aria-label="Send message"]'), "Send");
    await settle();
    expect(request.signal).toBeDefined();
    expect(store.read(key).text).toBe("");
    await act(async () => store.update(key, { text: "My next thought" }));
    const stop = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Stop",
    );
    click(stop, "Stop");
    await settle();
    expect(request.signal?.aborted).toBe(true);
    expect(document.body.textContent).toContain("Received partial response");
    expect(store.read(key).text).toBe("My next thought");
    expect(
      document.querySelector('[aria-label="Send message"]'),
    ).not.toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("opens an authorized context session and seeds the native composer", async () => {
    let contextBody: unknown;
    const store = new StudioChatDraftStore();
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/custom/chat/sessions") {
          return Response.json({ sessions: [] });
        }
        if (url === "/custom/chat/messages?id=context-conversation")
          return Response.json({ messages: [] });
        if (
          url === "/custom/chat/context-sessions" &&
          init?.method === "POST"
        ) {
          contextBody = JSON.parse(String(init.body));
          return Response.json({ conversationId: "context-conversation" });
        }
        throw new Error(`Unexpected Studio Chat request: ${url}`);
      },
      { preconnect: originalFetch.preconnect },
    );

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(StudioChatWorkspace, {
            apiPath: "/custom/chat",
            draftStore: store,
            studioBasePath: "/studio",
            sessionId: null,
            handoff: {
              sourceId: "mail-items",
              itemId: "mail-1",
              label: "Mercury launch",
              prompt:
                "Help me understand this Inbox item and decide what to do next.",
            },
            types: [],
            workspaces: [],
            navigate: (href: string) => navigations.push(href),
            selectEntityType: () => {},
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
    expect(navigations).toContain("/chat?session=context-conversation");
    await mountChat(store, "context-conversation", "/custom/chat");
    expect(
      document.querySelector<HTMLTextAreaElement>(
        ".studio-chat-composer textarea",
      )?.value,
    ).toBe("Help me understand this Inbox item and decide what to do next.");
  });

  it("requests the session picker without replacing the conversation", async () => {
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
            types: [],
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
            selectEntityType: () => {},
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
    expect(navigations).toContain("/chat?session=conversation-1");

    const context = document.querySelector<HTMLDetailsElement>(
      ".studio-chat-working-set",
    );
    expect(context?.open).toBe(false);
    click(context?.querySelector("summary"), "Working set disclosure");
    await settle();
    expect(context?.open).toBe(true);
    expect(context?.textContent.match(/Working set/g)).toHaveLength(1);

    expect(document.querySelector("[data-web-chat-root]")).toBeNull();
    expect(
      document.querySelector(".studio-chat-mobile-destinations"),
    ).toBeNull();
    const trigger = document.querySelector(
      ".studio-chat-mobile-sessions button",
    );
    click(trigger, "Sessions");
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    // The browser runner verifies Radix portal selection, dismissal, and focus.
    click(launch, "Choose a conversation");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(context?.open).toBe(true);
  });
});
