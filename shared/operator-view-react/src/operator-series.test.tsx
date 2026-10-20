/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { OperatorViewRenderer } from "@brains/operator-view-react";

type HappyDocument = Window["document"];

function render(): HappyDocument {
  const html = renderToStaticMarkup(
    <OperatorViewRenderer
      data={{
        view: {
          blocks: [
            {
              type: "series",
              id: "daily",
              label: "Pageviews per day",
              unit: "pageviews",
              points: [
                { id: "2026-10-08", label: "8 Oct", value: 4 },
                {
                  id: "2026-10-09",
                  label: "9 Oct",
                  value: 55,
                  marker: "Published: Infrastructure, Not Platforms",
                },
                { id: "2026-10-10", label: "10 Oct", value: null },
                { id: "2026-10-11", label: "11 Oct", value: 0, tone: "warn" },
              ],
            },
          ],
        },
      }}
      onAction={async () => undefined}
      onOpenEntity={() => undefined}
    />,
  );
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document;
}

test("draws one bar per point, the chart named by its label", () => {
  const doc = render();
  const chart = doc.querySelector('svg[role="img"]');
  expect(chart?.getAttribute("aria-label")).toContain("Pageviews per day");
  expect(doc.querySelectorAll("[data-series-point]")).toHaveLength(4);
});

test("tells each bar's reading, its unit and what happened that day", () => {
  const doc = render();
  const titles = [...doc.querySelectorAll("[data-series-point] title")].map(
    (t) => t.textContent,
  );
  expect(titles).toEqual([
    "8 Oct: 4 pageviews",
    "9 Oct: 55 pageviews · Published: Infrastructure, Not Platforms",
    "10 Oct: no data",
    "11 Oct: 0 pageviews",
  ]);
});

test("marks a missing point apart from a zero, and an event day with a marker", () => {
  const doc = render();
  const point = (id: string): ReturnType<HappyDocument["querySelector"]> =>
    doc.querySelector(`[data-series-point="${id}"]`);
  expect(point("2026-10-10")?.getAttribute("data-missing")).toBe("true");
  expect(point("2026-10-11")?.getAttribute("data-missing")).toBeNull();
  expect(point("2026-10-11")?.getAttribute("data-tone")).toBe("warn");
  expect(
    point("2026-10-09")?.querySelector("[data-series-marker]"),
  ).not.toBeNull();
  expect(point("2026-10-08")?.querySelector("[data-series-marker]")).toBeNull();
});

test("shows the peak and the first and last labels as the axis", () => {
  const doc = render();
  const axis = doc.querySelector("[data-series-axis]")?.textContent ?? "";
  expect(axis).toContain("55");
  expect(axis).toContain("8 Oct");
  expect(axis).toContain("11 Oct");
});
