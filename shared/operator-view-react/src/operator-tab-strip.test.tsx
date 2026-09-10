/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorTabStrip,
  OperatorTabButton,
  OperatorTabCount,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const width of [1440, 768, 390])
  test(`compiled tab strips preserve native state and phone targets at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-text:rgb(10,10,10);--console-text-faint:rgb(100,100,100);--console-accent:rgb(180,60,20)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorTabStrip aria-label="Source tabs">
          <OperatorTabButton
            id="first"
            aria-selected="true"
            aria-controls="panel:first"
            data-ui-tab="first"
          >
            Full &lt;source&gt;<OperatorTabCount>0</OperatorTabCount>
          </OperatorTabButton>
          <OperatorTabButton
            id="second"
            aria-selected="false"
            aria-controls="panel:second"
            tabIndex={-1}
          >
            Second
          </OperatorTabButton>
        </OperatorTabStrip>,
      );
      const first = doc.getElementById("first"),
        second = doc.getElementById("second"),
        list = doc.querySelector('[role="tablist"]');
      if (!first || !second || !list) throw Error("Missing native tabs");
      expect(first.getAttribute("type")).toBe("button");
      expect(first.getAttribute("role")).toBe("tab");
      expect(first.getAttribute("aria-controls")).toBe("panel:first");
      expect(first.getAttribute("data-ui-tab")).toBe("first");
      expect(first.textContent).toBe("Full <source>0");
      expect(second.getAttribute("tabindex")).toBe("-1");
      expect(window.getComputedStyle(first).color).toBe("rgb(10, 10, 10)");
      expect(window.getComputedStyle(second).color).toBe("rgb(100, 100, 100)");
      expect(Number.parseFloat(window.getComputedStyle(first).minHeight)).toBe(
        width <= 640 ? 44 : 0,
      );
      expect(window.getComputedStyle(list).overflowX).toBe("auto");
      first.setAttribute("aria-selected", "false");
      first.classList.add("is-active");
      second.setAttribute("aria-selected", "true");
      expect(window.getComputedStyle(first).color).toBe("rgb(100, 100, 100)");
      expect(window.getComputedStyle(second).color).toBe("rgb(10, 10, 10)");
    } finally {
      await window.happyDOM.close();
    }
  });
