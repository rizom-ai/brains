/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GroupingDefinitionIssue } from "../../src/grouping-definitions-contract";
import type { GroupingDefinitionDraftRow } from "./grouping-definition-draft";
import {
  GroupingDefinitionRow,
  type GroupingDefinitionRowUpdate,
  type GroupingDefinitionUsage,
} from "./grouping-definition-row";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
let updates: GroupingDefinitionRowUpdate[];
let removals: HTMLButtonElement[];
const clients = {
  label: "Clients",
  multiple: false,
  values: ["Acme", "Beta"],
};
beforeEach(() => {
  updates = [];
  removals = [];
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
async function render({
  row = { id: 3, key: "clients", value: clients, savedKey: "clients" },
  readOnly = false,
  issues = [],
  systemTypes = [],
  usage,
}: {
  row?: GroupingDefinitionDraftRow;
  readOnly?: boolean;
  issues?: GroupingDefinitionIssue[];
  systemTypes?: string[];
  usage?: GroupingDefinitionUsage;
} = {}): Promise<void> {
  await act(async () =>
    root.render(
      <GroupingDefinitionRow
        row={row}
        usage={usage}
        contributorTypes={[
          { entityType: "note", label: "Notes" },
          { entityType: "post", label: "Posts" },
        ]}
        systemTypes={systemTypes}
        readOnly={readOnly}
        issues={issues}
        allowedValuesName="definitions-3-allowed"
        onUpdate={(update) => updates.push(update)}
        onRemove={(button) => removals.push(button)}
      />,
    ),
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

test("the section carries the focus anchor and its label", async () => {
  await render();
  const section = element<HTMLElement>('[data-definition-row="3"]');
  expect(section.tagName).toBe("SECTION");
  expect(section.getAttribute("aria-label")).toBe("Clients");
  expect(section.querySelector("h2")?.textContent).toBe("Clients");
});

test("removal hands the pressed button to the host", async () => {
  await render();
  const button = element<HTMLButtonElement>(
    'button[aria-label="Remove Clients grouping"]',
  );
  await act(async () => button.click());
  expect(removals).toEqual([button]);
  expect(updates).toEqual([]);
});

test("label edits report the whole definition with the new label", async () => {
  await render();
  await input("Clients label", "Customers");
  expect(updates).toEqual([{ value: { ...clients, label: "Customers" } }]);
});

test("saved keys are fixed while unsaved keys report renames", async () => {
  await render();
  const saved = element<HTMLInputElement>('input[aria-label="Clients key"]');
  expect(saved.readOnly).toBe(true);
  await input("Clients key", "renamed");
  expect(updates).toEqual([]);
  await render({
    row: { id: 3, key: "", value: { label: "", multiple: true } },
  });
  expect(document.body.textContent).toContain("Fixed when saved.");
  await input("New grouping key", "topics");
  expect(updates).toEqual([{ key: "topics" }]);
});

test("cardinality reports the chosen multiplicity", async () => {
  await render();
  const select = element<HTMLSelectElement>(
    'select[aria-label="Clients values per entry"]',
  );
  expect(select.value).toBe("one");
  await act(async () => {
    select.value = "several";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(updates).toEqual([{ value: { ...clients, multiple: true } }]);
});

test("exclusions add types and drop the field when the last one is cleared", async () => {
  await render();
  await act(async () =>
    element<HTMLInputElement>('input[aria-label="Exclude Posts"]').click(),
  );
  expect(updates).toEqual([{ value: { ...clients, excludeTypes: ["post"] } }]);
  updates = [];
  await render({
    row: {
      id: 3,
      key: "clients",
      value: { ...clients, excludeTypes: ["post"] },
      savedKey: "clients",
    },
  });
  await act(async () =>
    element<HTMLInputElement>('input[aria-label="Exclude Posts"]').click(),
  );
  expect(updates).toEqual([{ value: clients }]);
});

test("system exclusions stay hidden and unavailable ones stay removable", async () => {
  await render({
    row: {
      id: 3,
      key: "clients",
      value: { ...clients, excludeTypes: ["machine", "missing"] },
      savedKey: "clients",
    },
    systemTypes: ["machine"],
  });
  expect(document.body.textContent).not.toContain("machine");
  expect(element<HTMLElement>("summary").textContent).toBe("Exclude types (1)");
  const missing = element<HTMLInputElement>(
    'input[aria-label="Exclude missing (unavailable)"]',
  );
  expect(missing.checked).toBe(true);
  await act(async () => missing.click());
  expect(updates).toEqual([
    { value: { ...clients, excludeTypes: ["machine"] } },
  ]);
});

test("allowed-value radios share the host's group name and toggle only values", async () => {
  await render();
  const radios = [
    ...document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ];
  expect(radios.map((radio) => radio.name)).toEqual([
    "definitions-3-allowed",
    "definitions-3-allowed",
  ]);
  await act(async () =>
    element<HTMLInputElement>('input[aria-label="Clients: any value"]').click(),
  );
  expect(updates).toEqual([{ value: { label: "Clients", multiple: false } }]);
  updates = [];
  await render({
    row: {
      id: 3,
      key: "clients",
      value: { label: "Clients", multiple: false },
      savedKey: "clients",
    },
  });
  await act(async () =>
    element<HTMLInputElement>(
      'input[aria-label="Clients: only these values"]',
    ).click(),
  );
  expect(updates).toEqual([
    { value: { label: "Clients", multiple: false, values: [] } },
  ]);
});

test("allowed-values help reflects emptiness and usage availability", async () => {
  await render();
  expect(document.body.textContent).toContain(
    "Usage is unavailable until this grouping can be read.",
  );
  await render({
    usage: { entries: 2, values: [{ value: "Acme", count: 2 }] },
  });
  expect(document.body.textContent).toContain(
    "Numbers show current usage. Unused values remain available.",
  );
  await render({
    row: {
      id: 3,
      key: "clients",
      value: { ...clients, values: [] },
      savedKey: "clients",
    },
  });
  expect(document.body.textContent).toContain(
    "Add at least one allowed value, or choose Any value.",
  );
});

test("row issues are joined into one error status", async () => {
  await render({
    issues: [
      { path: ["groupings", "clients", "label"], message: "Too short" },
      { path: ["groupings", "clients"], message: "Host rejected" },
    ],
  });
  expect(document.body.textContent).toContain("Too short · Host rejected");
});

test("a non-mapping definition keeps its source visible and stays removable", async () => {
  await render({ row: { id: 3, key: "broken", value: "nope" } });
  expect(document.body.textContent).toContain(
    "This definition is not a mapping.",
  );
  expect(element<HTMLElement>("pre").textContent).toBe('"nope"');
  expect(document.querySelectorAll("input,select")).toHaveLength(0);
  expect(
    element<HTMLButtonElement>(
      'button[aria-label="Remove New grouping grouping"]',
    ),
  ).toBeTruthy();
});

test("read-only rows describe the definition without controls", async () => {
  await render({
    readOnly: true,
    row: {
      id: 3,
      key: "clients",
      value: { ...clients, excludeTypes: ["post", "missing"] },
      savedKey: "clients",
    },
  });
  expect(
    document.querySelectorAll("button,input,select,textarea"),
  ).toHaveLength(0);
  const text = document.body.textContent;
  expect(text).toContain("One");
  expect(text).toContain("Posts, missing (unavailable)");
  expect(text).toContain("Only these values");
  expect(element<HTMLElement>("code").textContent).toBe("clients");
});
