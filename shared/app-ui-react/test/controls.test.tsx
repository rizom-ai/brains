/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
// The browser Radix needs at module load comes from test/browser-preload.ts,
// so this is an ordinary import.
import {
  Button,
  ConfirmDialog,
  DisclosureSheet,
  Input,
  NativeSelect,
  Switch,
} from "../src";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    PointerEvent: windowInstance.PointerEvent,
    KeyboardEvent: windowInstance.KeyboardEvent,
    MutationObserver: windowInstance.MutationObserver,
    NodeFilter: windowInstance.NodeFilter,
    HTMLInputElement: windowInstance.HTMLInputElement,
    ResizeObserver: windowInstance.ResizeObserver,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
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

  it("retains the accent/on-accent paint pair on primary hover", () => {
    const source = readFileSync(
      new URL("../src/controls.tsx", import.meta.url),
      "utf8",
    );
    const primary = source.slice(
      source.indexOf("  primary: {"),
      source.indexOf("  secondary: {"),
    );
    // The dim accent blends toward the page, dropping paper hover contrast
    // below 4.5:1. Browser acceptance exercises the actual hovered control.
    expect(primary).not.toMatch(
      /backgroundColor: "var\(--console-accent-dim\)"/,
    );
    expect(primary).not.toMatch(/borderColor: "var\(--console-accent-dim\)"/);
    expect(primary).toContain('color: "var(--console-on-accent)"');
  });

  it("keeps a hover cue when motion is reduced and the lift is disabled", () => {
    const source = readFileSync(
      new URL("../src/controls.tsx", import.meta.url),
      "utf8",
    );
    const primary = source.slice(
      source.indexOf("  primary: {"),
      source.indexOf("  secondary: {"),
    );
    // With the paint pair fixed and the lift removed under reduced motion,
    // hover needs a cue that is neither colour-on-text nor movement.
    const reducedMotion = "@media (prefers-reduced-motion: reduce)";
    const outline = primary.slice(primary.indexOf("outline: {"));
    expect(outline).toContain(':hover:not(:disabled)"');
    expect(outline.slice(0, outline.indexOf("},\n    },"))).toContain(
      reducedMotion,
    );
  });

  it("keeps disabled primary actions inert until the caller enables them", async () => {
    let calls = 0;
    const render = (disabled: boolean): void =>
      root.render(
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => {
            calls += 1;
          }}
        >
          Save
        </Button>,
      );
    await act(async () => render(true));
    const button = document.querySelector("button");
    if (!button) throw Error("Missing primary control");
    await act(async () => button.click());
    expect(calls).toBe(0);
    expect(button.disabled).toBe(true);
    await act(async () => render(false));
    expect(document.querySelector("button")).toBe(button);
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(calls).toBe(1);
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
    expect(dialog.hasAttribute("aria-describedby")).toBe(false);
    expect(
      document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe("Exact row actions");
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
