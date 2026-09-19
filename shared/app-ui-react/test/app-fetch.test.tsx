/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { AppFetchProvider, useAppFetch, type AppFetch } from "../src";

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.close();
});

let seen: AppFetch | undefined;

function Probe(): null {
  seen = useAppFetch();
  return null;
}

async function render(tree: ReactNode): Promise<void> {
  seen = undefined;
  await act(async () => {
    root.render(tree);
  });
}

const transport: AppFetch = () => Promise.resolve(new Response("{}"));

describe("useAppFetch", () => {
  it("hands the tree the transport its provider holds", async () => {
    await render(
      createElement(
        AppFetchProvider,
        { fetch: transport },
        createElement(Probe),
      ),
    );

    expect(seen).toBe(transport);
  });

  it("is undefined with no provider, so callers keep their own default", async () => {
    await render(createElement(Probe));

    expect(seen).toBeUndefined();
  });

  it("takes the nearest provider, so a subtree can override the transport", async () => {
    const inner: AppFetch = () => Promise.resolve(new Response("[]"));

    await render(
      createElement(
        AppFetchProvider,
        { fetch: transport },
        createElement(AppFetchProvider, { fetch: inner }, createElement(Probe)),
      ),
    );

    expect(seen).toBe(inner);
  });
});
