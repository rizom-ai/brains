/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { GuestBoxCopy } from "./guest-box-types";
import { GuestBoxWelcome } from "./GuestBoxWelcome";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let container: HTMLElement;
let root: Root;
const onTopic = mock((_topic: string): void => undefined);

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onTopic.mockClear();
});

afterEach(async () => {
  await act(async (): Promise<void> => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

const copy: GuestBoxCopy = {
  title: "Ask this brain",
  notice: "Answers come from **published** work.",
  inputHint: "Your question",
  topicsLabel: "Try:",
  topics: ["Energy efficiency", "Handoffs"],
};

async function render(
  overrides: Partial<GuestBoxCopy> = {},
  welcome = true,
): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(
      <GuestBoxWelcome
        copy={{ ...copy, ...overrides }}
        welcome={welcome}
        onTopic={onTopic}
      />,
    );
  });
}

function headings(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("#brain-chat-heading")];
}

describe("GuestBoxWelcome", () => {
  it("welcomes with the site's title, notice and topics, the title heading the conversation", async () => {
    await render();
    const welcome = container.querySelector(".brain-box-welcome");
    expect(welcome).not.toBe(null);
    expect(headings()).toHaveLength(1);
    expect(headings()[0]?.className).toBe("display");
    expect(headings()[0]?.textContent).toBe("Ask this brain");
    expect(welcome?.querySelector(".chat-notice")?.textContent).toContain(
      "Answers come from published work.",
    );
    const hints = welcome?.querySelector(".hints");
    expect(hints?.getAttribute("aria-label")).toBe("Try:");
    expect(
      [...(hints?.querySelectorAll("button") ?? [])].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Energy efficiency", "Handoffs"]);
  });

  it("hands over a topic the visitor picks", async () => {
    await render();
    await act(async (): Promise<void> => {
      container.querySelector<HTMLButtonElement>(".hints button")?.click();
    });
    expect(onTopic).toHaveBeenCalledWith("Energy efficiency");
  });

  it("heads the conversation for screen readers only once something is asked", async () => {
    await render({}, false);
    expect(container.querySelector(".brain-box-welcome")).toBe(null);
    expect(headings()).toHaveLength(1);
    expect(headings()[0]?.className).toBe("brain-box-sr-only");
    expect(headings()[0]?.textContent).toBe("Ask this brain");
  });

  it("welcomes without a visible title when the site gives none, and says Ask to screen readers", async () => {
    await render({ title: "" });
    expect(container.querySelector(".brain-box-welcome")).not.toBe(null);
    expect(container.querySelector(".display")).toBe(null);
    expect(headings()).toHaveLength(1);
    expect(headings()[0]?.className).toBe("brain-box-sr-only");
    expect(headings()[0]?.textContent).toBe("Ask");
  });

  it("shows no welcome when the site has nothing to say", async () => {
    await render({ title: "", notice: "", topics: [] });
    expect(container.querySelector(".brain-box-welcome")).toBe(null);
    expect(headings()[0]?.textContent).toBe("Ask");
  });
});
