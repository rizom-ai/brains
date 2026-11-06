/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorStats,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

function layout(
  items: { label: string; value: number; caption?: string }[],
): string {
  const window = new Window({ width: 1200 });
  try {
    window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
    window.document.body.innerHTML = renderToStaticMarkup(
      <OperatorStats items={items} density="comfortable" />,
    );
    const root = window.document.querySelector("dl");
    if (!root) throw new Error("Missing stats");
    return window.getComputedStyle(root).display;
  } finally {
    window.close();
  }
}

test("captioned figures line up in even columns; plain ones stay inline", () => {
  expect(
    layout([
      { label: "Questions today", value: 0, caption: "0 this month" },
      {
        label: "Cost unknown",
        value: 0,
        caption: "This month, settled without usable provider usage",
      },
    ]),
  ).toBe("grid");
  expect(
    layout([
      { label: "Open", value: 0 },
      { label: "High priority", value: 0 },
    ]),
  ).toBe("flex");
});
