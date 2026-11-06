/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { StudioMarkdown } from "./studio-markdown";

let window: Window;
let restore: RestoreGlobals;
let root: Root;
let errors: unknown[][];
const originalError = console.error;
beforeEach(() => {
  window = new Window();
  restore = installDomGlobals(window, {
    Event: window.Event,
    MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent,
    NodeFilter: window.NodeFilter,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  errors = [];
  console.error = (...args: unknown[]): void => {
    errors.push(args);
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  await window.happyDOM.abort();
  window.close();
  restore();
  console.error = originalError;
});

/** Record what the page asks the browser to open. */
function captureOpens(): unknown[][] {
  const opened: unknown[][] = [];
  Object.assign(window, {
    open: (...args: unknown[]): null => {
      opened.push(args);
      return null;
    },
  });
  return opened;
}

async function render(
  presentation: "document" | "chat" | "assist",
  source: string,
): Promise<void> {
  await act(async () =>
    root.render(
      <StudioMarkdown presentation={presentation}>{source}</StudioMarkdown>,
    ),
  );
}

test.each(["document", "chat", "assist"] as const)(
  "%s links are native anchors inside their paragraph",
  async (presentation) => {
    await render(presentation, "Read [the docs](https://example.com) now.");
    const link = document.querySelector<HTMLAnchorElement>(
      '[data-streamdown="link"]',
    );
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("https://example.com/");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.closest("p")?.textContent).toBe("Read the docs now.");
    expect(document.querySelector("p button, p div")).toBeNull();
  },
);

test("following a link asks first in a dialog outside the prose", async () => {
  const opened = captureOpens();
  await render("chat", "See [the docs](https://example.com/guide).");
  const link = document.querySelector<HTMLAnchorElement>(
    '[data-streamdown="link"]',
  );
  await act(async () => link?.click());

  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain("https://example.com/guide");
  expect(dialog?.closest("p")).toBeNull();
  expect(opened).toHaveLength(0);

  const open = [...(dialog?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent === "Open link",
  );
  await act(async () => open?.click());
  expect(opened).toEqual([
    ["https://example.com/guide", "_blank", "noopener,noreferrer"],
  ]);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(errors).toEqual([]);
});

test("cancelling keeps the reader on the page", async () => {
  const opened = captureOpens();
  await render("document", "See [the docs](https://example.com/guide).");
  await act(async () =>
    document
      .querySelector<HTMLAnchorElement>('[data-streamdown="link"]')
      ?.click(),
  );
  const cancel = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((button) => button.textContent === "Stay here");
  await act(async () => cancel?.click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(opened).toHaveLength(0);
});
