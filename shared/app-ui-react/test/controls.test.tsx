/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { Button, ConfirmDialog, Input, NativeSelect, Switch } from "../src";

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

describe("app control vocabulary", () => {
  it("renders one token-styled native control family", () => {
    const html = renderToStaticMarkup(
      <form>
        <Input aria-label="Name" />
        <NativeSelect aria-label="State">
          <option>Ready</option>
        </NativeSelect>
        <Switch aria-label="Enabled" />
        <Button>Save</Button>
      </form>,
    );

    expect(html).toContain('data-slot="input"');
    expect(html).toContain('data-slot="native-select"');
    expect(html).toContain('data-slot="switch"');
    expect(html).toContain('data-slot="button"');
    expect(html).not.toContain("@stylexjs");
  });

  it("keeps a confirmed Radix dialog mounted for its parent to settle", async () => {
    let cancelCalls = 0;
    let confirmCalls = 0;
    await act(async () => {
      root.render(
        <ConfirmDialog
          mark="!"
          title="Delete entry?"
          titleId="delete-title"
          cancelLabel="Keep"
          confirmLabel="Delete"
          confirmVariant="danger"
          onCancel={() => {
            cancelCalls += 1;
          }}
          onConfirm={() => {
            confirmCalls += 1;
          }}
        >
          <p>This cannot be undone.</p>
        </ConfirmDialog>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("This cannot be undone.");
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete",
    );
    await act(async () => confirm?.click());

    expect(confirmCalls).toBe(1);
    expect(cancelCalls).toBe(0);
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
