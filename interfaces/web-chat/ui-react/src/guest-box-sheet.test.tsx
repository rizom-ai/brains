/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventTarget as HappyEventTarget, Window } from "happy-dom";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_KEYBOARD_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
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
  { id: "a", role: "assistant", content: "This is public." },
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
    beforeEach(() => setup(390));

    it("opens full screen as the box mounts on engagement, and locks the page behind it", async () => {
      const before = history.length;
      await render();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
      expect(document.documentElement.style.overflow).toBe("hidden");
      // Back closes the conversation rather than leaving the page.
      expect(history.length).toBe(before + 1);
      expect(host.querySelector('[aria-label="Close conversation"]')).not.toBe(
        null,
      );
    });

    it("stays open when the boot already opened it before the box mounted", async () => {
      await act(async (): Promise<void> => root.unmount());
      host.setAttribute(ASK_SHEET_ATTRIBUTE, "");
      root = createRoot(host);
      await render();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
    });

    it("closes with the close button, Escape or Back, and unlocks the page", async () => {
      await render();
      await click("Close conversation");
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(document.documentElement.style.overflow).toBe("");

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

  describe("on a wide screen", () => {
    beforeEach(() => setup(1280));

    it("stays in the page", async () => {
      await render({ messages: answer, state: "complete" });
      await focusComposer();
      expect(host.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
      expect(document.documentElement.style.overflow).toBe("");
      expect(host.textContent).not.toContain("Continue conversation");
    });
  });
});
