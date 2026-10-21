/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { GuestBoxPending } from "./GuestBoxPending";

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

async function render(owner: string | undefined): Promise<HTMLElement> {
  await act(async (): Promise<void> => {
    root.render(<GuestBoxPending owner={owner} />);
  });
  const pending = container.querySelector<HTMLElement>(".brain-box-pending");
  if (!pending) throw new Error("Missing pending answer");
  return pending;
}

describe("GuestBoxPending", () => {
  it("holds the place of the answer being written, as an answer, out of screen readers' way", async () => {
    const pending = await render("Yeehaa");
    expect(pending.tagName).toBe("SECTION");
    expect(pending.className).toBe(
      "guest-message guest-assistant brain-box-pending",
    );
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    expect(pending.querySelector("h2")?.textContent).toBe("Yeehaa");
    expect(
      pending.querySelectorAll(".brain-box-waiting .brain-box-dots i"),
    ).toHaveLength(3);
    expect(pending.querySelector(".brain-box-waiting")?.textContent).toBe(
      "Looking through the published work",
    );
  });

  it("calls the answerer Brain when the host names no owner", async () => {
    const pending = await render(undefined);
    expect(pending.querySelector("h2")?.textContent).toBe("Brain");
  });
});
