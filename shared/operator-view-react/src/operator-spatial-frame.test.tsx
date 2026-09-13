/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const layout of ["cartesian", "radial"] as const)
  test(`compiled ${layout} spatial frame preserves geometry`, async () => {
    const block: Extract<RuntimeStudioOperatorPanelBlock, { type: "spatial" }> =
      layout === "cartesian"
        ? {
            type: "spatial",
            layout,
            id: "space",
            label: "Exact space α",
            description: "Description <source>",
            points: [
              { id: "a", label: "A", category: "topic", x: 0.25, y: 0.75 },
              { id: "b", label: "B", category: "topic", x: 0.75, y: 0.25 },
            ],
            zones: [
              {
                id: "zone",
                label: "Zone",
                x: 0.5,
                y: 0.5,
                memberIds: ["a", "b"],
              },
            ],
            relationships: [
              { sourceId: "a", targetId: "b", tone: "good" },
              { sourceId: "a", targetId: "missing" },
            ],
            legend: [],
          }
        : {
            type: "spatial",
            layout,
            id: "space",
            label: "Exact space α",
            description: "Description <source>",
            centerLabel: "Exact center α",
            centerKind: "centroid",
            points: [
              {
                id: "a",
                label: "A",
                kind: "agent",
                status: "ready",
                distance: 1,
                bearing: 0,
                relatedIds: ["b"],
                details: ["Exact detail"],
              },
              {
                id: "b",
                label: "B",
                kind: "agent",
                status: "waiting",
                distance: 0.5,
                bearing: 90,
              },
            ],
            strata: [
              { id: "zero", label: "Zero", maxDistance: 0 },
              { id: "far", label: "Far", maxDistance: 1 },
            ],
            relationships: [{ sourceId: "a", targetId: "b", tone: "warn" }],
            legend: [],
          };
    const window = new Window();
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorViewRenderer
          data={{ view: { blocks: [block] } }}
          onAction={async () => ({})}
          onOpenEntity={() => {}}
        />,
      );
      const figure = doc.querySelector("figure"),
        svg = doc.querySelector("svg"),
        line = doc.querySelector("line");
      if (!figure || !svg || !line || !svg.parentElement)
        throw Error("Missing spatial frame");
      expect(figure.getAttribute("aria-label")).toBe("Exact space α");
      expect(svg.getAttribute("viewBox")).toBe("0 0 1000 600");
      expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
      expect(doc.querySelectorAll("line")).toHaveLength(1);
      expect(window.getComputedStyle(figure).display).toBe("grid");
      expect(window.getComputedStyle(figure).gap).toBe("12px");
      expect(window.getComputedStyle(svg).position).toBe("absolute");
      expect(window.getComputedStyle(svg.parentElement).overflow).toBe(
        "hidden",
      );
      expect(line.getAttribute("x1")).toBe(
        layout === "cartesian" ? "250" : "500",
      );
      expect(line.getAttribute("y1")).toBe(
        layout === "cartesian" ? "450" : "30",
      );
      expect(line.getAttribute("x2")).toBe(
        layout === "cartesian" ? "750" : "725",
      );
      expect(line.getAttribute("y2")).toBe(
        layout === "cartesian" ? "150" : "300",
      );
      if (layout === "cartesian") {
        const circle = doc.querySelector("circle");
        if (!circle) throw Error("Missing zone");
        expect(circle.getAttribute("cx")).toBe("500");
        expect(circle.getAttribute("cy")).toBe("300");
        expect(circle.getAttribute("r")).toBe("72");
      } else {
        expect(
          Array.from(doc.querySelectorAll("ellipse")).map((ring) => [
            ring.getAttribute("rx"),
            ring.getAttribute("ry"),
          ]),
        ).toEqual([
          ["0", "0"],
          ["450", "270"],
        ]);
        expect(doc.querySelector('[data-kind="centroid"]')?.textContent).toBe(
          "Exact center α",
        );
        expect(
          doc
            .querySelector('[data-ui-spatial-point="a"]')
            ?.getAttribute("title"),
        ).toBe("A: agent, ready, Exact detail");
      }
      expect(doc.getElementById("space-detail-a")?.hasAttribute("hidden")).toBe(
        true,
      );
    } finally {
      await window.happyDOM.close();
    }
  });
