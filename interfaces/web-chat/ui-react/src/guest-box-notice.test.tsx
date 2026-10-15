/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { GuestBoxFreshConfirmation } from "./GuestBoxNotice";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async (): Promise<void> => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function Region(props: { confirming: boolean }): ReactElement {
  const region = useRef<HTMLDivElement>(null);
  return (
    <div ref={region} className="region">
      {props.confirming && (
        <GuestBoxFreshConfirmation
          busy={false}
          regionRef={region}
          onContinue={(): void => undefined}
          onBack={(): void => undefined}
        />
      )}
    </div>
  );
}

async function render(confirming: boolean): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(<Region confirming={confirming} />);
  });
}

function region(): HTMLElement {
  const element = container.querySelector<HTMLElement>(".region");
  if (!element) throw new Error("Missing region");
  return element;
}

describe("GuestBoxFreshConfirmation", () => {
  it("opens at the end of the region, where it was asked for, with Continue focused", async () => {
    await render(false);
    // happy-dom has no layout: a conversation longer than the region.
    Object.defineProperty(region(), "scrollHeight", { value: 1600 });
    region().scrollTop = 200;
    await render(true);
    expect(region().scrollTop).toBe(1600);
    expect(document.activeElement?.textContent).toBe("Continue");
  });

  it("leaves the region where the reader is when it goes", async () => {
    await render(true);
    Object.defineProperty(region(), "scrollHeight", { value: 1600 });
    region().scrollTop = 200;
    await render(false);
    expect(region().scrollTop).toBe(200);
  });
});
