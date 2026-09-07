/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

const block: Extract<RuntimeStudioOperatorPanelBlock, { type: "list" }> = {
  type: "list",
  id: "records",
  empty: "No matching records — exact <source>",
  filter: {
    label: "Record status",
    defaultValue: "everything",
    allValue: "everything",
    options: [
      { value: "everything", label: "Everything", count: 3 },
      { value: "ready", label: "Ready", count: 1 },
      { value: "missing", label: "Missing", count: 0, emphasis: "gap" },
    ],
  },
  items: [
    { id: "first", title: "First record", filterValues: ["ready"] },
    { id: "second", title: "Second record", filterValues: ["other"] },
    { id: "third", title: "Unclassified record" },
  ],
};

test("list filters preserve source counts, custom all-values, gap emphasis and empty states", async () => {
  for (const width of [1440, 390]) {
    const window = new Window({ width });
    Object.assign(globalThis, {
      window,
      getComputedStyle: window.getComputedStyle.bind(window),
      document: window.document,
      navigator: window.navigator,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      Node: window.Node,
      Event: window.Event,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    document.head.innerHTML = `<style>:root{--console-warn:rgb(200,100,0)}${operatorViewStylexCSS}</style>`;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      const render = (items = block.items): void =>
        root.render(
          <OperatorViewRenderer
            data={{ view: { title: "Records", blocks: [{ ...block, items }] } }}
            onAction={async () => ({})}
            onOpenEntity={() => {}}
          />,
        );
      await act(async () => render());
      const group = container.querySelector<HTMLElement>(
        '[role="group"][aria-label="Record status"]',
      );
      if (!group) throw Error("Missing filter group");
      const [all, ready, gap] = Array.from(
        group.querySelectorAll<HTMLButtonElement>("button"),
      );
      if (!all || !ready || !gap) throw Error("Missing filter options");
      expect([all, ready, gap].map((button) => button.textContent)).toEqual([
        "Everything (3)",
        "Ready (1)",
        "Missing (0)",
      ]);
      expect(getComputedStyle(group).display).toBe("inline-flex");
      expect(getComputedStyle(group).paddingTop).toBe("3px");
      expect(getComputedStyle(gap).minHeight).toBe(
        width === 390 ? "44px" : "28px",
      );
      expect(getComputedStyle(gap).color).toBe("rgb(200, 100, 0)");
      expect(gap.dataset["emphasis"]).toBe("gap");
      expect(gap.hasAttribute("emphasis")).toBe(false);
      await act(async () => ready.click());
      expect(ready.getAttribute("aria-pressed")).toBe("true");
      expect(container.textContent).toContain("First record");
      expect(container.textContent).not.toContain("Second record");
      expect(container.textContent).not.toContain("Unclassified record");
      await act(async () => gap.click());
      expect(gap.getAttribute("aria-pressed")).toBe("true");
      expect(getComputedStyle(gap).color).toBe("rgb(200, 100, 0)");
      expect(container.textContent).toContain(block.empty);
      expect(container.textContent).not.toContain("First record");
      expect(group.textContent).toContain("Missing (0)");
      await act(async () => all.click());
      for (const item of block.items)
        expect(container.textContent).toContain(item.title);
      expect(container.textContent).not.toContain(block.empty);
      await act(async () => render([]));
      expect(container.querySelector('[role="group"]')).toBeNull();
      expect(container.textContent).toContain(block.empty);
    } finally {
      await act(async () => root.unmount());
      await window.happyDOM.close();
    }
  }
  expect(operatorViewStylexCSS).not.toContain(".declarative-filter");
});
