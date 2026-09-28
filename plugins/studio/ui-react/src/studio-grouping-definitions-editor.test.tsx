/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  StudioGroupingDefinitionsEditor,
  type GroupingDefinitionEditorState,
} from "./studio-grouping-definitions-editor";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
let value: unknown;
let changes: number;
let status: GroupingDefinitionEditorState;
const initial = {
  clients: {
    label: "Clients",
    multiple: false,
    values: ["Acme", " Beta, Inc. "],
  },
};
beforeEach(() => {
  changes = 0;
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    MutationObserver: windowInstance.MutationObserver,
    CustomEvent: windowInstance.CustomEvent,
    NodeFilter: windowInstance.NodeFilter,
    HTMLInputElement: windowInstance.HTMLInputElement,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});
function Fixture({
  source = initial,
  readOnly = false,
  savedKeys = ["clients"],
}: {
  source?: unknown;
  readOnly?: boolean;
  savedKeys?: string[];
}): ReactElement {
  const [draft, setDraft] = useState(source);
  const [state, setState] = useState<GroupingDefinitionEditorState>({
    issues: [],
    pendingChanges: false,
  });
  value = draft;
  status = state;
  return (
    <StudioGroupingDefinitionsEditor
      value={draft}
      savedKeys={savedKeys}
      readOnly={readOnly}
      contributorTypes={[
        { entityType: "note", label: "Notes" },
        { entityType: "post", label: "Posts" },
      ]}
      usage={{
        clients: {
          entries: 20,
          values: [
            { value: "Acme", count: 12 },
            { value: " Beta, Inc. ", count: 8 },
          ],
        },
      }}
      onChange={(next): void => {
        changes += 1;
        setDraft(next);
      }}
      onStateChange={setState}
    />
  );
}
function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
async function input(label: string, text: string): Promise<void> {
  const node = element<HTMLInputElement>(`input[aria-label="${label}"]`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      windowInstance.HTMLInputElement.prototype,
      "value",
    )?.set?.call(node, text);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string): Promise<void> {
  const scope = document.querySelector('[role="alertdialog"]') ?? document;
  const button = [...scope.querySelectorAll("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
test("first visit does not publish an empty document or mark it pending", async () => {
  await act(async () => root.render(<Fixture source={{}} savedKeys={[]} />));
  expect(value).toEqual({});
  expect(changes).toBe(0);
  expect(status.pendingChanges).toBe(false);
  expect(status.issues).toEqual([]);
  expect(document.body.textContent).toContain("Your first grouping");
  await click("Add grouping");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "New grouping label",
  );
  expect(value).toEqual({ "": { label: "", multiple: true } });
  expect(status.issues.length).toBeGreaterThan(0);
});
test("new section keys keep input focus while renaming and existing keys stay fixed", async () => {
  await act(async () => root.render(<Fixture />));
  expect(
    element<HTMLInputElement>('input[aria-label="Clients key"]').readOnly,
  ).toBe(true);
  await click("Add grouping");
  const key = element<HTMLInputElement>('input[aria-label="New grouping key"]');
  key.focus();
  await input("New grouping key", "topics");
  expect(document.activeElement).toBe(key);
  await input("New grouping label", "Topics");
  expect(value).toMatchObject({
    topics: { label: "Topics", multiple: true },
  });
  expect(
    element<HTMLDetailsElement>('section[aria-label="Topics"] details').open,
  ).toBe(false);
  expect(
    [...document.querySelectorAll("legend")].map((node) => node.textContent),
  ).not.toContain("Applies to");
  expect(status.issues).toEqual([]);
});
test("exclusions are collapsed by default and only explicit choices narrow the grouping", async () => {
  await act(async () => root.render(<Fixture />));
  const details = element<HTMLDetailsElement>("details");
  expect(details.open).toBe(false);
  expect(changes).toBe(0);
  await act(async () => details.querySelector("summary")?.click());
  expect(details.open).toBe(true);
  const post = element<HTMLInputElement>('input[aria-label="Exclude Posts"]');
  expect(post.checked).toBe(false);
  await act(async () => post.click());
  expect(value).toEqual({
    clients: { ...initial.clients, excludeTypes: ["post"] },
  });
  expect(status.issues).toEqual([]);
  await act(async () => post.click());
  expect(value).toEqual(initial);
});
test("duplicate key input cannot overwrite another definition or disappear", async () => {
  await act(async () => root.render(<Fixture />));
  await click("Add grouping");
  await input("New grouping key", "clients");
  expect(value).toMatchObject(initial);
  expect(document.querySelectorAll('input[value="clients"]')).toHaveLength(2);
  expect(status.pendingChanges).toBe(true);
  expect(
    status.issues.some((issue) => issue.message.includes("already used")),
  ).toBe(true);
  await input("New grouping key", "topics");
  expect(value).toMatchObject(initial);
  expect(status.pendingChanges).toBe(false);
});
test("cardinality is independent of list policy, and reopening removes only values", async () => {
  await act(async () => root.render(<Fixture />));
  expect(
    document.querySelectorAll('[data-studio-field="grouping-membership"] em'),
  ).toHaveLength(0);
  const select = element<HTMLSelectElement>(
    'select[aria-label="Clients values per entry"]',
  );
  await act(async () => {
    select.value = "several";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const open = element<HTMLInputElement>(
    'input[aria-label="Clients: any value"]',
  );
  await act(async () => open.click());
  expect(value).toEqual({
    clients: { label: "Clients", multiple: true },
  });
  const closed = element<HTMLInputElement>(
    'input[aria-label="Clients: only these values"]',
  );
  await act(async () => closed.click());
  expect(value).toMatchObject({ clients: { multiple: true, values: [] } });
  expect(status.issues.some((issue) => issue.path.includes("values"))).toBe(
    true,
  );
});
test("removal is confirmed with entry count and never rewrites any membership", async () => {
  await act(async () => root.render(<Fixture />));
  await click("Remove Clients grouping");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "20 entries",
  );
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "keep their values",
  );
  expect(value).toEqual(initial);
  await click("Keep grouping");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Remove Clients grouping",
  );
  expect(value).toEqual(initial);
  await click("Remove Clients grouping");
  await click("Remove grouping");
  expect(value).toEqual({});
});
test("unavailable exclusions remain visible and removable rather than being silently filtered", async () => {
  const source = {
    clients: { ...initial.clients, excludeTypes: ["missing"] },
  };
  await act(async () => root.render(<Fixture source={source} />));
  expect(value).toEqual(source);
  expect(status.issues).toEqual([]);
  const details = element<HTMLDetailsElement>("details");
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toContain(
    "Exclude types (1)",
  );
  await act(async () => details.querySelector("summary")?.click());
  const missing = element<HTMLInputElement>(
    'input[aria-label="Exclude missing (unavailable)"]',
  );
  expect(missing.checked).toBe(true);
  await act(async () => missing.click());
  expect(value).toMatchObject(initial);
  expect(status.issues).toEqual([]);
});
test("trusted readers see definitions and usage but no editing controls", async () => {
  await act(async () => root.render(<Fixture readOnly />));
  expect(
    document.querySelectorAll("button,input,select,textarea"),
  ).toHaveLength(0);
  expect(document.body.textContent).toContain("·Beta, Inc.·");
  expect(document.body.textContent).toContain("Only these values");
  expect(document.body.textContent).toContain("12");
});
test("prototype-shaped keys do not inherit usage from Object.prototype", async () => {
  const source = {
    constructor: { label: "Constructors", multiple: true },
  };
  await act(async () =>
    root.render(<Fixture source={source} savedKeys={["constructor"]} />),
  );
  expect(value).toEqual(source);
  await click("Remove Constructors grouping");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Usage is unavailable",
  );
});

test("malformed top-level source is retained until an explicit confirmed reset", async () => {
  await act(async () => root.render(<Fixture source={null} />));
  expect(value).toBeNull();
  expect(status.issues.length).toBeGreaterThan(0);
  await click("Replace invalid definitions");
  expect(value).toBeNull();
  await click("Replace definitions");
  expect(value).toEqual({});
  expect(status.issues).toEqual([]);
});
