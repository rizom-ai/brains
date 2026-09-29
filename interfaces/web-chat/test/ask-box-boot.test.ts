import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window, type HTMLElement as HappyDOMHTMLElement } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_READY_ATTRIBUTE,
  ASK_PAGE_LOCK_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SHEET_HISTORY_KEY,
  ASK_STATUS_ATTRIBUTE,
} from "@brains/contracts";
import { ASK_BOX_LOADER_SCRIPT, askBoxBootScript } from "../src/ask-box-boot";

let window: Window;
let restoreGlobals: RestoreGlobals;
/** The boot's idle work, run when a test says the page is idle; no real timers. */
let idle: Array<() => void>;
const pageIdle = (): void => idle.splice(0).forEach((run) => run());

/** The host contract every consuming site renders; the boot owns nothing else. */
const host = `
  <div ${ASK_BOX_ATTRIBUTE}>
    <p ${ASK_STATUS_ATTRIBUTE} role="status"></p>
    <textarea disabled aria-label="Your question"></textarea>
    <button ${ASK_SEND_ATTRIBUTE} type="button" disabled>Send</button>
  </div>`;

function element(selector: string): HappyDOMHTMLElement {
  const match = window.document.querySelector(selector);
  if (!(match instanceof window.HTMLElement))
    throw new Error(`Missing test element: ${selector}`);
  return match;
}
const input = (): HappyDOMHTMLElement => element("textarea");
const status = (): string => element(`[${ASK_STATUS_ATTRIBUTE}]`).textContent;
const guestStylesheet = (): boolean =>
  window.document.head.querySelector(
    'link[href="/ask/assets/guest.css?v=v1"]',
  ) !== null;

function boot(markup = host): void {
  window.document.body.innerHTML = markup;
  eval(askBoxBootScript("v1"));
}

/** The guest bundle cannot load in tests, which is exactly the failure a visitor can hit. */
async function settled(): Promise<void> {
  const deadline = Date.now() + 3000;
  const wait = async (): Promise<void> => {
    if (status().includes("unavailable") || Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return wait();
  };
  await wait();
}

beforeEach(() => {
  window = new Window({ url: "https://brain.test/" });
  idle = [];
  Object.assign(window, {
    requestIdleCallback: (run: () => void): void => {
      idle.push(run);
    },
  });
  restoreGlobals = installGlobals({ window, document: window.document });
});

afterEach(async () => {
  await window.happyDOM.abort();
  window.close();
  restoreGlobals();
});

describe("shared Ask box loader", () => {
  async function load(
    fetch: () => Promise<Response>,
  ): Promise<string | undefined> {
    Object.assign(window, { fetch });
    eval(ASK_BOX_LOADER_SCRIPT);
    const deadline = Date.now() + 1000;
    const wait = async (): Promise<string | undefined> => {
      const script = window.document.head.querySelector(
        'script[src^="/ask/assets/boot.js"]',
      );
      if (script || Date.now() > deadline)
        return script?.getAttribute("src") ?? undefined;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return wait();
    };
    return wait();
  }

  it("loads the boot at the version the server says is current", async () => {
    expect(await load(async () => Response.json({ version: "abc123" }))).toBe(
      "/ask/assets/boot.js?v=abc123",
    );
  });

  it("still loads the boot when the version cannot be read", async () => {
    expect(
      await load(async () => new Response("unavailable", { status: 503 })),
    ).toBe("/ask/assets/boot.js");
  });
});

describe("shared Ask box boot", () => {
  it("enables the host's controls and loads nothing until the visitor engages", () => {
    boot();
    expect(input().hasAttribute("disabled")).toBe(false);
    expect(element(`[${ASK_SEND_ATTRIBUTE}]`).hasAttribute("disabled")).toBe(
      false,
    );
    expect(guestStylesheet()).toBe(false);
    expect(status()).toBe("");
    // Hosts may keep the box out of sight until it is live.
    expect(
      element(`[${ASK_BOX_ATTRIBUTE}]`).hasAttribute(ASK_READY_ATTRIBUTE),
    ).toBe(true);
  });

  it("fetches the chat's styles and code once the page is idle, so engaging opens it at once, but mounts nothing", () => {
    // Tests cannot load it, so record the request rather than the result.
    const requested: string[] = [];
    const head = window.document.head;
    const append = head.append.bind(head);
    Object.assign(head, {
      append: (...nodes: Parameters<typeof head.append>): void => {
        for (const node of nodes)
          if (node instanceof window.HTMLLinkElement)
            requested.push(node.getAttribute("href") ?? "");
        append(...nodes);
      },
    });
    boot();
    expect(requested).toEqual([]);
    pageIdle();
    expect(requested).toContain("/ask/assets/guest.css?v=v1");
    expect(
      window.document.head.querySelector(
        'link[rel="modulepreload"][href="/ask/assets/guest.js?v=v1"]',
      ),
    ).not.toBe(null);
    expect(status()).toBe("");
    expect(Reflect.get(input(), "readOnly")).toBe(false);
  });

  it("fetches the styles once, however often the visitor engages", () => {
    boot();
    input().dispatchEvent(new window.FocusEvent("focus"));
    pageIdle();
    expect(
      window.document.head.querySelectorAll(
        'link[href="/ask/assets/guest.css?v=v1"]',
      ).length,
    ).toBeLessThanOrEqual(1);
  });

  it("starts connecting on focus without sending", () => {
    boot();
    input().dispatchEvent(new window.FocusEvent("focus"));
    expect(guestStylesheet()).toBe(true);
    expect(status()).toContain("Connecting");
    expect(input().hasAttribute("readonly")).toBe(false);
  });

  it("asks to send on Enter only when there is a draft", () => {
    boot();
    const enter = (): void => {
      input().dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    enter();
    expect(input().hasAttribute("readonly")).toBe(false);
    Object.assign(input(), { value: "What do you work on?" });
    enter();
    expect(input().hasAttribute("readonly")).toBe(true);
  });

  it("keeps the draft and says chat is unavailable when the box cannot load", async () => {
    boot();
    Object.assign(input(), { value: "What do you work on?" });
    element(`[${ASK_SEND_ATTRIBUTE}]`).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    await settled();
    expect(status()).toContain("unavailable");
    expect(status()).toContain("no question has been sent");
    expect(Reflect.get(input(), "value")).toBe("What do you work on?");
    expect(input().hasAttribute("readonly")).toBe(false);
  });

  it("opens the box full screen on a narrow screen as the visitor engages, and closes it again if chat cannot load", async () => {
    window.happyDOM.setViewport({ width: 390, height: 844 });
    boot();
    const box = element(`[${ASK_BOX_ATTRIBUTE}]`);
    input().dispatchEvent(new window.FocusEvent("focus"));
    expect(box.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(true);
    await settled();
    expect(status()).toContain("unavailable");
    expect(box.hasAttribute(ASK_SHEET_ATTRIBUTE)).toBe(false);
  });

  it("holds the page still from the first tap on a narrow screen, and lets it go if chat cannot load", async () => {
    window.happyDOM.setViewport({ width: 390, height: 844 });
    boot();
    window.scrollTo(0, 300);
    input().dispatchEvent(new window.FocusEvent("focus"));
    expect(
      window.document.documentElement.getAttribute(ASK_PAGE_LOCK_ATTRIBUTE),
    ).toBe("300");
    expect(window.document.body.style.position).toBe("fixed");
    expect(window.document.body.style.top).toBe("-300px");
    await settled();
    expect(
      window.document.documentElement.hasAttribute(ASK_PAGE_LOCK_ATTRIBUTE),
    ).toBe(false);
    expect(window.document.body.style.position).toBe("");
    expect(window.scrollY).toBe(300);
  });

  it("holds the page where it was when the finger landed, before the browser scrolled to the field", () => {
    window.happyDOM.setViewport({ width: 390, height: 844 });
    boot();
    window.scrollTo(0, 0);
    input().dispatchEvent(new window.Event("touchstart", { bubbles: true }));
    // Safari scrolls the tapped field into view before it takes focus.
    window.scrollTo(0, 392);
    input().dispatchEvent(new window.FocusEvent("focus"));
    expect(
      window.document.documentElement.getAttribute(ASK_PAGE_LOCK_ATTRIBUTE),
    ).toBe("0");
  });

  it("keeps the box in the page on a wide screen", () => {
    window.happyDOM.setViewport({ width: 1280, height: 900 });
    boot();
    input().dispatchEvent(new window.FocusEvent("focus"));
    expect(
      element(`[${ASK_BOX_ATTRIBUTE}]`).hasAttribute(ASK_SHEET_ATTRIBUTE),
    ).toBe(false);
  });

  it("returns a page reloaded with the sheet open to where it was, with no extra step back", async () => {
    window.history.pushState({ [ASK_SHEET_HISTORY_KEY]: { y: 300 } }, "");
    const entries = window.history.length;
    boot();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.history.state).toBe(null);
    expect(window.history.length).toBe(entries);
    expect(window.scrollY).toBe(300);
  });

  it("leaves a page on its own history entry alone", async () => {
    window.history.replaceState({ other: true }, "");
    boot();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.history.state).toEqual({ other: true });
  });

  it("leaves a host without its contract untouched", () => {
    boot(`<div ${ASK_BOX_ATTRIBUTE}><textarea disabled></textarea></div>`);
    expect(input().hasAttribute("disabled")).toBe(true);
    expect(
      element(`[${ASK_BOX_ATTRIBUTE}]`).hasAttribute(ASK_READY_ATTRIBUTE),
    ).toBe(false);
  });
});
