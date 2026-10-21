/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "./entity-fields";

let windowInstance: Window;
let restoreGlobals: RestoreGlobals;
let root: Root;

beforeEach(() => {
  windowInstance = new Window();
  restoreGlobals = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    KeyboardEvent: windowInstance.KeyboardEvent,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  });
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

test("a structured field reads as content, not as JSON", async () => {
  await act(async () =>
    root.render(
      <>
        <Field
          descriptor={{
            name: "sources",
            label: "Sources",
            widget: "list",
            fields: [
              { name: "title", label: "Title", widget: "string" },
              { name: "url", label: "Url", widget: "string" },
            ],
          }}
          value={[{ title: "Field notes", url: "https://example.com/notes" }]}
          onChange={() => {}}
        />
        <Field
          descriptor={{
            name: "author",
            label: "Author",
            widget: "object",
            fields: [{ name: "name", label: "Name", widget: "string" }],
          }}
          value={null}
          onChange={() => {}}
        />
      </>,
    ),
  );

  const text = document.body.textContent;
  expect(document.querySelector("textarea")).toBeNull();
  expect(text).not.toContain("{");
  expect(text).not.toContain("null");
  expect(text).toContain("Field notes");
  expect(text).toContain("https://example.com/notes");
  expect(text).toContain("Not set");
});
