/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventTarget as HappyEventTarget, Window } from "happy-dom";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_CLOSING_ATTRIBUTE,
  ASK_DOCK_ATTRIBUTE,
  ASK_KEYBOARD_ATTRIBUTE,
  ASK_NAME_ATTRIBUTE,
  ASK_PAGE_LOCK_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SHEET_HISTORY_KEY,
  ASK_SOURCE_ATTRIBUTE,
} from "@brains/contracts";
import type { ChatHistoryMessage } from "@brains/contracts/chat";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { GuestBox, type GuestBoxProps } from "./GuestBox";

let dom: Window;
let restoreGlobals: RestoreGlobals;
let root: Root;
let host: HTMLElement;
/** The part of the visual viewport the sheet reads. */
class FakeViewport extends HappyEventTarget {
  height = 844;
  offsetTop = 0;
}
let viewport: FakeViewport;

const answer: ChatHistoryMessage[] = [
  { id: "q", role: "user", content: "What is public?" },
  {
    id: "a",
    role: "assistant",
    content: "This is public.",
    cards: [
      {
        kind: "sources",
        id: "sources:tool-results",
        title: "Retrieved sources",
        sources: [
          {
            id: "post:across-space-and-time",
            source: "post",
            entityType: "post",
            entityId: "across-space-and-time",
            title: "Across Space And Time",
            url: "https://brain.test/essays/across-space-and-time",
          },
        ],
      },
    ],
  },
];

function setup(width: number, hostOpen = false): void {
  dom = new Window({ url: "https://brain.test/", width, height: 844 });
  viewport = new FakeViewport();
  Object.defineProperty(dom, "visualViewport", { value: viewport });
  restoreGlobals = installDomGlobals(dom, {
    Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent,
    PopStateEvent: dom.PopStateEvent,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    matchMedia: dom.matchMedia.bind(dom),
    visualViewport: viewport,
    history: dom.history,
  });
  host = document.createElement("div");
  host.setAttribute(ASK_BOX_ATTRIBUTE, "");
  if (hostOpen) host.setAttribute(ASK_SHEET_ATTRIBUTE, "");
  document.body.append(host);
  root = createRoot(host);
}

afterEach(async (): Promise<void> => {
  await act(async (): Promise<void> => root.unmount());
  await dom.happyDOM.abort();
  dom.close();
  restoreGlobals();
});

function props(overrides: Partial<GuestBoxProps> = {}): GuestBoxProps {
  return {
    copy: {
      title: "Ask this brain",
      notice: "",
      inputHint: "Your question",
      topicsLabel: "Try:",
      topics: [],
    },
    session: undefined,
    state: "ready",
    busy: false,
    messages: [],
    earlier: [],
    draft: "",
    setDraft: (): void => undefined,
    canSend: true,
    canCheck: false,
    canContinue: false,
    onSend: (): void => undefined,
    onCheck: async (): Promise<void> => undefined,
    onAvailability: async (): Promise<void> => undefined,
    onFresh: async (): Promise<boolean> => true,
    onContinue: (): void => undefined,
    onStopWaiting: (): void => undefined,
    actionNotice: undefined,
    ...overrides,
  };
}

async function render(overrides: Partial<GuestBoxProps> = {}): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(<GuestBox {...props(overrides)} />);
  });
}

function composer(): HTMLTextAreaElement {
  const input = host.querySelector("textarea");
  if (!input) throw new Error("Missing composer");
  return input;
}

/** Whether the page behind the sheet is pinned in place. */
function pageLocked(): boolean {
  return (
    document.documentElement.hasAttribute(ASK_PAGE_LOCK_ATTRIBUTE) &&
    document.body.style.position === "fixed"
  );
}

/** Whether everything on the page but the open sheet is out of sight. */
function pageHidden(): boolean {
  return (
    document.body.style.visibility === "hidden" &&
    host.style.visibility === "visible"
  );
}

async function focusComposer(): Promise<void> {
  await act(async (): Promise<void> => {
    composer().blur();
    composer().focus();
  });
}

async function click(label: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find(
    (element) =>
      element.textContent.includes(label) ||
      element.getAttribute("aria-label") === label,
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async (): Promise<void> => button.click());
}

describe("the Ask box on a phone", () => {
  describe("on a narrow screen", () => {
    beforeEach(() => setup(390, true));

    it("opens full screen as the box mounts on engagement, and locks the page behind it", async () => {
      const before = history.length;
      await render();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
      expect(pageLocked()).toBe(true);
      // Back closes the conversation rather than leaving the page.
      expect(history.length).toBe(before + 1);
      expect(host.querySelector('[aria-label="Close conversation"]')).not.toBe(
        null,
      );
    });

    it("offers its host a dock at the top of the conversation, and keeps what the host puts there", async () => {
      await render();
      const region = host.querySelector(".brain-box-scroll");
      const dock = region?.firstElementChild;
      expect(dock?.hasAttribute(ASK_DOCK_ATTRIBUTE)).toBe(true);
      const lent = document.createElement("div");
      lent.id = "hosts-map";
      dock?.append(lent);
      await render({ messages: answer, state: "complete" });
      expect(region?.firstElementChild).toBe(dock);
      expect(dock?.querySelector("#hosts-map")).toBe(lent);
    });

    it("pins the page where it was, so nothing moves behind the sheet, and returns it there on close", async () => {
      window.scrollTo(0, 300);
      await render();
      expect(pageLocked()).toBe(true);
      expect(document.body.style.top).toBe("-300px");
      await click("Close conversation");
      expect(pageLocked()).toBe(false);
      expect(document.body.style.position).toBe("");
      expect(window.scrollY).toBe(300);
    });

    it("opened again from the page, holds it where the finger landed, at once", async () => {
      await render();
      await click("Close conversation");
      window.scrollTo(0, 0);
      await act(async (): Promise<void> => {
        composer().dispatchEvent(new Event("touchstart", { bubbles: true }));
        // Safari scrolls the tapped field into view before it takes focus.
        window.scrollTo(0, 392);
        composer().focus();
      });
      expect(
        document.documentElement.getAttribute(ASK_PAGE_LOCK_ATTRIBUTE),
      ).toBe("0");
      await click("Close conversation");
      expect(window.scrollY).toBe(0);
    });

    it("marks its history entry with where the page was, for a reload to return to", async () => {
      window.scrollTo(0, 300);
      await render();
      expect(history.state).toEqual({ [ASK_SHEET_HISTORY_KEY]: { y: 300 } });
    });

    it("stays open when the boot already opened it before the box mounted", async () => {
      await act(async (): Promise<void> => root.unmount());
      host.setAttribute(ASK_SHEET_ATTRIBUTE, "");
      root = createRoot(host);
      await render();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
    });

    it("stays closed when closed while the conversation is still loading", async () => {
      await render({ busy: true });
      await click("Close conversation");
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      await render({ busy: false });
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(document.activeElement).not.toBe(composer());
    });

    it("closes with the close button, Escape or Back, and unlocks the page", async () => {
      await render();
      await click("Close conversation");
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(pageLocked()).toBe(false);

      await focusComposer();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
      await act(async (): Promise<void> => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);

      await focusComposer();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
      await act(async (): Promise<void> => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      });
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
    });

    it("hides the rest of the page once it covers it, so nothing of it can show through", async () => {
      await render();
      expect(pageHidden()).toBe(true);
      await click("Close conversation");
      expect(pageHidden()).toBe(false);
      expect(document.body.style.visibility).toBe("");
    });

    it("waits for its rise to end before hiding the page it rises over", async () => {
      await act(async (): Promise<void> => root.unmount());
      root = createRoot(host);
      const rise = Promise.withResolvers<void>();
      Object.assign(host, {
        getAnimations: (): Array<{ finished: Promise<void> }> => [
          { finished: rise.promise },
        ],
      });
      await render();
      expect(pageHidden()).toBe(false);
      await act(async (): Promise<void> => {
        rise.resolve();
        await rise.promise;
      });
      expect(pageHidden()).toBe(true);
    });

    it("falls away before it closes when its stylesheet animates it", async () => {
      await render();
      const computed = window.getComputedStyle;
      // happy-dom runs no animations: say the sheet has one, as guest.css gives it.
      Object.assign(window, {
        getComputedStyle: (
          element: Element,
        ): Pick<CSSStyleDeclaration, "animationName"> =>
          element === host
            ? { animationName: "brain-ask-fall" }
            : computed(element),
      });
      await click("Close conversation");
      expect(host.hasAttribute(ASK_CLOSING_ATTRIBUTE)).toBe(true);
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
      // The page shows again as the sheet starts to fall away from it.
      expect(pageHidden()).toBe(false);
      await act(async (): Promise<void> => {
        host.dispatchEvent(new Event("animationend"));
      });
      expect(host.hasAttribute(ASK_CLOSING_ATTRIBUTE)).toBe(false);
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(pageLocked()).toBe(false);
      Object.assign(window, { getComputedStyle: computed });
    });

    it("fits the space above the keyboard and says when the keyboard is open", async () => {
      await render();
      await focusComposer();
      await act(async (): Promise<void> => {
        viewport.height = 420;
        viewport.dispatchEvent(new dom.Event("resize"));
      });
      expect(host.style.getPropertyValue("--ask-viewport-height")).toBe(
        "420px",
      );
      expect(host.hasAttribute(ASK_KEYBOARD_ATTRIBUTE)).toBe(true);
      await act(async (): Promise<void> => {
        composer().blur();
        viewport.height = 844;
        viewport.dispatchEvent(new dom.Event("resize"));
      });
      expect(host.hasAttribute(ASK_KEYBOARD_ATTRIBUTE)).toBe(false);
    });

    it("closes the keyboard on send, so the answer gets the screen", async () => {
      const onSend = mock(() => undefined);
      await render({ draft: "What is public?", onSend });
      await focusComposer();
      await act(async (): Promise<void> => {
        host
          .querySelector("form")
          ?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(composer());
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
    });

    it("opens an arriving answer at its question, not at its end", async () => {
      const question = answer.slice(0, 1);
      await render({ messages: question, state: "working", busy: true });
      const region = host.querySelector<HTMLElement>(".brain-box-scroll");
      if (!region) throw new Error("Missing conversation region");
      // happy-dom has no layout: a long answer below the region's top.
      Object.defineProperty(region, "scrollHeight", { value: 1600 });
      Object.defineProperty(region, "clientHeight", { value: 500 });
      region.getBoundingClientRect = (): DOMRect =>
        new dom.DOMRect(0, 172, 390, 500);
      region.scrollTop = 1100;
      await render({ messages: answer, state: "complete" });
      const asked = host.querySelector<HTMLElement>(".guest-user");
      expect(asked).not.toBe(null);
      expect(region.scrollTop).not.toBe(1600);
      expect(
        [...host.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Rest of the answer"),
        ),
      ).toBe(true);
      // Closed, the conversation is out of sight, and so is its way to the end.
      await click("Close conversation");
      expect(
        [...host.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Rest of the answer"),
        ),
      ).toBe(false);
    });

    it("offers the conversation back after closing it", async () => {
      await render({ messages: answer, state: "complete" });
      await click("Close conversation");
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(
        [...host.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Continue conversation"),
        ),
      ).toBe(true);
      await click("Continue conversation");
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
    });
  });

  describe("in the words of the site it sits on", () => {
    beforeEach(() => {
      setup(390, true);
      host.setAttribute(ASK_NAME_ATTRIBUTE, "Yeehaa");
    });

    it("names the conversation and its answers after the owner for screen readers, and lists sources as links", async () => {
      await render({ messages: answer, state: "complete" });
      const title = host.querySelector(".brain-box-sheet-title");
      expect(title?.textContent).toBe("Ask Yeehaa");
      expect(title?.classList.contains("brain-box-sr-only")).toBe(true);
      expect(host.querySelector(".guest-assistant h2")?.textContent).toBe(
        "Yeehaa",
      );
      const source = host.querySelector<HTMLAnchorElement>(
        `.brain-box-sources [${ASK_SOURCE_ATTRIBUTE}="post:across-space-and-time"] a`,
      );
      expect(source?.textContent).toBe("Across Space And Time");
      expect(source?.getAttribute("href")).toBe(
        "https://brain.test/essays/across-space-and-time",
      );
      expect(host.querySelector(".web-chat-sources-card")).toBe(null);
      expect(host.textContent).not.toContain("Answer received");
      expect(host.querySelector("#brain-chat-notice")?.textContent).toBe(
        "Answers use published work only. Leave private details out.",
      );
    });

    it("shows where the answer will appear while it is being written", async () => {
      await render({
        messages: answer.slice(0, 1),
        state: "working",
        busy: true,
      });
      const pending = host.querySelector(".brain-box-pending");
      expect(pending?.querySelector("h2")?.textContent).toBe("Yeehaa");
      // The line names the work, not the person: the name is said once.
      expect(pending?.textContent).toContain(
        "Looking through the published work",
      );
      await render({ messages: answer, state: "complete" });
      expect(host.querySelector(".brain-box-pending")).toBe(null);
    });

    it("tells only screen readers that it is connecting, so the sheet opens complete", async () => {
      await render({ state: "connecting", busy: true });
      const activity = host.querySelector(".brain-box-activity");
      expect(activity?.textContent).toBe("Connecting to chat…");
      expect(activity?.classList.contains("brain-box-sr-only")).toBe(true);
    });

    it("offers to stop waiting only once the answer is taking long", async () => {
      const stopButton = (): HTMLButtonElement | undefined =>
        [...host.querySelectorAll("button")].find((button) =>
          button.textContent.includes("Stop waiting"),
        );
      await render({
        messages: answer.slice(0, 1),
        state: "working",
        busy: true,
        stopWaitingAfterMs: 30,
      });
      expect(stopButton()).toBeUndefined();
      await act(async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(stopButton()).toBeDefined();
    });

    it("has no title row: only a way out, over the top of the conversation", async () => {
      await render({ messages: answer, state: "complete" });
      const head = host.querySelector(".brain-box-sheet-head");
      expect(
        [...(head?.querySelectorAll("button") ?? [])].map((button) =>
          button.getAttribute("aria-label"),
        ),
      ).toEqual(["Close conversation"]);
      expect(head?.querySelector("button[aria-expanded]")).toBe(null);
    });

    it("says the same note under the composer before and after an answer, with what the chat is about beside it", async () => {
      await render();
      const note = (): string | undefined =>
        host.querySelector("#brain-chat-notice")?.textContent;
      expect(note()).toBe(
        "Answers use published work only. Leave private details out.",
      );
      await render({ messages: answer, state: "complete" });
      expect(note()).toBe(
        "Answers use published work only. Leave private details out.",
      );
      const about = host.querySelector(
        ".brain-box-bottom button[aria-expanded]",
      );
      expect(about?.textContent).toBe("About this chat");
    });

    it("leaves out the link to the full chat, since it already fills the screen", async () => {
      await render({ messages: answer, state: "complete", canContinue: true });
      expect(host.textContent).not.toContain("Full chat");
    });
  });

  describe("on a wide screen", () => {
    beforeEach(() => setup(1280));

    it("stays in the page", async () => {
      await render({ messages: answer, state: "complete" });
      await focusComposer();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(pageLocked()).toBe(false);
      expect(host.textContent).not.toContain("Continue conversation");
    });

    it("offers what the chat is about beside the note, not above the conversation", async () => {
      await render({ messages: answer, state: "complete" });
      expect(
        host.querySelector(".brain-box-bottom button[aria-expanded]")
          ?.textContent,
      ).toBe("About this chat");
      expect(
        host.querySelector(".brain-box-header-actions button[aria-expanded]"),
      ).toBe(null);
    });

    it("links to the full chat from the page", async () => {
      await render({ messages: answer, state: "complete", canContinue: true });
      expect(host.textContent).toContain("Full chat");
    });
  });
});
