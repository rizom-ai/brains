/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "./entity-fields";
import { StudioSystemFields } from "./studio-system-fields";
import type { FieldDescriptor } from "./api";

let windowInstance: Window;
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
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    KeyboardEvent: windowInstance.KeyboardEvent,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});
function Fixture({
  literal = true,
  system = false,
}: {
  literal?: boolean;
  system?: boolean;
}): ReactElement {
  const [value, setValue] = useState<unknown>(["Acme"]);
  values = value;
  return system ? (
    <StudioSystemFields
      fields={[descriptor]}
      draft={{ clients: value }}
      title="Properties"
      readOnly={false}
      literalFields={["clients"]}
      onChange={(_field, next) => setValue(next)}
    />
  ) : (
    <Field
      descriptor={descriptor}
      value={value}
      literalList={literal}
      onChange={setValue}
    />
  );
}
async function input(text: string): Promise<HTMLInputElement> {
  const node = document.querySelector("input");
  if (!node) throw Error("Missing list input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      windowInstance.HTMLInputElement.prototype,
      "value",
    )?.set?.call(node, text);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return node;
}
async function key(
  node: HTMLInputElement,
  key: string,
  isComposing = false,
): Promise<boolean> {
  const event = new KeyboardEvent("keydown", {
    key,
    isComposing,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    node.dispatchEvent(event);
  });
  return event.defaultPrevented;
}
for (const system of [false, true])
  test(`grouping inputs preserve commas and surrounding spaces (${system ? "system" : "ordinary"})`, async () => {
    await act(async () => root.render(<Fixture system={system} />));
    const node = await input(" Acme, Inc. ");
    expect(await key(node, ",")).toBe(false);
    expect(values).toEqual(["Acme"]);
    expect(document.body.textContent).toContain(
      "Surrounding whitespace is preserved",
    );
    expect(node.getAttribute("aria-describedby")).toBeTruthy();
    await key(node, "Enter", true);
    expect(values).toEqual(["Acme"]);
    await key(node, "Enter");
    expect(values).toEqual(["Acme", " Acme, Inc. "]);
    expect(document.body.textContent).toContain(
      '"\\u0020Acme,\\u0020Inc.\\u0020"',
    );
    await input("Acme, Inc.");
    const add = document.querySelector<HTMLButtonElement>(
      '[aria-label="Add value"]',
    );
    if (!add) throw Error("Missing explicit Add action");
    await act(async () => add.click());
    expect(values).toEqual(["Acme", " Acme, Inc. ", "Acme, Inc."]);
    const remove = document.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Acme, Inc."]',
    );
    if (!remove) throw Error("Missing exact removal action");
    await act(async () => remove.click());
    expect(values).toEqual(["Acme", " Acme, Inc. "]);
    await input(" Acme, Inc. ");
    await key(node, "Enter");
    expect(values).toEqual(["Acme", " Acme, Inc. "]);
    await input("  ");
    await key(node, "Enter");
    expect(values).toEqual(["Acme", " Acme, Inc. ", "  "]);
    await key(node, "Enter");
    expect(values).toEqual(["Acme", " Acme, Inc. ", "  "]);
  });
test("read-only system grouping values retain visible empty/whitespace boundaries", async () => {
  await act(async () =>
    root.render(
      <StudioSystemFields
        fields={[descriptor]}
        draft={{ clients: ["", " Acme "] }}
        title="Properties"
        readOnly
        literalFields={["clients"]}
        onChange={() => {}}
      />,
    ),
  );
  expect(
    [...document.querySelectorAll("li")].map((node) => node.textContent),
  ).toEqual(['""', '"\\u0020Acme\\u0020"']);
});
test("literal Add control stays stationary when the input loses focus", async () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(
    new URL("../../dist/ui/studio-app.css", import.meta.url),
    "utf8",
  );
  document.head.append(style);
  await act(async () => root.render(<Fixture />));
  const node = await input("Acme, Inc.");
  expect(getComputedStyle(node).width).toBe("12ch");
  node.focus();
  expect(getComputedStyle(node).width).toBe("12ch");
  node.blur();
  expect(getComputedStyle(node).width).toBe("12ch");
});
test("ordinary tag inputs retain trimming and comma submission", async () => {
  await act(async () => root.render(<Fixture literal={false} />));
  const node = await input(" Beta ");
  expect(await key(node, ",")).toBe(true);
  expect(values).toEqual(["Acme", "Beta"]);
  expect(document.body.textContent).not.toContain("Surrounding whitespace");
});
