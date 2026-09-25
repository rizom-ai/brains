import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window, type HTMLElement as HappyDOMHTMLElement } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_STATUS_ATTRIBUTE,
} from "@brains/contracts";
import { ASK_BOX_BOOT_SCRIPT } from "../src/ask-box-boot";

let window: Window;
let restoreGlobals: RestoreGlobals;

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
  window.document.head.querySelector('link[href="/ask/assets/guest.css"]') !==
  null;

function boot(markup = host): void {
  window.document.body.innerHTML = markup;
  eval(ASK_BOX_BOOT_SCRIPT);
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
  restoreGlobals = installGlobals({ window, document: window.document });
});

afterEach(() => {
  window.close();
  restoreGlobals();
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
    expect(guestStylesheet()).toBe(false);
  });

  it("leaves a host without its contract untouched", () => {
    boot(`<div ${ASK_BOX_ATTRIBUTE}><textarea disabled></textarea></div>`);
    expect(input().hasAttribute("disabled")).toBe(true);
  });
});
