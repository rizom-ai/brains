/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorSegmentedGroup,
  OperatorSegmentedButton,
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

test("compiled segmented controls preserve native states, hiding and bounded phone targets", async () => {
  for (const width of [1440, 390]) {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-text:rgb(20,20,20);--console-text-muted:rgb(100,100,100);--console-frame:rgb(240,240,240)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorSegmentedGroup role="tablist" aria-label="Views">
          <OperatorSegmentedButton id="active" role="tab" aria-selected>
            Pending (0)
          </OperatorSegmentedButton>
          <OperatorSegmentedButton hidden id="hidden">
            Hidden
          </OperatorSegmentedButton>
        </OperatorSegmentedGroup>,
      );
      const button = doc.getElementById("active"),
        hidden = doc.getElementById("hidden");
      if (!button || !hidden) throw Error("Missing segmented controls");
      const css = window.getComputedStyle(button);
      expect(button.textContent).toBe("Pending (0)");
      expect(css.minHeight).toBe(width === 390 ? "44px" : "28px");
      expect(css.color).toBe("rgb(240, 240, 240)");
      expect(css.backgroundColor).toBe("rgb(20, 20, 20)");
      expect(css.overflowWrap).toBe("anywhere");
      expect(window.getComputedStyle(hidden).display).toBe("none");
    } finally {
      await window.happyDOM.close();
    }
  }
  expect(operatorViewStylexCSS).not.toContain(".declarative-tabs");
});

test("CSS renderer tabs retain exact counts and switch only the active panel", async () => {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <OperatorViewRenderer
          data={{
            view: {
              title: "Views",
              blocks: [
                {
                  type: "tabs",
                  id: "views",
                  label: "Views",
                  defaultTab: "first",
                  tabs: [
                    {
                      id: "first",
                      label: "Pending",
                      count: 0,
                      blocks: [{ type: "notice", text: "First panel" }],
                    },
                    {
                      id: "second",
                      label: "Reviewed",
                      count: 17,
                      blocks: [{ type: "notice", text: "Second panel" }],
                    },
                  ],
                },
              ],
            },
          }}
          onAction={async () => ({})}
          onOpenEntity={() => {}}
        />,
      ),
    );
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Pending (0)",
      "Reviewed (17)",
    ]);
    const second = tabs[1];
    if (!second) throw Error("Missing second tab");
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe(
      "First panel",
    );
    await act(async () => second.click());
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe(
      "Second panel",
    );
    expect(container.textContent).not.toContain("First panel");
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
  }
});
