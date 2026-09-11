/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const direction of [undefined, "bidirectional"] as const)
  test(`compiled flow retains ${direction ?? "default"} source semantics`, async () => {
    const statuses = ["idle", "active", "complete", "failed"] as const;
    const html = renderToStaticMarkup(
      <OperatorViewRenderer
        data={{
          view: {
            blocks: [
              {
                type: "flow",
                id: "pipeline",
                label: "Pipeline α",
                direction,
                steps: statuses.map((status) => ({
                  id: status,
                  status,
                  label: status,
                  detail: `Exact <${status}> α—/`,
                })),
              },
            ],
          },
        }}
        onAction={async () => ({})}
        onOpenEntity={() => {}}
      />,
    );
    for (const width of [1440, 390]) {
      const window = new Window({ width });
      try {
        const doc = window.document;
        doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
        doc.body.innerHTML = html;
        const heading = doc.getElementById("pipeline-title"),
          track = doc.querySelector("ol");
        if (!heading || !track) throw Error("Missing native flow");
        expect(heading.textContent).toBe("Pipeline α");
        expect(heading.parentElement?.getAttribute("aria-labelledby")).toBe(
          "pipeline-title",
        );
        expect(track.getAttribute("data-direction")).toBe(
          direction ?? "forward",
        );
        expect(window.getComputedStyle(track).overflowX).toBe(
          width <= 640 ? "visible" : "auto",
        );
        expect(window.getComputedStyle(track).display).toBe(
          width <= 640 ? "grid" : "flex",
        );
        const steps = Array.from(track.children);
        expect(steps.map((step) => step.getAttribute("data-status"))).toEqual([
          ...statuses,
        ]);
        for (const step of steps) {
          const mark = step.querySelector("span"),
            label = step.querySelector("strong"),
            detail = step.querySelector("small");
          if (!mark || !label || !detail) throw Error("Missing station");
          expect(mark.getAttribute("aria-hidden")).toBe("true");
          expect(window.getComputedStyle(mark).width).toBe("9px");
          expect(window.getComputedStyle(label).fontSize).toBe("12.5px");
          expect(window.getComputedStyle(detail).fontSize).toBe("10px");
          expect(detail.textContent).toBe(
            `Exact <${step.getAttribute("data-status")}> α—/`,
          );
          expect(window.getComputedStyle(detail).overflowWrap).toBe("anywhere");
          // Chromium checks relational :is() paint, state changes and pseudo-elements;
          // Happy DOM does not resolve these ancestor/child conditions.
        }
      } finally {
        await window.happyDOM.close();
      }
    }
  });
