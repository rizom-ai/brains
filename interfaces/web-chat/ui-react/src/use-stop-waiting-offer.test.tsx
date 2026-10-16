/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { useStopWaitingOffer } from "./use-stop-waiting-offer";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;
let offered: boolean | undefined;

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  offered = undefined;
});

afterEach(async () => {
  await act(async (): Promise<void> => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function Probe(props: { waiting: boolean; afterMs?: number }): null {
  offered = useStopWaitingOffer(props.waiting, props.afterMs);
  return null;
}

async function render(waiting: boolean, afterMs = 30): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(<Probe waiting={waiting} afterMs={afterMs} />);
  });
}

async function wait(ms: number): Promise<void> {
  await act(async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("useStopWaitingOffer", () => {
  it("offers to stop waiting only once an answer is taking long", async () => {
    await render(true);
    expect(offered).toBe(false);
    await wait(60);
    expect(offered).toBe(true);
  });

  it("offers nothing while nothing is being waited for", async () => {
    await render(false);
    await wait(60);
    expect(offered).toBe(false);
  });

  it("withdraws the offer once the answer arrives, and waits the full time again for the next", async () => {
    await render(true);
    await wait(60);
    expect(offered).toBe(true);
    await render(false);
    expect(offered).toBe(false);
    await render(true);
    expect(offered).toBe(false);
    await wait(60);
    expect(offered).toBe(true);
  });

  it("keeps its default patience when the box names no time", async () => {
    await act(async (): Promise<void> => {
      root.render(<Probe waiting />);
    });
    await wait(60);
    expect(offered).toBe(false);
  });
});
