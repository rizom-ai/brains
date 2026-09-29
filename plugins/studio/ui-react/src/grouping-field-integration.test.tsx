/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "./entity-fields";
import type { FieldDescriptor } from "./api";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
let values: unknown;
const descriptor: FieldDescriptor = {
  name: "clients",
  label: "Clients",
  widget: "list",
  required: false,
  field: { name: "client", label: "Client", widget: "string" },
};
beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, { Event: windowInstance.Event });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});
function Fixture({
  multiple,
  initial = ["Acme"],
  refused = false,
}: {
  multiple: boolean;
  initial?: string[];
  refused?: boolean;
}): ReactElement {
  const [value, setValue] = useState<unknown>(initial);
  values = value;
  return (
    <form>
      <Field
        descriptor={descriptor}
        literalList
        vocabulary={{ multiple, values: ["Acme", " Beta, Inc. "] }}
        value={value}
        onChange={setValue}
        issues={
          refused
            ? [
                {
                  path: ["clients"],
                  message: "Clients: choose values from the configured list.",
                },
              ]
            : []
        }
      />
    </form>
  );
}
test("closed single choice uses a select, preserves exact values and clears to a list", async () => {
  await act(async () => root.render(<Fixture multiple={false} />));
  const select = document.querySelector("select");
  expect(select).not.toBeNull();
  if (!select) throw new Error("Missing select");
  expect(document.querySelector('input[type="text"]')).toBeNull();
  await act(async () => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(values).toEqual([" Beta, Inc. "]);
  const remove = document.querySelector<HTMLButtonElement>(
    "[data-grouping-member] button",
  );
  if (!remove) throw new Error("Missing explicit removal");
  await act(async () => remove.click());
  expect(values).toEqual([]);
});
test("closed multi choice retains stray memberships until explicitly removed", async () => {
  await act(async () => root.render(<Fixture multiple initial={["Gamma"]} />));
  const select = document.querySelector("select");
  if (!select) throw new Error("Missing choice control");
  expect([...select.options].filter((option) => !option.disabled)).toHaveLength(
    2,
  );
  expect(document.body.textContent).toContain("not in list");
  await act(async () => {
    select.value = "0";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(values).toEqual(["Gamma", "Acme"]);
  const remove = document.querySelector<HTMLButtonElement>(
    '[aria-label="Remove Gamma"]',
  );
  if (!remove) throw new Error("Missing explicit removal");
  await act(async () => remove.click());
  expect(values).toEqual(["Acme"]);
  expect(document.body.textContent).not.toContain("not in list");
});
test("cardinality changes and refused saves never rewrite the draft", async () => {
  await act(async () =>
    root.render(
      <Fixture multiple={false} initial={["Acme", "Gamma"]} refused />,
    ),
  );
  expect(values).toEqual(["Acme", "Gamma"]);
  expect(document.body.textContent).toContain("Acme");
  expect(document.body.textContent).toContain("Gamma");
  expect(document.body.textContent).toContain(
    "Clients: choose values from the configured list.",
  );
  expect(document.querySelector("select")?.getAttribute("aria-invalid")).toBe(
    "true",
  );
});
test("a single value no longer listed is named once, where it can be removed", async () => {
  await act(async () =>
    root.render(<Fixture multiple={false} initial={["Gamma"]} />),
  );
  const text = document.body.textContent;
  expect(text.split("Gamma")).toHaveLength(2);
  expect(document.querySelector('[aria-label="Remove Gamma"]')).not.toBeNull();
  expect(
    document.querySelector<HTMLOptionElement>('option[value=""]')?.textContent,
  ).toBe("Replace value…");
});
test.each([
  [false, "one"],
  [true, "several"],
] as const)(
  "cardinality is stated beside the label (multiple=%s)",
  async (multiple, marker) => {
    await act(async () => root.render(<Fixture multiple={multiple} />));
    const label = document.querySelector(
      '[data-studio-field="grouping-membership"] > div[id]',
    );
    expect(label?.textContent).toContain("Clients");
    expect(label?.textContent).toContain(marker);
    expect(document.body.textContent).not.toContain("Choose at most one value");
    expect(document.body.textContent).not.toContain("Choose any that apply");
  },
);
