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
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(values).toEqual([" Beta, Inc. "]);
  await act(async () => {
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(values).toEqual([]);
});
test("closed multi choice retains stray memberships until explicitly removed", async () => {
  await act(async () => root.render(<Fixture multiple initial={["Gamma"]} />));
  expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  expect(document.body.textContent).toContain("not in list");
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!checkbox) throw new Error("Missing checkbox");
  await act(async () => checkbox.click());
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
