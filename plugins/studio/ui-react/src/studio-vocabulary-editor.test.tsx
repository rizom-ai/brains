/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioVocabularyEditor } from "./studio-vocabulary-editor";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
let value: unknown;
const groupings = [
  { key: "clients", label: "Clients", field: "clients", types: ["note"] },
  { key: "projects", label: "Projects", field: "projects", types: ["note"] },
];
beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance);
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});
function Fixture({ readOnly = false }: { readOnly?: boolean }): ReactElement {
  const [draft, setDraft] = useState<unknown>({
    clients: { multiple: false, values: ["Acme", " Beta, Inc. "] },
  });
  value = draft;
  return (
    <StudioVocabularyEditor
      groupings={groupings}
      value={draft}
      readOnly={readOnly}
      onChange={setDraft}
    />
  );
}
async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent === label ||
      button.getAttribute("aria-label") === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
test("admin edits cardinality, defines a list, and removes an entry to reopen it", async () => {
  await act(async () => root.render(<Fixture />));
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!checkbox) throw new Error("Missing cardinality checkbox");
  await act(async () => checkbox.click());
  expect(value).toMatchObject({
    clients: { multiple: true, values: ["Acme", " Beta, Inc. "] },
  });
  await click("Define allowed values for Projects");
  expect(value).toMatchObject({ projects: { multiple: true, values: [] } });
  await click("Remove Clients list");
  expect(value).toEqual({ projects: { multiple: true, values: [] } });
});
test("trusted reader sees exact lists and cardinality without editing controls", async () => {
  await act(async () => root.render(<Fixture readOnly />));
  expect(
    document.querySelectorAll("button,input,select,textarea"),
  ).toHaveLength(0);
  expect(document.body.textContent).toContain("Acme");
  expect(document.body.textContent).toContain("Beta, Inc.");
  expect(document.body.textContent).toContain("At most one value");
  expect(document.body.textContent).toContain("Open");
});
