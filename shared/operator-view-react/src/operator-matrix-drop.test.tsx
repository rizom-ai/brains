/** @jsxImportSource react */
import type { RuntimeOperatorActionControl } from "@brains/plugins";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { OperatorViewRenderer } from "./operator-view-renderer";

const start: RuntimeOperatorActionControl = {
  actionId: "move",
  label: "Start",
  input: { id: "a", to: "doing" },
  dropTarget: "doing",
  result: { title: "Move", fields: [{ name: "status", label: "Outcome" }] },
};
const drop: RuntimeOperatorActionControl = {
  actionId: "drop",
  label: "Drop",
  input: { id: "a" },
};

describe("OperatorViewRenderer matrix drops", () => {
  let restoreGlobals: RestoreGlobals;
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;
  let invocations: RuntimeOperatorActionControl[];

  beforeEach(async () => {
    windowInstance = new Window({
      url: "https://brain.test/studio/workspaces/board",
    });
    restoreGlobals = installDomGlobals(windowInstance, {
      Event: windowInstance.Event,
      MutationObserver: windowInstance.MutationObserver,
      NodeFilter: windowInstance.NodeFilter,
      CustomEvent: windowInstance.CustomEvent,
      getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
      requestAnimationFrame:
        windowInstance.requestAnimationFrame.bind(windowInstance),
      cancelAnimationFrame:
        windowInstance.cancelAnimationFrame.bind(windowInstance),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    invocations = [];
    await act(async () =>
      root.render(
        <OperatorViewRenderer
          data={{
            view: {
              blocks: [
                {
                  type: "matrix",
                  id: "board",
                  columns: 3,
                  cells: [
                    {
                      id: "open",
                      label: "To do",
                      empty: "Nothing waiting.",
                      items: [
                        {
                          id: "a",
                          title: "Draft the checklist",
                          actionsLabel: "Move",
                          actions: [start, drop],
                        },
                        { id: "b", title: "Read the notes" },
                      ],
                    },
                    {
                      id: "doing",
                      label: "Doing",
                      empty: "Nobody is on anything.",
                      items: [],
                    },
                    {
                      id: "done",
                      label: "Done",
                      empty: "Nothing finished.",
                      items: [],
                    },
                  ],
                },
              ],
            },
          }}
          onAction={async (action) => {
            invocations.push(action);
            return { status: "Moved to Doing." };
          }}
          onOpenEntity={() => {}}
        />,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await windowInstance.happyDOM.abort();
    windowInstance.close();
    restoreGlobals();
  });

  const card = (title: string): HTMLElement => {
    const row = Array.from(container.querySelectorAll("li")).find((li) =>
      String(li.textContent).includes(title),
    );
    if (!row) throw new Error(`Expected a "${title}" card`);
    return row;
  };
  const cell = (label: string): HTMLElement => {
    const section = Array.from(container.querySelectorAll("section")).find(
      (candidate) => candidate.querySelector("h3")?.textContent === label,
    );
    if (!section) throw new Error(`Expected a "${label}" cell`);
    return section;
  };
  const fire = async (target: HTMLElement, type: string): Promise<boolean> => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    // Browsers give every drag event a DataTransfer; happy-dom does not.
    Object.defineProperty(event, "dataTransfer", {
      value: { setData: (): void => {} },
    });
    await act(async () => {
      target.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };

  it("lets a card with drop actions be dragged, and only that card", () => {
    expect(card("Draft the checklist").getAttribute("draggable")).toBe("true");
    expect(card("Read the notes").getAttribute("draggable")).toBeNull();
  });

  it("accepts the drag only over cells the card can move to", async () => {
    await fire(card("Draft the checklist"), "dragstart");

    expect(cell("Doing").dataset["drop"]).toBe("allowed");
    expect(cell("Done").dataset["drop"]).toBeUndefined();
    expect(await fire(cell("Doing"), "dragover")).toBe(true);
    expect(await fire(cell("Done"), "dragover")).toBe(false);
  });

  it("runs the card's action for the cell it is dropped on and shows the outcome", async () => {
    await fire(card("Draft the checklist"), "dragstart");
    await fire(cell("Doing"), "dragover");
    await fire(cell("Doing"), "drop");

    expect(invocations).toEqual([start]);
    expect(container.textContent).toContain("Moved to Doing.");
    expect(cell("Doing").dataset["drop"]).toBeUndefined();
  });

  it("ignores a drop on a cell the card cannot move to", async () => {
    await fire(card("Draft the checklist"), "dragstart");
    await fire(cell("Done"), "drop");
    await fire(card("Draft the checklist"), "dragend");

    expect(invocations).toEqual([]);
    expect(cell("Doing").dataset["drop"]).toBeUndefined();
  });

  it("keeps every move in the card's menu for keyboard and touch", () => {
    const labels = Array.from(
      card("Draft the checklist").querySelectorAll("button"),
    ).map((button) => String(button.textContent).trim());

    expect(labels).toEqual(expect.arrayContaining(["Start", "Drop"]));
  });
});
