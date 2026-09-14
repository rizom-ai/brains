/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  environmentManager,
} from "@tanstack/react-query";
const originalIsServer = environmentManager.isServer();
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioChatWorkspace } from "./studio-chat-workspace";
import type { ChatCard } from "@brains/contracts/chat";
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

async function openDetails(): Promise<void> {
  click(
    document.querySelector('[aria-label="Conversation details and options"]'),
    "Conversation details",
  );
  await settle();
}

async function openHistory(): Promise<void> {
  click(
    document.querySelector(".studio-chat-session-picker-trigger button"),
    "History",
  );
  await settle();
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
    HTMLInputElement: windowInstance.HTMLInputElement,
    NodeFilter: windowInstance.NodeFilter,
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
  environmentManager.setIsServer(() => originalIsServer);
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

describe("rich dialogue in Studio Chat", () => {
  async function waitForAttachmentStatus(label: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (
        document.querySelector('.studio-chat-card [role="status"]')
          ?.textContent === label
      )
        return;
      await settle();
    }
    throw new Error(`Attachment status did not become ${label}`);
  }

  const image: Extract<ChatCard, { kind: "attachment" }> = {
    kind: "attachment",
    id: "image-card",
    title: "Generated landscape",
    attachment: { mediaType: "image/png", url: "/images/landscape.png" },
  };

  function serveCard(
    card: ChatCard,
    job: () => Response = () =>
      Response.json({ id: "job-image", status: "completed" }),
  ): void {
    const previous = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/chat/messages?id="))
          return Response.json({
            messages: [
              {
                id: "generated",
                role: "assistant",
                content: "Here is your image.",
                cards: [card],
              },
            ],
          });
        if (url.startsWith("/api/chat/jobs/status?id=")) return job();
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
  }

  for (const previewUrl of [undefined, "/images/preview.png"]) {
    it(`renders a ready image using ${previewUrl ? "its preview URL" : "the main URL fallback"}`, async () => {
      serveCard({
        ...image,
        attachment: {
          ...image.attachment,
          ...(previewUrl ? { previewUrl } : {}),
        },
      });
      await mountChat(new StudioChatDraftStore());
      expect(
        document.querySelector(".studio-chat-card img")?.getAttribute("src"),
      ).toBe(previewUrl ?? image.attachment.url);
      const links = [
        ...document.querySelectorAll<HTMLAnchorElement>(".studio-chat-card a"),
      ];
      expect(
        links.find((link) => link.textContent === "Open")?.getAttribute("href"),
      ).toBe(image.attachment.url);
      expect(
        links
          .find((link) => link.textContent === "Download")
          ?.getAttribute("href"),
      ).toBe(image.attachment.url);
    });
  }

  it("enlarges an image on demand and restores focus when closed", async () => {
    serveCard(image);
    await mountChat(new StudioChatDraftStore());
    const trigger = document.querySelector(
      '[aria-label="Enlarge Generated landscape"]',
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    click(trigger, "Image preview");
    await settle();
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute("src"),
    ).toBe(image.attachment.url);
    expect(
      document.querySelector('[role="dialog"] a')?.getAttribute("download"),
    ).not.toBeNull();
    click(
      document.querySelector('[role="dialog"] [data-slot="dialog-close"]'),
      "Close preview",
    );
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  for (const [state, label] of [
    ["approval-requested", "Approval required"],
    ["approval-responded", "Decision received"],
    ["output-available", "Completed"],
    ["output-denied", "Declined"],
    ["output-error", "Action failed"],
  ] as const) {
    it(`retains the server-owned ${state} receipt and complete action details`, async () => {
      const preview =
        "Exact proposed change\n" + "detail ".repeat(10_000) + "END OF PREVIEW";
      serveCard({
        kind: "tool-approval",
        id: "approval-card",
        toolName: "update_entity",
        summary: "Update the project note",
        state,
        preview,
        input: { revision: "revision-17" },
        ...(state === "output-error"
          ? { error: "Revision conflict — inspect the current record." }
          : {}),
        ...(state === "output-available"
          ? { output: { revision: "revision-18" } }
          : {}),
      });
      await mountChat(new StudioChatDraftStore());
      const card = document.querySelector(".studio-chat-card");
      expect(card?.textContent).toContain(label);
      expect(card?.textContent).toContain(preview);
      expect(card?.textContent).toContain("revision-17");
      if (state === "output-error") {
        expect(card?.textContent).toContain("Revision conflict");
        expect(card?.querySelector("button")).toBeNull();
      }
      if (state === "output-available")
        expect(card?.textContent).toContain("revision-18");
    });
  }

  it("polls generation, displays the image only on completion, and stops polling", async () => {
    environmentManager.setIsServer(() => false);
    let calls = 0;
    serveCard({ ...image, jobId: "job-image" }, () =>
      Response.json({
        id: "job-image",
        status: ++calls === 1 ? "processing" : "completed",
      }),
    );
    await mountChat(new StudioChatDraftStore());
    await waitForAttachmentStatus("generating");
    expect(document.querySelector(".studio-chat-card img")).toBeNull();
    expect(document.querySelector(".studio-chat-card a")).toBeNull();
    for (
      let i = 0;
      i < 300 && !document.querySelector(".studio-chat-card img");
      i++
    )
      await settle();
    expect(document.querySelector(".studio-chat-card img")).not.toBeNull();
    expect(calls).toBe(2);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });
    expect(calls).toBe(2);
  }, 10000);

  for (const status of ["failed"]) {
    it(`does not present ${status} generation as a ready image`, async () => {
      serveCard({ ...image, jobId: "job-image" }, () =>
        Response.json({ id: "job-image", status }),
      );
      await mountChat(new StudioChatDraftStore());
      await waitForAttachmentStatus(status);
      expect(document.querySelector(".studio-chat-card img")).toBeNull();
      expect(document.querySelector(".studio-chat-card a")).toBeNull();
    });
  }

  it("keeps durable images accessible when their job record is no longer available", async () => {
    serveCard(
      { ...image, jobId: "job-image" },
      () => new Response("Job not found", { status: 404 }),
    );
    await mountChat(new StudioChatDraftStore());
    await waitForAttachmentStatus("status unknown");
    expect(
      document.querySelector(".studio-chat-card img")?.getAttribute("src"),
    ).toBe(image.attachment.url);
    expect(document.querySelector(".studio-chat-card")?.textContent).toContain(
      "status unknown",
    );
  });

  it("retries only the status read after a lookup failure", async () => {
    let reads = 0;
    serveCard({ ...image, jobId: "job-image" }, () =>
      ++reads === 1
        ? new Response("Unavailable", { status: 503 })
        : Response.json({ id: "job-image", status: "completed" }),
    );
    await mountChat(new StudioChatDraftStore());
    expect(document.querySelector(".studio-chat-card img")).toBeNull();
    await waitForAttachmentStatus("Status unavailable");
    click(
      [...document.querySelectorAll(".studio-chat-card button")].find(
        (button) => button.textContent === "Check status",
      ),
      "Check status",
    );
    await waitForAttachmentStatus("ready");
    expect(reads).toBe(2);
    expect(document.querySelector(".studio-chat-card img")).not.toBeNull();
  });

  it("keeps non-image attachments downloadable without an image element", async () => {
    serveCard({
      ...image,
      attachment: {
        mediaType: "application/pdf",
        url: "/files/report.pdf",
        downloadUrl: "/files/report/download",
      },
    });
    await mountChat(new StudioChatDraftStore());
    expect(document.querySelector(".studio-chat-card img")).toBeNull();
    expect(
      [...document.querySelectorAll(".studio-chat-card a")]
        .find((link) => link.textContent === "Download")
        ?.getAttribute("href"),
    ).toBe("/files/report/download");
  });

  it("preserves file links when an image preview fails to load", async () => {
    serveCard(image);
    await mountChat(new StudioChatDraftStore());
    const preview = document.querySelector(".studio-chat-card img");
    expect(preview).not.toBeNull();
    await act(async () => preview?.dispatchEvent(new Event("error")));
    expect(document.querySelector(".studio-chat-card")?.textContent).toContain(
      "Image preview unavailable",
    );
    expect(
      document.querySelector(".studio-chat-card a")?.getAttribute("href"),
    ).toBe(image.attachment.url);
  });
});

describe("native Studio Chat workspace", () => {
  for (const historyFails of [false, true]) {
    it(`shows one approval across stream completion when history ${historyFails ? "fails" : "loads"}`, async () => {
      const store = new StudioChatDraftStore();
      store.update(studioChatDraftKey("/api/chat", "conversation-1"), {
        text: "Generate a car without wheels",
      });
      const previous = globalThis.fetch;
      let reads = 0;
      let sends = 0;
      const transport: {
        controller?: ReadableStreamDefaultController<Uint8Array>;
      } = {};
      const encoder = new TextEncoder();
      const approval = {
        kind: "tool-approval",
        id: "approval-car",
        toolCallId: "call-car",
        toolName: "system_generate",
        state: "approval-requested",
        summary: "Generate Car Without Wheels?",
        input: { entityType: "image", title: "Car Without Wheels" },
      };
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).startsWith("/api/chat/messages?id=")) {
            reads++;
            if (reads === 1) return Response.json({ messages: [] });
            if (historyFails)
              return new Response("Unavailable", { status: 503 });
            return Response.json({
              messages: [
                {
                  id: "saved-response",
                  role: "assistant",
                  content: "Confirmation required.",
                  cards: [approval],
                },
              ],
            });
          }
          if (String(input) === "/api/chat" && init?.method === "POST") {
            sends++;
            return new Response(
              new ReadableStream<Uint8Array>({
                start(controller): void {
                  transport.controller = controller;
                  for (const event of [
                    {
                      type: "text-delta",
                      id: "reply",
                      delta: "Confirmation required.",
                    },
                    {
                      type: "tool-input-available",
                      toolCallId: "call-car",
                      toolName: "system_generate",
                      input: approval.input,
                      title: approval.summary,
                    },
                    {
                      type: "tool-approval-request",
                      toolCallId: "call-car",
                      approvalId: "approval-car",
                    },
                  ])
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                    );
                },
              }),
              { headers: { "Content-Type": "text/event-stream" } },
            );
          }
          return previous(input, init);
        },
        { preconnect: originalFetch.preconnect },
      );
      const approvals = (): HTMLButtonElement[] =>
        [...document.querySelectorAll("button")].filter(
          (button) => button.textContent === "Approve",
        );
      await mountChat(store);
      click(document.querySelector('[aria-label="Send message"]'), "Send");
      for (let i = 0; i < 100 && approvals().length === 0; i++) await settle();
      expect(approvals()).toHaveLength(1);
      expect(reads).toBe(1);
      await act(async () => {
        transport.controller?.enqueue(
          encoder.encode('data: {"type":"finish"}\n\n'),
        );
        transport.controller?.close();
      });
      for (
        let i = 0;
        i < 100 &&
        document.querySelector('button[aria-label="Send message"]') === null;
        i++
      )
        await settle();
      await settle();
      expect(reads).toBeGreaterThanOrEqual(2);
      expect(approvals()).toHaveLength(1);
      expect(sends).toBe(1);
    });
  }

  it("loads archived sessions through the scoped API without replacing the open conversation", async () => {
    const previous = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(String(input));
        if (String(input) === "/api/chat/sessions?archived=true")
          return Response.json({
            sessions: [
              {
                id: "archived-1",
                title: "Archived discussion",
                lastActiveAt: "2026-09-11T12:00:00Z",
                archived: true,
              },
            ],
          });
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    const store = new StudioChatDraftStore();
    const key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, { text: "Keep my draft" });
    await mountChat(store);
    await openHistory();
    const select = document.querySelector<HTMLSelectElement>(
      ".studio-chat-session-controls select",
    );
    if (!select) throw new Error("Missing session archive filter");
    await act(async () => {
      select.value = "archived";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(requests).toContain("/api/chat/sessions?archived=true");
    expect(document.body.textContent).toContain("Archived discussion");
    expect(
      document.querySelector(".studio-chat-session-heading")?.textContent,
    ).toBe("Launch narrative");
    expect(store.read(key).text).toBe("Keep my draft");
    expect(navigations).toHaveLength(0);
  });

  it("keeps a proposed rename after failure and sends it only on explicit submit", async () => {
    const previous = globalThis.fetch;
    let renames = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          renames += 1;
          return new Response("Unavailable", { status: 503 });
        }
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    const store = new StudioChatDraftStore();
    const key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, { text: "Unsent message" });
    await mountChat(store);
    await openDetails();
    click(
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Rename",
      ),
      "Rename",
    );
    await settle();
    const input = document.querySelector<HTMLInputElement>(
      ".studio-chat-rename input",
    );
    if (!input) throw new Error("Rename input missing");
    expect(document.activeElement).toBe(input);
    expect(renames).toBe(0);
    click(
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Save title",
      ),
      "Save title",
    );
    await settle();
    expect(renames).toBe(1);
    expect(input.value).toBe("Launch narrative");
    expect(
      document.querySelector(".studio-chat-rename [role=alert]"),
    ).not.toBeNull();
    expect(store.read(key).text).toBe("Unsent message");
    click(
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel",
      ),
      "Cancel rename",
    );
    await settle();
    expect(renames).toBe(1);
    expect(document.querySelector(".studio-chat-rename")).toBeNull();
  });

  it("preserves a reader's scroll position until Jump to latest is selected", async () => {
    await mountChat(new StudioChatDraftStore());
    const scroll = document.querySelector<HTMLElement>(
      ".studio-chat-thread-scroll",
    );
    if (!scroll) throw new Error("Missing conversation scroller");
    expect(scroll.tabIndex).toBe(0);
    expect(scroll.getAttribute("aria-label")).toBe("Conversation messages");
    Object.defineProperties(scroll, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 400 },
    });
    const historyKey = ["studio", "chat", "messages", "conversation-1"];
    const first = { id: "a", role: "assistant", content: "First answer" };
    await act(async () => queryClient.setQueryData(historyKey, [first]));
    await settle();
    expect(scroll.scrollTop).toBe(1200);
    scroll.scrollTop = 100;
    await act(async () => scroll.dispatchEvent(new Event("scroll")));
    await act(async () =>
      queryClient.setQueryData(historyKey, [
        first,
        { ...first, id: "b", content: "New answer" },
      ]),
    );
    await settle();
    expect(scroll.scrollTop).toBe(100);
    click(
      [...document.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Jump to latest"),
      ),
      "Jump to latest",
    );
    await settle();
    expect(scroll.scrollTop).toBe(1200);
    expect(document.body.textContent).not.toContain("Jump to latest");
    expect(document.activeElement).toBe(scroll);
  });

  it("retries a failed history read without sending a message or hiding the composer", async () => {
    const previous = globalThis.fetch;
    let reads = 0;
    let sends = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") sends += 1;
        if (String(input).startsWith("/api/chat/messages?id=")) {
          reads += 1;
          return reads === 1
            ? new Response("Unavailable", { status: 503 })
            : Response.json({
                messages: [
                  {
                    id: "recovered",
                    role: "assistant",
                    content: "Recovered history",
                  },
                ],
              });
        }
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    await mountChat(new StudioChatDraftStore());
    expect(document.querySelector("textarea")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Conversation could not be loaded",
    );
    expect(document.body.textContent).not.toContain("No messages yet");
    click(
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Retry conversation",
      ),
      "Retry conversation",
    );
    await settle();
    expect(document.body.textContent).toContain("Recovered history");
    expect(reads).toBe(2);
    expect(sends).toBe(0);
  });

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

  it("keeps successful uploads when another file fails and retries only that file", async () => {
    const store = new StudioChatDraftStore();
    const key = studioChatDraftKey("/api/chat", "conversation-1");
    const attempts: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== "/api/chat/uploads") return previous(input, init);
        if (!(init?.body instanceof FormData))
          throw new Error("Missing upload form");
        const file = init.body.get("file");
        if (!(file instanceof File)) throw new Error("Missing file");
        attempts.push(file.name);
        if (
          file.name === "retry.txt" &&
          attempts.filter((name) => name === file.name).length === 1
        )
          return Response.json(
            { error: "Temporary upload failure" },
            { status: 503 },
          );
        const id = `upload-${crypto.randomUUID()}`;
        return Response.json({
          id,
          ref: { kind: "upload", id },
          filename: file.name,
          mediaType: "text/plain",
          sizeBytes: file.size,
          createdAt: "2026-09-11T12:00:00Z",
          url: `/api/chat/uploads/${file.name}`,
          downloadUrl: `/api/chat/uploads/${file.name}?download=true`,
        });
      },
      { preconnect: originalFetch.preconnect },
    );
    await mountChat(store);
    const picker =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!picker) throw new Error("No upload picker");
    Object.defineProperty(picker, "files", {
      value: [new File(["ok"], "ready.txt"), new File(["retry"], "retry.txt")],
    });
    await act(async () =>
      picker.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await settle();
    expect(store.read(key).uploads.map((upload) => upload.filename)).toEqual([
      "ready.txt",
    ]);
    expect(document.body.textContent).toContain(
      "Chat API could not upload file (503)",
    );
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')
        ?.disabled,
    ).toBe(true);
    click(
      document.querySelector('[aria-label="Retry uploading retry.txt"]'),
      "Retry file",
    );
    await settle();
    expect(attempts).toEqual(["ready.txt", "retry.txt", "retry.txt"]);
    expect(store.read(key).uploads.map((upload) => upload.filename)).toEqual([
      "ready.txt",
      "retry.txt",
    ]);
    expect(
      document.querySelector('[aria-label="File upload progress"]'),
    ).toBeNull();
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')
        ?.disabled,
    ).toBe(false);
  });

  it("does not attach a late upload to another session", async () => {
    const store = new StudioChatDraftStore();
    const previous = globalThis.fetch;
    let complete: ((response: Response) => void) | undefined;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/chat/uploads")
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    await mountChat(store);
    const picker =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!picker) throw new Error("No upload picker");
    Object.defineProperty(picker, "files", {
      value: [new File(["text"], "late.txt")],
    });
    await act(async () =>
      picker.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(document.body.textContent).toContain("Uploading…");
    await mountChat(store, "conversation-2");
    const id = `upload-${crypto.randomUUID()}`;
    await act(async () =>
      complete?.(
        Response.json({
          id,
          ref: { kind: "upload", id },
          filename: "late.txt",
          mediaType: "text/plain",
          sizeBytes: 4,
          createdAt: "2026-09-11T12:00:00Z",
          url: `/api/chat/uploads/${id}`,
          downloadUrl: `/api/chat/uploads/${id}?download=true`,
        }),
      ),
    );
    await settle();
    expect(
      store.read(studioChatDraftKey("/api/chat", "conversation-2")).uploads,
    ).toHaveLength(0);
    expect(document.body.textContent).not.toContain("late.txt");
  });

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
    await openDetails();
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
      await openDetails();
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

  it("adopts a new session only after acceptance and carries text composed while waiting", async () => {
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
    // The sent text leaves the composer immediately; only a refusal returns it.
    expect(store.read(key).text).toBe("");
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
    expect(
      document.querySelector(".studio-chat-interruption")?.textContent,
    ).toContain("Stopped");
    const retry = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Review retry in composer",
    );
    expect(retry?.disabled).toBe(true);
  });

  for (const [ending, label] of [
    ["", "Connection lost"],
    ['data: {"type":"abort","reason":"Server stopped"}\n\n', "Stopped"],
    [
      'data: {"type":"error","errorText":"Provider unavailable"}\n\n',
      "Response failed",
    ],
  ] as const) {
    it(`preserves partial output after ${label} and only stages a retry`, async () => {
      const store = new StudioChatDraftStore();
      const key = studioChatDraftKey("/api/chat", "conversation-1");
      store.update(key, { text: "Perform the requested task" });
      const previous = globalThis.fetch;
      let sends = 0;
      let reads = 0;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).startsWith("/api/chat/messages?id=")) reads += 1;
          if (String(input) === "/api/chat" && init?.method === "POST") {
            sends += 1;
            return new Response(
              'data: {"type":"text-delta","id":"reply","delta":"Partial output"}\n\n' +
                ending,
              { headers: { "Content-Type": "text/event-stream" } },
            );
          }
          return previous(input, init);
        },
        { preconnect: originalFetch.preconnect },
      );
      await mountChat(store);
      click(document.querySelector('[aria-label="Send message"]'), "Send");
      await settle();
      expect(document.body.textContent).toContain(label);
      expect(document.body.textContent).toContain("Partial output");
      expect(document.body.textContent).toContain(
        "may repeat completed actions",
      );
      expect(reads).toBe(1);
      expect(store.read(key).text).toBe("");
      const retry = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Review retry in composer",
      );
      click(retry, "Review retry");
      await settle();
      expect(sends).toBe(1);
      expect(store.read(key).text).toBe("Perform the requested task");
      expect(document.activeElement?.tagName).toBe("TEXTAREA");
      await mountChat(store, "conversation-2");
      expect(document.querySelector(".studio-chat-interruption")).toBeNull();
      expect(store.read(key).text).toBe("Perform the requested task");
    });
  }

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

  it("keeps history and context out of the conversation at every width", async () => {
    const store = new StudioChatDraftStore();
    store.update(studioChatDraftKey("/api/chat", "conversation-1"), {
      text: "Keep this draft",
    });
    await mountChat(store);
    expect(document.querySelector(".studio-chat-sessions")).toBeNull();
    expect(document.querySelector(".studio-chat-context")).toBeNull();
    expect(document.body.textContent).not.toContain("Working set");
    await openDetails();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Conversation details",
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Release decision",
    );
    expect(
      document.querySelector(".studio-chat-thread-scroll .studio-chat-context"),
    ).toBeNull();
    windowInstance.happyDOM.setWindowSize({ width: 390, height: 844 });
    expect(document.querySelectorAll(".studio-chat-context")).toHaveLength(1);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Keep this draft",
    );
    await mountChat(store, "conversation-2");
    expect(
      document
        .querySelector('[aria-label="Conversation details and options"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("opens history on demand without replacing messages or drafts", async () => {
    const store = new StudioChatDraftStore();
    store.update(studioChatDraftKey("/api/chat", "conversation-1"), {
      text: "Keep this draft",
    });
    await mountChat(store);
    await openHistory();
    await waitForSessions();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Conversations",
    );
    const launch = [...document.querySelectorAll(".studio-chat-session")].find(
      (element) => element.textContent.includes("Launch narrative"),
    );
    click(launch, "Launch narrative session");
    await settle();
    expect(navigations).toContain("/chat?session=conversation-1");
    expect(
      document
        .querySelector(".studio-chat-session-picker-trigger button")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Keep this draft",
    );
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("empties the composer as the message enters the transcript, before the response", async () => {
    const previous = globalThis.fetch;
    let release = (): void => {};
    const accepted = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).endsWith("/api/chat")) {
          await accepted;
          return new Response(`data: {"type":"finish"}\n\n`, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    const store = new StudioChatDraftStore();
    const key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, { text: "Send me" });
    await mountChat(store);
    const form = document.querySelector<HTMLFormElement>(
      ".studio-chat-composer-form",
    );
    if (!form) throw new Error("Composer form missing");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    // The request has not been answered yet: the transcript owns the message
    // and the composer is already empty, so it never reads as unsent.
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "",
    );
    expect(document.body.textContent).toContain("Send me");
    expect(store.read(key).text).toBe("");
    await act(async () => {
      release();
      await settle();
    });
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "",
    );
  });

  it("restores the composer when the send is refused", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).endsWith("/api/chat")) {
          return new Response("Unavailable", { status: 503 });
        }
        return previous(input, init);
      },
      { preconnect: originalFetch.preconnect },
    );
    const store = new StudioChatDraftStore();
    const key = studioChatDraftKey("/api/chat", "conversation-1");
    store.update(key, { text: "Send me" });
    await mountChat(store);
    const form = document.querySelector<HTMLFormElement>(
      ".studio-chat-composer-form",
    );
    if (!form) throw new Error("Composer form missing");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Send me",
    );
    expect(store.read(key).text).toBe("Send me");
  });
});
