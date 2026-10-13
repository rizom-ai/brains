/** @jsxImportSource react */
import { expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadStudioWorkspace,
  StudioWorkspaceLoadRecovery,
} from "./studio-workspace-load";
import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

it("requires explicit confirmation to reload and preserves drafts on cancel", async () => {
  const browser = new Window({ url: "https://brain.test/studio" });
  const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    Element: browser.Element,
    Node: browser.Node,
    KeyboardEvent: browser.KeyboardEvent,
    Event: browser.Event,
    CustomEvent: browser.CustomEvent,
    HTMLInputElement: browser.HTMLInputElement,
    NodeFilter: browser.NodeFilter,
    MutationObserver: browser.MutationObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let reloads = 0;
  const click = async (label: string): Promise<void> => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );
    if (!button) throw Error(`Missing ${label}`);
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        <>
          <input aria-label="Draft" defaultValue="unsaved text" />
          <StudioWorkspaceLoadRecovery
            onReload={() => {
              reloads += 1;
            }}
          />
        </>,
      ),
    );
    expect(reloads).toBe(0);
    await click("Reload Studio");
    expect(reloads).toBe(0);
    await click("Stay");
    expect(reloads).toBe(0);
    expect(document.querySelector("input")?.value).toBe("unsaved text");
    await click("Reload Studio");
    await click("Reload");
    expect(reloads).toBe(1);
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

it("loads a workspace without replacing its component", async () => {
  const Workspace = (): ReactElement => <p>Ready</p>;
  expect(
    (await loadStudioWorkspace(async () => ({ default: Workspace }))).default,
  ).toBe(Workspace);
});

it("offers draft-safe recovery when an old chunk cannot load", async () => {
  const { default: Recovery } = await loadStudioWorkspace(async () => {
    throw new Error("private import failure URL");
  });
  const html = renderToStaticMarkup(<Recovery />);
  expect(html).toContain("Reload Studio");
  expect(html).toContain("Unsaved work will be lost if you reload");
  expect(html).not.toContain("private import failure URL");
  expect(html).not.toContain('role="dialog"');
});
