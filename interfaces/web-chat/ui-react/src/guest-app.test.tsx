/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import {
  createChatClient,
  chatMessageRequestSchema,
  CHAT_CONVERSATION_ID_HEADER,
  type GuestChatSessionResponse,
} from "@brains/contracts/chat";
import { GuestApp, type GuestBoxCopy } from "./GuestApp";
const boxCopy: GuestBoxCopy = {
  title: "Ask this brain",
  notice: "Public chat",
  inputHint: "Your question",
  topicsLabel: "Try:",
  topics: ["Energy efficiency"],
};
import { deferred } from "@brains/utils/deferred";

let dom: Window;
let root: Root;
const id = `guest-${"a".repeat(64)}`;
let calls: { path: string; body: unknown; method: string }[];
let available: boolean;
let interrupted: boolean;
let lostResponse: boolean;
let incompleteHistory: boolean;
let unavailableHistory: boolean;
let receiptActive: boolean;
let deleted: boolean;
let lockNames: string[];
const session = {
  expiresAt: Date.now() + 3600000,
  provider: "Mock provider",
  notice: "Do not share sensitive text.",
  deletionLimitations: "Provider records are separate.",
  retention: { idleSeconds: 3600, maxAgeSeconds: 7200 },
  messageCharacters: 4000,
  canSend: true,
};
const sourceCard = {
  kind: "sources",
  id: "sources:tool-results",
  sources: [
    {
      id: "note:evidence",
      entityId: "evidence",
      entityType: "note",
      source: "note",
      title: "Public evidence",
      url: "https://example.org/source",
      provenance: { diagnostic: "PRIVATE" },
    },
  ],
};
const history = [
  { id: "old", role: "user", content: "Before refresh" },
  {
    id: "answer",
    role: "assistant",
    cards: [
      sourceCard,
      { ...sourceCard, id: "sources:context", title: "PRIVATE CONTEXT" },
    ],
    content:
      "A **public** answer. ![tracker](https://tracker.invalid/image) <script>bad()</script> [unsafe](javascript:alert(1))",
  },
];

beforeEach(() => {
  dom = new Window({ url: "https://brain.test/ask" });
  lockNames = [];
  // Happy DOM does not implement Web Locks. Native cross-tab coordination is
  // exercised separately in Chromium; these are single-mount transport tests.
  Object.defineProperty(dom.navigator, "locks", {
    configurable: true,
    value: {
      request: async (
        name: string,
        _options: LockOptions,
        callback: () => Promise<GuestChatSessionResponse>,
      ): Promise<GuestChatSessionResponse> => {
        lockNames.push(name);
        return callback();
      },
    },
  });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    sessionStorage: dom.sessionStorage,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  calls = [];
  session.expiresAt = Date.now() + 3600000;
  available = true;
  interrupted = false;
  lostResponse = false;
  incompleteHistory = false;
  unavailableHistory = false;
  receiptActive = false;
  deleted = false;
});
afterEach(async (): Promise<void> => {
  await act(async (): Promise<void> => root.unmount());
  dom.close();
});
async function mount(
  options: {
    box?: GuestBoxCopy;
    initialDraft?: string;
    initialSubmit?: boolean;
  } = {},
): Promise<void> {
  const client = createChatClient({
    apiPath: "/api/chat/guest",
    fetch: async (input, init): Promise<Response> => {
      const path = String(input);
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ path, body, method: init?.method ?? "GET" });
      if (path.endsWith("/session"))
        return available
          ? Response.json(session)
          : Response.json({ error: "unavailable" }, { status: 503 });
      if (path.includes("/messages?") && unavailableHistory)
        return Response.json(
          { error: "Conversation unavailable" },
          { status: 404 },
        );
      if (path.includes("/messages?"))
        return Response.json({
          messages: incompleteHistory ? history.slice(0, 1) : history,
          ...(path.includes("submissionId=")
            ? {
                submission: {
                  conversationId: id,
                  state:
                    incompleteHistory || receiptActive ? "active" : "completed",
                },
              }
            : {}),
        });
      if (init?.method === "DELETE") {
        deleted = true;
        return Response.json({ deleted: true });
      }
      if (path === "/api/chat/guest" && lostResponse)
        throw new TypeError("PRIVATE transport diagnostic");
      if (path === "/api/chat/guest")
        return new Response(
          [
            { type: "text-start", id: "answer" },
            {
              type: "text-delta",
              id: "answer",
              delta: "An actual transport reply",
            },
            { type: "data-sources", id: sourceCard.id, data: sourceCard },
            ...(interrupted
              ? []
              : [
                  { type: "text-end", id: "answer" },
                  { type: "finish", finishReason: "stop" },
                ]),
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
          {
            headers: {
              [CHAT_CONVERSATION_ID_HEADER]: id,
              "Content-Type": "text/event-stream",
            },
          },
        );
      throw new Error("Unexpected transport");
    },
  });
  await act(async (): Promise<void> => {
    root.render(<GuestApp client={client} {...options} />);
  });
}
async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find((element) =>
    element.textContent.includes(label),
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async (): Promise<void> => button.click());
}
async function ask(text: string): Promise<void> {
  const textarea = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >("textarea, input");
  if (!textarea) throw new Error("Missing composer");
  await act(async (): Promise<void> => {
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async (): Promise<void> => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("public Ask UI with mocked Chat transport", () => {
  it("uses the existing box and continues the same conversation in standalone Ask without replay", async () => {
    await mount({ box: boxCopy, initialDraft: "An editable suggestion" });
    expect(document.querySelector("main")).toBeNull();
    expect(document.querySelector(".guest-tools")).toBeNull();
    expect(document.querySelector(".guest-panel")).toBeNull();
    expect(document.querySelector("textarea")?.value).toBe(
      "An editable suggestion",
    );
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
    await ask("A deliberate question");
    expect(document.querySelector('a[href="/ask"]')?.textContent).toContain(
      "Full chat",
    );
    expect(sessionStorage.getItem("brain-ask-conversation")).toBe(id);
    await act(async (): Promise<void> => root.unmount());
    const container = document.body.firstElementChild;
    if (!container) throw new Error("Missing root");
    root = createRoot(container);
    await mount();
    expect(document.querySelector("main")).not.toBeNull();
    expect(
      calls.some((call) => call.path === `/api/chat/guest/messages?id=${id}`),
    ).toBe(true);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
  });
  it("fills the existing box from a topic without sending or adding management controls", async () => {
    await mount({ box: boxCopy });
    await click("Energy efficiency");
    expect(
      document
        .querySelector(".prompt-row textarea")
        ?.getAttribute("aria-label"),
    ).toBe(boxCopy.title);
    expect(document.querySelector("textarea")?.value).toBe("Energy efficiency");
    expect(document.body.textContent).not.toContain("New conversation");
    expect(document.body.textContent).not.toContain("Delete conversation");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });

  it("does not strand the box on an expired locator or replay its old request", async () => {
    sessionStorage.setItem("brain-ask-conversation", id);
    sessionStorage.setItem("brain-ask-conversation-list", JSON.stringify([id]));
    unavailableHistory = true;
    await mount({ box: boxCopy });
    expect(document.body.textContent).toContain(
      "This conversation is unavailable",
    );
    expect(sessionStorage.getItem("brain-ask-conversation")).toBe(id);
    await click("New question");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
    await click("Continue");
    expect(sessionStorage.getItem("brain-ask-conversation")).toBeNull();
    expect(sessionStorage.getItem("brain-ask-conversation-list")).toContain(id);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
    await ask("A new deliberate question");
    expect(
      calls.find((call) => call.path === "/api/chat/guest")?.body,
    ).not.toHaveProperty("id");
    expect(deleted).toBe(false);
  });

  it("checks an interrupted box answer using history only and preserves partial text", async () => {
    interrupted = true;
    incompleteHistory = true;
    await mount({ box: boxCopy });
    await ask("A question to check");
    expect(document.body.textContent).toContain("An actual transport reply");
    await click("Check answer");
    expect(document.body.textContent).toContain("An actual transport reply");
    expect(document.body.textContent).toContain(
      "No complete answer is confirmed yet",
    );
    incompleteHistory = false;
    await click("Check answer");
    expect(document.body.textContent).toContain("Answer received");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
  });

  it("does not mistake an earlier answer for completion of a different pending submission", async () => {
    interrupted = true;
    receiptActive = true;
    await mount({ box: boxCopy });
    await ask("My current question");
    await click("Check answer");
    expect(document.body.textContent).toContain(
      "No complete answer is confirmed yet",
    );
    expect(document.body.textContent).toContain("My current question");
    expect(
      document.querySelector('button[type="submit"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
  });

  it("keeps an uncertain question and draft through a failed and then explicit separate start", async () => {
    lostResponse = true;
    await mount({ box: boxCopy });
    await ask("Preserve my uncertain question");
    expect(document.body.textContent).toContain("Connection lost");
    expect(document.body.textContent).not.toContain("Recovery unavailable");
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Check answer",
      ),
    ).toBe(false);
    await ask("My new draft");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
    await click("New question");
    available = false;
    await click("Continue");
    expect(document.body.textContent).toContain(
      "Preserve my uncertain question",
    );
    expect(document.querySelector("textarea")?.value).toBe("My new draft");
    available = true;
    await click("Continue");
    expect(document.body.textContent).toContain("Earlier text · not resent");
    expect(document.body.textContent).toContain(
      "Preserve my uncertain question",
    );
    expect(document.querySelector("textarea")?.value).toBe("My new draft");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
    lostResponse = false;
    await ask("A deliberate separate question");
    const sends = calls.filter((call) => call.path === "/api/chat/guest");
    expect(sends).toHaveLength(2);
    expect(sends[1]?.body).not.toHaveProperty("id");
    expect(deleted).toBe(false);
  });

  it("preserves oversized text and never sends it, including an initial send intent", async () => {
    const long = "x".repeat(4010);
    await mount({ box: boxCopy, initialDraft: long, initialSubmit: true });
    expect(document.querySelector("textarea")?.value).toBe(long);
    expect(document.body.textContent).toContain("10 characters over the limit");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
    await ask("A shorter question");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
  });

  it("honors an explicit pre-mount send exactly once", async () => {
    await mount({
      box: boxCopy,
      initialDraft: "I clicked the arrow",
      initialSubmit: true,
    });
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
    expect(document.body.textContent).toContain("Answer received");
  });

  it("ends the initial intent after unavailable access; checking availability does not send", async () => {
    available = false;
    await mount({
      box: boxCopy,
      initialDraft: "Keep this question",
      initialSubmit: true,
    });
    available = true;
    await click("Check availability");
    expect(document.querySelector("textarea")?.value).toBe(
      "Keep this question",
    );
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });

  it("restores incomplete history honestly without replay and allows an explicit reload", async () => {
    sessionStorage.setItem("brain-ask-conversation", id);
    incompleteHistory = true;
    await mount();
    expect(document.body.textContent).toContain(
      "may still be running or incomplete",
    );
    incompleteHistory = false;
    await click("Reload history");
    expect(document.body.textContent).toContain("Conversation restored");
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });

  it("does not promise navigation continuity when locator storage is unavailable", async () => {
    Object.defineProperty(sessionStorage, "setItem", {
      value: (): never => {
        throw new Error("Storage disabled");
      },
    });
    await mount({ box: boxCopy });
    await ask("Stay in this box");
    expect(document.querySelector('a[href="/ask"]')).toBeNull();
    expect(document.body.textContent).toContain("Answer received");
  });

  it("keeps the box's unsent draft visible and cannot send when guest access is unavailable", async () => {
    available = false;
    await mount({ box: boxCopy, initialDraft: "Keep this unsent draft" });
    expect(document.querySelector("textarea")?.value).toBe(
      "Keep this unsent draft",
    );
    expect(
      document.querySelector('button[type="submit"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });

  it("does not issue a credential when browser coordination is unavailable", async () => {
    Object.defineProperty(dom.navigator, "locks", { value: undefined });
    await mount();
    expect(calls).toHaveLength(0);
    expect(document.body.textContent).toContain(
      "Guest access or saved history is unavailable",
    );
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });
  it("cancels a queued session request when the view unmounts", async () => {
    const gate = deferred<void>();
    let signal: AbortSignal | undefined;
    Object.defineProperty(dom.navigator, "locks", {
      value: {
        request: async (
          _name: string,
          options: LockOptions,
          callback: () => Promise<GuestChatSessionResponse>,
        ): Promise<GuestChatSessionResponse> => {
          signal = options.signal;
          await gate.promise;
          signal?.throwIfAborted();
          return callback();
        },
      },
    });
    await mount();
    expect(calls).toHaveLength(0);
    await act(async (): Promise<void> => {
      root.unmount();
      gate.resolve();
    });
    expect(signal?.aborted).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("discloses provider/retention before sending and never generates on mount", async () => {
    await mount();
    expect(lockNames).toEqual(["brain-ask-visitor-session"]);
    expect(document.querySelector("details")?.open).toBe(true);
    expect(document.body.textContent).toContain("Mock provider");
    expect(calls.map((call) => call.path)).toEqual(["/api/chat/guest/session"]);
  });
  it("preserves the draft and blocks sending after the visitor lease expires", async () => {
    session.expiresAt = Date.now() - 1000;
    await mount();
    await ask("Keep this unsent draft");
    expect(document.body.textContent).toContain("visitor session has expired");
    expect(document.querySelector("textarea")?.value).toBe(
      "Keep this unsent draft",
    );
    expect(document.querySelector("textarea")?.disabled).toBe(true);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });

  it("does not show a composer when guest admission is unavailable", async () => {
    available = false;
    await mount();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).toContain("unavailable");
  });
  it("restores authorized history, renders Markdown and blocks images and executable HTML/links", async () => {
    sessionStorage.setItem("brain-ask-conversation", id);
    await mount();
    expect(document.body.textContent).toContain("Before refresh");
    expect(
      document.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("public");
    expect(document.querySelector("img, script, iframe")).toBeNull();
    expect(
      [...document.querySelectorAll("a")].some((link) =>
        link.href.startsWith("javascript:"),
      ),
    ).toBe(false);
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(0);
  });
  it("sends only the new user text, follows up using the server locator and stores no transcript", async () => {
    await mount();
    await ask("Explore this thought");
    expect(document.body.textContent).toContain("An actual transport reply");
    await ask("And then?");
    const sends = calls.filter((call) => call.path === "/api/chat/guest");
    expect(sends).toHaveLength(2);
    expect(sends[0]?.body).not.toHaveProperty("id");
    expect(sends[1]?.body).toMatchObject({
      id,
      messages: [
        { role: "user", parts: [{ type: "text", text: "And then?" }] },
      ],
    });
    expect(JSON.stringify(sessionStorage)).not.toContain(
      "Explore this thought",
    );
    expect(sessionStorage.getItem("brain-ask-conversation")).toBe(id);
  });
  it("shows projected sources after streaming and history refresh, without raw diagnostics", async () => {
    await mount();
    await ask("Question");
    expect(
      document.querySelector('[aria-label="Retrieved sources"]')?.textContent,
    ).toContain("Public evidence");
    expect(document.body.textContent).not.toContain("PRIVATE");
    expect(
      document.querySelector('a[href="https://example.org/source"]'),
    ).not.toBeNull();
    await act(async () => root.unmount());
    const container = document.body.firstElementChild;
    if (!container) throw new Error("Missing root");
    root = createRoot(container);
    await mount();
    expect(
      document.querySelectorAll('[aria-label="Retrieved sources"]'),
    ).toHaveLength(1);
    expect(document.body.textContent).not.toContain("PRIVATE");
  });

  it("does not replay an ambiguous first send without a server locator", async () => {
    lostResponse = true;
    await mount();
    await ask("Keep my uncertain question");
    expect(document.body.textContent).toContain("Keep my uncertain question");
    expect(document.body.textContent).toContain("cannot safely retry");
    expect(document.body.textContent).not.toContain("PRIVATE");
    expect(sessionStorage.getItem("brain-ask-conversation")).toBeNull();
    const recovery = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Recovery unavailable"),
    );
    expect(recovery?.disabled).toBe(true);
    await act(async (): Promise<void> => {
      recovery?.click();
      document
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(
      calls.filter((call) => call.path === "/api/chat/guest"),
    ).toHaveLength(1);
    expect(calls.filter((call) => call.path.endsWith("/session"))).toHaveLength(
      1,
    );
  });

  it("preserves partial replies on truncated streams and retries the exact submission", async () => {
    interrupted = true;
    await mount();
    await ask("Keep my question");
    expect(document.body.textContent).toContain("Keep my question");
    expect(document.body.textContent).toContain("An actual transport reply");
    expect(document.body.textContent).toContain("unavailable or incomplete");
    await click("Check / retry");
    const sends = calls.filter((call) => call.path === "/api/chat/guest");
    expect(sends[1]?.body).toMatchObject({ id });
    expect(sends[1]?.body).toHaveProperty(
      "messages",
      chatMessageRequestSchema.parse(sends[0]?.body).messages,
    );
  });
  it("distinguishes a new conversation from confirmed deletion", async () => {
    await mount();
    await ask("First conversation");
    await click("New conversation");
    expect(deleted).toBe(false);
    expect(document.body.textContent).toContain(
      "Previous conversations are not deleted",
    );
    expect(document.querySelector("select")?.textContent).toContain(
      "Conversation 1",
    );
    await ask("Second conversation");
    await click("Delete conversation");
    expect(deleted).toBe(false);
    await click("Confirm deletion");
    expect(deleted).toBe(true);
    expect(sessionStorage.getItem("brain-ask-conversation")).toBeNull();
  });
});
