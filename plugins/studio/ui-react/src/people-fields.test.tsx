/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "./entity-fields";
import { MembersField } from "./people-fields";

let windowInstance: Window;
let restoreGlobals: RestoreGlobals;
let root: Root;
let values: unknown;

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

test("a people field shows names, not ids or JSON", async () => {
  await act(async () =>
    root.render(
      <Field
        descriptor={{
          name: "requestedBy",
          label: "Requested By",
          widget: "people",
          required: false,
        }}
        value={[{ name: "Rizom Core Team", id: "user:usr_EUrBPDVA4fFk" }]}
        onChange={() => {}}
      />,
    ),
  );

  const text = document.body.textContent;
  expect(text).toContain("Requested By");
  expect(text).toContain("Rizom Core Team");
  expect(text).not.toContain("usr_EUrBPDVA4fFk");
  expect(text).not.toContain("{");
  expect(document.querySelector("textarea")).toBeNull();
});

function Assignees(): ReactElement {
  const [value, setValue] = useState<unknown>([
    { name: "Sam Rivera", id: "user:usr_sam" },
    { name: "Mira Okafor" },
  ]);
  values = value;
  return (
    <MembersField
      label="Assigned To"
      members={[
        { id: "usr_alex", name: "Alex Morgan" },
        { id: "usr_sam", name: "Sam Rivera" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

test("a members field adds a member by id and removes an assignee", async () => {
  await act(async () => root.render(<Assignees />));

  const text = document.body.textContent;
  expect(text).toContain("Sam Rivera");
  expect(text).toContain("Mira Okafor");
  expect(text).not.toContain("usr_sam");
  const select = document.querySelector("select");
  if (!select) throw new Error("Missing member choice");
  // Only members not yet assigned are offered.
  expect(
    Array.from(select.options).map((option) => option.textContent),
  ).toEqual(["Add a member", "Alex Morgan"]);

  await act(async () => {
    select.value = "usr_alex";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(values).toEqual([
    { name: "Sam Rivera", id: "user:usr_sam" },
    { name: "Mira Okafor" },
    { name: "Alex Morgan", id: "user:usr_alex" },
  ]);

  const remove = document.querySelector<HTMLButtonElement>(
    '[aria-label="Remove Sam Rivera"]',
  );
  if (!remove) throw new Error("Missing removal for Sam Rivera");
  await act(async () => remove.click());
  expect(values).toEqual([
    { name: "Mira Okafor" },
    { name: "Alex Morgan", id: "user:usr_alex" },
  ]);
});

test("a provenance field shows a fact read-only, and nothing when empty", async () => {
  await act(async () =>
    root.render(
      <>
        <Field
          descriptor={{ name: "origin", label: "Origin", widget: "provenance" }}
          value="board"
          onChange={() => {}}
        />
        <Field
          descriptor={{
            name: "sourceRef",
            label: "Source Ref",
            widget: "provenance",
          }}
          value={{
            sourceId: "contact-requests",
            entityType: "contact-request",
            entityId: "req-1",
          }}
          onChange={() => {}}
        />
        <Field
          descriptor={{
            name: "channelName",
            label: "Channel Name",
            widget: "provenance",
          }}
          value={undefined}
          onChange={() => {}}
        />
      </>,
    ),
  );

  const text = document.body.textContent;
  expect(text).toContain("Board");
  expect(text).toContain("contact-request · req-1");
  expect(text).not.toContain("Channel Name");
  expect(text).not.toContain("null");
  expect(document.querySelector("input, select, textarea")).toBeNull();
});
