/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { act, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import {
  useInitialIntent,
  type InitialIntentInput,
} from "./use-initial-intent";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let container: HTMLElement;
let root: Root;
const onSend = mock((): void => undefined);

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onSend.mockClear();
});

afterEach(async () => {
  await act(async (): Promise<void> => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function Probe(props: InitialIntentInput): ReactElement {
  const input = useRef<HTMLTextAreaElement>(null);
  useInitialIntent(input, props);
  return <textarea ref={input} />;
}

function input(
  overrides: Partial<InitialIntentInput> = {},
): InitialIntentInput {
  return {
    submitOnReady: false,
    busy: false,
    canSend: true,
    onSend,
    compact: false,
    ...overrides,
  };
}

async function render(
  overrides: Partial<InitialIntentInput> = {},
): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(<Probe {...input(overrides)} />);
  });
}

function composer(): HTMLTextAreaElement {
  const field = container.querySelector("textarea");
  if (!field) throw new Error("Missing composer");
  return field;
}

describe("useInitialIntent", () => {
  it("puts the cursor in the composer once the conversation is ready", async () => {
    await render({ busy: true });
    expect(document.activeElement).toBe(document.body);
    await render();
    expect(document.activeElement).toBe(composer());
  });

  it("leaves focus where the visitor already put it", async () => {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    await render();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("does not focus a closed sheet's composer, which would open it again", async () => {
    await render({ compact: true });
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses only the first time the conversation is ready", async () => {
    await render();
    await act(async (): Promise<void> => composer().blur());
    await render({ busy: true });
    await render();
    expect(document.activeElement).toBe(document.body);
  });

  it("sends a question asked before the box mounted once, when it is ready", async () => {
    await render({ submitOnReady: true, busy: true });
    expect(onSend).not.toHaveBeenCalled();
    await render({ submitOnReady: true });
    expect(onSend).toHaveBeenCalledTimes(1);
    await render({ submitOnReady: true, busy: true });
    await render({ submitOnReady: true, canSend: false });
    await render({ submitOnReady: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("drops the question asked before mounting when it cannot be sent once ready", async () => {
    await render({ submitOnReady: true, canSend: false });
    await render({ submitOnReady: true, canSend: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends nothing by itself without an earlier question", async () => {
    await render();
    await render({ canSend: false });
    await render();
    expect(onSend).not.toHaveBeenCalled();
  });
});
