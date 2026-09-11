/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
// Radix chooses its browser layout-effect implementation at module load.
const bootstrapWindow = new Window();
Object.assign(globalThis, {
  window: bootstrapWindow,
  document: bootstrapWindow.document,
});
const { Button, ConfirmDialog, DisclosureSheet, Input, NativeSelect, Switch } =
  await import("../src");
await bootstrapWindow.happyDOM.close();

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
    PointerEvent: windowInstance.PointerEvent,
    KeyboardEvent: windowInstance.KeyboardEvent,
    MutationObserver: windowInstance.MutationObserver,
    NodeFilter: windowInstance.NodeFilter,
    HTMLInputElement: windowInstance.HTMLInputElement,
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

  it("uses lightweight grouped-action triggers without changing dialog or action behavior", async () => {
    let invoked = 0;
    await act(async () =>
      root.render(
        <DisclosureSheet
          title="Exact row actions"
          triggerLabel="Options"
          triggerVariant="link"
        >
          <Button
            onClick={() => {
              invoked++;
            }}
          >
            Move up
          </Button>
          <Button disabled>Publish now</Button>
        </DisclosureSheet>,
      ),
    );
    const trigger = document.querySelector('button[data-state="closed"]');
    if (!(trigger instanceof HTMLElement))
      throw Error("Missing grouped-action trigger");
    expect(trigger.getAttribute("data-variant")).toBe("link");
    expect(trigger.hasAttribute("triggerVariant")).toBe(false);
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw Error("Missing action sheet");
    expect(dialog.textContent).toContain("Exact row actions");
    expect(invoked).toBe(0);
    const move = Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Move up",
      ),
      publish = Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Publish now",
      );
    if (!move || !publish) throw Error("Missing exact source actions");
    expect(publish.disabled).toBe(true);
    await act(async () => move.click());
    expect(invoked).toBe(1);
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps outside dismissal caller-owned and blocks it while pending", async () => {
    let canceled = 0;
    const render = async (pending: boolean): Promise<void> => {
      await act(async () => {
        root.render(
          <ConfirmDialog
            mark="!"
            title="Confirm"
            titleId="policy-title"
            cancelLabel="Keep"
            confirmLabel="Apply"
            confirmClassName="exact-confirm"
            pending={pending}
            dismissOnOutside
            onCancel={() => {
              canceled += 1;
            }}
            onConfirm={() => {}}
          >
            <p>Exact policy</p>
          </ConfirmDialog>,
        );
      });
    };
    await render(true);
    const dialog = document.querySelector('[role="alertdialog"]'),
      overlay = dialog?.previousElementSibling;
    if (!dialog || !overlay) throw Error("Missing confirmation portal");
    expect(dialog.parentElement).toBe(document.body);
    const confirm = dialog.querySelector("button.exact-confirm");
    if (!confirm) throw Error("Missing styled confirm");
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(canceled).toBe(0);
    await render(false);
    await act(async () => {
      overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(canceled).toBe(1);
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
