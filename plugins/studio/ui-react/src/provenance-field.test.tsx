/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import * as stylex from "@stylexjs/stylex";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProvenanceFact } from "./provenance-field";
import { fieldStyles } from "./studio-fields.styles";

let windowInstance: Window;
let restore: RestoreGlobals;
let root: Root;
beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, {});
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restore();
});

test("wraps a long fact instead of widening the properties panel", async () => {
  const id = "discord:1431946567438569534:1466324999475429386";
  await act(async () =>
    root.render(<ProvenanceFact name="source" label="Source" value={id} />),
  );

  const value = [...document.querySelectorAll("span")].find(
    (span) => span.textContent === id,
  );
  const wraps = stylex.props(fieldStyles.fact).className ?? "";
  expect(wraps).not.toBe("");
  expect(value?.className).toBe(wraps);
});
