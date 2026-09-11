/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorPanelParagraph,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

test("muted paragraphs retain native attributes, full messages and zero values", async () => {
  const window = new Window();
  try {
    const doc = window.document;
    doc.head.innerHTML = `<style>:root{--console-text-muted:rgb(100,100,100)}${operatorViewStylexCSS}</style>`;
    doc.body.innerHTML = renderToStaticMarkup(
      <>
        <OperatorPanelParagraph
          presentation="muted"
          id="pending"
          className="host-message"
        >
          17 pending indexing — exact &lt;source&gt;
        </OperatorPanelParagraph>
        <OperatorPanelParagraph presentation="muted" id="zero">
          {0}
        </OperatorPanelParagraph>
      </>,
    );
    const pending = doc.getElementById("pending"),
      zero = doc.getElementById("zero");
    if (!pending || !zero) throw Error("Missing paragraphs");
    expect(pending.tagName).toBe("P");
    expect(pending.classList.contains("host-message")).toBe(true);
    expect(pending.classList.contains("muted")).toBe(false);
    expect(pending.getAttribute("role")).toBeNull();
    expect(pending.textContent).toBe("17 pending indexing — exact <source>");
    expect(zero.textContent).toBe("0");
    const css = window.getComputedStyle(pending);
    expect(css.fontSize).toBe("13px");
    expect(css.color).toBe("rgb(100, 100, 100)");
    expect(Number.parseFloat(css.marginTop)).toBe(0);
    expect(css.overflowWrap).toBe("anywhere");
  } finally {
    await window.happyDOM.close();
  }
});
