/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GroupingMembershipField } from "./grouping-membership-field";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
let current: unknown;
const choices = ["Acme", " Beta, Inc. ", "Ka21"];
beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    KeyboardEvent: windowInstance.KeyboardEvent,
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
  multiple = true,
  closed = false,
  initial = ["Acme"],
  readOnly = false,
  errorId,
}: {
  multiple?: boolean;
  closed?: boolean;
  initial?: unknown;
  readOnly?: boolean;
  errorId?: string;
}): ReactElement {
  const [value, setValue] = useState(initial);
  current = value;
  return (
    <form>
      <GroupingMembershipField
        label="Clients"
        definition={{ multiple, ...(closed ? { values: choices } : {}) }}
        value={value}
        onChange={setValue}
        suggestions={["Acme", " Beta, Inc. "]}
        readOnly={readOnly}
        errorId={errorId}
        assist={<button type="button">Suggest clients</button>}
      />
    </form>
  );
}
function element<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
async function choose(index: string): Promise<void> {
  const select = element<HTMLSelectElement>("select");
  await act(async () => {
    select.value = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function type(text: string): Promise<void> {
  const input = element<HTMLInputElement>('input[type="text"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      windowInstance.HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
test("missing usage is unavailable, not a fabricated zero", async () => {
  await act(async () =>
    root.render(
      <GroupingMembershipField
        label="Allowed values"
        purpose="allowed-values"
        definition={{ multiple: true }}
        value={["Known unused", "Not queried"]}
        counts={new Map([["Known unused", 0]])}
        onChange={() => {}}
      />,
    ),
  );
  expect(document.querySelectorAll('[aria-label="0 entries"]')).toHaveLength(1);
  expect(
    document.querySelectorAll('[aria-label="Usage unavailable"]'),
  ).toHaveLength(1);
});

test.each([true, false])(
  "closed lists share the chip frame and state cardinality (%s)",
  async (multiple) => {
    await act(async () => root.render(<Fixture closed multiple={multiple} />));
    expect(
      element('[data-studio-field="grouping-membership"] em').textContent,
    ).toBe(multiple ? "several" : "one");
    expect(document.querySelectorAll("[data-grouping-member]")).toHaveLength(1);
    expect(
      document.querySelectorAll('input[type="checkbox"],input[type="text"]'),
    ).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Suggest clients");
    expect(
      [...document.querySelectorAll("option")].map((node) => node.textContent),
    ).not.toContain("Acme");
    await choose("1");
    expect(current).toEqual(
      multiple ? ["Acme", " Beta, Inc. "] : [" Beta, Inc. "],
    );
    expect(element<HTMLSelectElement>("select").value).toBe("");
  },
);
test("a stray is named once and stays until an explicit removal", async () => {
  await act(async () =>
    root.render(<Fixture closed initial={["Former partner"]} />),
  );
  expect(document.body.textContent.split("Former partner")).toHaveLength(2);
  expect(document.body.textContent).toContain("not in list");
  await choose("0");
  expect(current).toEqual(["Former partner", "Acme"]);
  await click("Remove Former partner");
  expect(current).toEqual(["Acme"]);
});
test.each([true, false])(
  "open lists add or replace exact literal values (%s)",
  async (multiple) => {
    await act(async () => root.render(<Fixture multiple={multiple} />));
    expect(document.body.textContent).toContain("Suggest clients");
    await type(" Beta, Inc. ");
    await click(multiple ? "Add value" : "Replace value");
    expect(current).toEqual(
      multiple ? ["Acme", " Beta, Inc. "] : [" Beta, Inc. "],
    );
    expect(element<HTMLInputElement>('input[type="text"]').value).toBe("");
  },
);
test("catalog suggestions use the same single-value replacement rule", async () => {
  await act(async () => root.render(<Fixture multiple={false} />));
  await click("Choose ·Beta, Inc.·");
  expect(current).toEqual([" Beta, Inc. "]);
});
test("Enter commits one exact value; comma and composing Enter do not", async () => {
  await act(async () => root.render(<Fixture initial={[]} />));
  await type("a,b");
  const input = element<HTMLInputElement>('input[type="text"]');
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    );
  });
  expect(current).toEqual([]);
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(current).toEqual(["a,b"]);
});
test("rule changes and validation errors retain drafts, duplicates and pending input", async () => {
  await act(async () =>
    root.render(<Fixture initial={["Acme", "Acme", "Former partner"]} />),
  );
  await type("unfinished");
  await act(async () =>
    root.render(<Fixture multiple={false} errorId="save-error" />),
  );
  expect(current).toEqual(["Acme", "Acme", "Former partner"]);
  expect(element<HTMLInputElement>("input").value).toBe("unfinished");
  expect(element("input").getAttribute("aria-invalid")).toBe("true");
  expect(element("input").getAttribute("aria-describedby")).toContain(
    "save-error",
  );
  await click("Remove Acme");
  expect(current).toEqual(["Acme", "Former partner"]);
});
test("a read-only field exposes no edit or suggestion controls", async () => {
  await act(async () =>
    root.render(
      <Fixture closed readOnly initial={["Acme", "Former partner"]} />,
    ),
  );
  expect(document.querySelectorAll("button,input,select")).toHaveLength(0);
  expect(document.body.textContent).toContain("not in list");
});
test("malformed historical containers cannot be silently cleaned by this control", async () => {
  await act(async () => root.render(<Fixture initial={["Acme", 4]} />));
  expect(document.querySelectorAll("button,input,select")).toHaveLength(0);
  expect(document.body.textContent).toContain("Repair its source");
  expect(current).toEqual(["Acme", 4]);
});
