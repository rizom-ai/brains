/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const tone of ["neutral", "good", "warn", "error"] as const)
  test(`compiled progress preserves source values and ${tone} state`, async () => {
    const html = renderToStaticMarkup(
      <OperatorViewRenderer
        data={{
          view: {
            blocks: [
              {
                type: "meters",
                id: "meters",
                items: [
                  {
                    id: "zero",
                    label: "Zero",
                    value: 0,
                    max: 10,
                    unit: "items",
                    tone,
                  },
                  { id: "free", label: "Unbounded", value: 5 },
                ],
              },
              {
                type: "progress",
                id: "progress",
                label: "Build",
                state: "waiting",
                progress: 0,
                tone,
                detail: "exact <diagnostic>",
                startedAt: "2026-09-09T12:34:56Z",
                updatedAt: "2026-09-09T12:35:00Z",
              },
              {
                type: "progress",
                id: "pending",
                label: "Pending",
                state: "unknown",
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
        window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
        window.document.body.innerHTML = html;
        const colors = {
          neutral: "rgb(1, 2, 3)",
          good: "rgb(4, 5, 6)",
          warn: "rgb(7, 8, 9)",
          error: "rgb(10, 11, 12)",
        };
        for (const [token, color] of Object.entries({
          text: colors.neutral,
          ok: colors.good,
          warn: colors.warn,
          err: colors.error,
        }))
          window.document.body.style.setProperty(`--console-${token}`, color);
        const bars = Array.from(window.document.querySelectorAll("progress")),
          meter = bars[0],
          bar = bars[1];
        if (!meter || !bar) throw Error("Missing native progress");
        expect(bars).toHaveLength(2);
        expect(meter.getAttribute("value")).toBe("0");
        expect(meter.getAttribute("max")).toBe("10");
        expect(meter.getAttribute("aria-label")).toBe("Zero");
        expect(bar.getAttribute("value")).toBe("0");
        expect(bar.getAttribute("max")).toBe("1");
        expect(bar.textContent).toBe("0%");
        const frame = bar.parentElement,
          definition = meter.parentElement;
        if (!frame || !definition) throw Error("Missing frame");
        expect(definition.textContent).toContain("0 items");
        expect(frame.querySelector("small")?.textContent).toBe(
          "Started 2026-09-09T12:34:56Z · Updated 2026-09-09T12:35:00Z",
        );
        expect(frame.querySelector("p")?.textContent).toBe(
          "exact <diagnostic>",
        );
        expect(frame.getAttribute("data-tone")).toBe(tone);
        expect(window.getComputedStyle(bar).height).toBe("4px");
        expect(window.getComputedStyle(bar).appearance).toBe("none");
        expect(window.getComputedStyle(definition).fontSize).toBe("15px");
        expect(window.getComputedStyle(definition).color).toBe(colors[tone]);
        expect(window.getComputedStyle(frame).minWidth).toBe("0");
      } finally {
        await window.happyDOM.close();
      }
    }
  });
