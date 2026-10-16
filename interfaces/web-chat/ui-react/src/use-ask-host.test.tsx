/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_NAME_ATTRIBUTE,
  ASK_PLACEHOLDER_ATTRIBUTE,
} from "@brains/contracts";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { useAskHost, type AskHost } from "./use-ask-host";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root | undefined;
let host: AskHost | undefined;

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  host = undefined;
});

afterEach(async () => {
  const mounted = root;
  if (mounted) await act(async (): Promise<void> => mounted.unmount());
  root = undefined;
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function Probe(): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  host = useAskHost(box);
  return <div ref={box} />;
}

/** Mounts the box inside `container`, wherever the page put that. */
async function mount(container: HTMLElement): Promise<AskHost> {
  const mounted = createRoot(container);
  root = mounted;
  await act(async (): Promise<void> => {
    mounted.render(<Probe />);
  });
  if (!host) throw new Error("hook did not render");
  return host;
}

function askBox(attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute(ASK_BOX_ATTRIBUTE, "");
  Object.entries(attributes).forEach(([name, value]) =>
    element.setAttribute(name, value),
  );
  document.body.append(element);
  return element;
}

describe("useAskHost", () => {
  it("names the owner and the empty box's question in the host's words", async () => {
    const said = await mount(
      askBox({
        [ASK_NAME_ATTRIBUTE]: "  Yeehaa ",
        [ASK_PLACEHOLDER_ATTRIBUTE]: "Ask about my work…",
      }),
    );
    expect(said.owner).toBe("Yeehaa");
    expect(said.placeholder).toBe("Ask about my work…");
  });

  it("hears nothing in an empty attribute", async () => {
    const said = await mount(
      askBox({ [ASK_NAME_ATTRIBUTE]: "  ", [ASK_PLACEHOLDER_ATTRIBUTE]: "" }),
    );
    expect(said.owner).toBeUndefined();
    expect(said.placeholder).toBeUndefined();
  });

  it("hears nothing outside an Ask box host", async () => {
    const container = document.createElement("div");
    container.setAttribute(ASK_NAME_ATTRIBUTE, "Yeehaa");
    document.body.append(container);
    const said = await mount(container);
    expect(said.owner).toBeUndefined();
    expect(said.placeholder).toBeUndefined();
  });

  it("finds the bar of the talk panel it sits in, for its header actions", async () => {
    const talk = document.createElement("section");
    talk.className = "talk";
    const bar = document.createElement("header");
    bar.className = "ui-bar";
    const container = document.createElement("div");
    talk.append(bar, container);
    document.body.append(talk);
    const said = await mount(container);
    expect(said.header).toBe(bar);
  });

  it("has no header outside a talk panel", async () => {
    const said = await mount(askBox());
    expect(said.header).toBe(null);
  });
});
