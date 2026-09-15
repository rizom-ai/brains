/** @jsxImportSource react */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioCollectionControls } from "./studio-collection-controls";
import {
  studioCollectionQuerySchema,
  type StudioCollectionQuery,
} from "../../src/collection-query";

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    HTMLInputElement: windowInstance.HTMLInputElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

async function mount(
  query: Record<string, unknown>,
  onChange: (next: StudioCollectionQuery) => void,
): Promise<void> {
  await act(async () =>
    root.render(
      createElement(StudioCollectionControls, {
        query: studioCollectionQuerySchema.parse(query),
        fields: [],
        total: 3,
        onChange,
      }),
    ),
  );
}

it("applies a query without a control to press", async () => {
  await mount({ q: "rhizome" }, () => {});
  // Live search: the field is the only control, and it reports what it found.
  const buttons = [...document.querySelectorAll("button")].map((button) =>
    button.textContent.trim(),
  );
  expect(buttons).not.toContain("Search");
  expect(document.querySelector('[aria-label="Search scope"]')).toBeNull();
  expect(document.body.textContent).toContain("3 matches");
});

it("commits a filter from the settled query, never a half-typed one", async () => {
  const committed: StudioCollectionQuery[] = [];
  await mount({ q: "settled" }, (next) => committed.push(next));
  const select = document.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("Visibility filter missing");
  await act(async () => {
    select.value = "restricted";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(committed).toHaveLength(1);
  expect(committed[0]).toMatchObject({
    visibility: "restricted",
    q: "settled",
    offset: 0,
  });
});

it("keeps the selected folder when clearing filters and exposes the search scope", async () => {
  const committed: StudioCollectionQuery[] = [];
  await mount({ prefix: ["book-1"], scope: "folder", q: "shared" }, (next) =>
    committed.push(next),
  );
  const whole = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Whole collection",
  );
  expect(whole).toBeDefined();
  await act(async () => whole?.click());
  expect(committed[0]).toMatchObject({
    prefix: ["book-1"],
    scope: "collection",
    q: "shared",
    offset: 0,
  });
  const clear = document.querySelector<HTMLButtonElement>(
    '[aria-label="Clear search and filters"]',
  );
  await act(async () => clear?.click());
  expect(committed[1]).toMatchObject({
    prefix: ["book-1"],
    scope: "folder",
    q: "",
    offset: 0,
  });
});

it("offers one way back out of a filtered collection", async () => {
  await mount({ q: "rhizome" }, () => {});
  const clear = [...document.querySelectorAll("button")].find(
    (button) =>
      button.getAttribute("aria-label") === "Clear search and filters",
  );
  expect(clear).toBeDefined();
  expect(clear?.textContent).toBe("Clear");
});
