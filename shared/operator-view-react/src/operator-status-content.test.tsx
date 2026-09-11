/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorStatusSummary,
  OperatorStatusPill,
  OperatorReadiness,
  OperatorSteps,
  OperatorChecks,
  OperatorStats,
  OperatorPanel,
  OperatorPanelParagraph,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled snapshot content retains states, semantics, and responsive geometry at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-ok:rgb(0,120,60);--console-warn:rgb(180,90,0);--console-err:rgb(180,0,0);--console-text:rgb(30,30,30)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorPanel heading="Snapshot" inset="flush-bottom" wash="neutral">
            <OperatorStatusSummary
              title="Needs attention"
              description="Host diagnostic <script>"
              status="Attention"
              tone="warn"
            />
            <OperatorStats
              density="compact"
              presentation="band"
              items={[
                {
                  label: "Surfaces",
                  value: "2 / 3",
                  caption: "online",
                  captionTone: "good",
                },
                {
                  label: "Projection",
                  value: "Waiting",
                  caption: "projection",
                },
                { label: "Directory", value: 0 },
              ]}
            />
          </OperatorPanel>
          <OperatorReadiness
            tone="neutral"
            indicator="—"
            indicatorLabel="Waiting for public data"
            title="Awaiting data"
            description="No fabricated percentage"
            facts={["0 entities", "0 points"]}
          />
          <OperatorReadiness
            tone="good"
            indicator="Live"
            indicatorLabel="Public data is ready"
            title="Ready"
            description="Source supplied"
            facts={["21 points"]}
          />
          <OperatorSteps
            label="Source stages"
            items={[
              { label: "entities", complete: true },
              { label: "indexed", complete: false },
              { label: "published", complete: true },
            ]}
          />
          <OperatorChecks
            label="Snapshot checks"
            headings={["Operation", "Updated", "Status"]}
            items={[
              {
                name: "exact-operation-id",
                description: "Full source diagnostic",
                updated: (
                  <time dateTime="2026-09-08T12:34:56.789Z">12:34:56</time>
                ),
                status: "waiting",
                tone: "warn",
              },
              {
                name: "ready-operation",
                description: "Current",
                updated: "this render",
                status: "current",
                tone: "good",
              },
              {
                name: "failed-operation",
                description: "Recorded failure",
                updated: "now",
                status: "failed",
                tone: "error",
              },
            ]}
          />
          <OperatorPanel
            heading="Visibility"
            wash="good"
            accessory={
              <OperatorStatusPill tone="good">Public</OperatorStatusPill>
            }
          >
            <OperatorPanelParagraph presentation="note">
              Private paths remain private.
            </OperatorPanelParagraph>
          </OperatorPanel>
        </>,
      );
      const summary = doc.querySelector('[data-status-summary="warn"]'),
        band = doc.querySelector('[data-stats-presentation="band"]'),
        table = doc.querySelector("table"),
        ring = doc.querySelector('[role="img"]');
      if (!summary || !band || !table || !ring)
        throw Error("Missing snapshot content");
      expect(window.getComputedStyle(summary).gridTemplateColumns).toBe(
        width <= 420
          ? "minmax(0,1fr)"
          : width <= 700
            ? "auto minmax(0,1fr)"
            : "auto minmax(0,1fr) auto",
      );
      expect(window.getComputedStyle(summary.firstElementChild).width).toBe(
        "42px",
      );
      expect(window.getComputedStyle(summary).color).toBe("rgb(180, 90, 0)");
      expect(summary.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(window.getComputedStyle(band).gridTemplateColumns).toBe(
        width <= 700 ? "minmax(0,1fr)" : "repeat(3,minmax(0,1fr))",
      );
      expect(window.getComputedStyle(band).marginLeft).toBe("-18px");
      expect(
        window.getComputedStyle(band.firstElementChild).borderTopWidth,
      ).toBe("0px");
      const nextMetric = band.children.item(1);
      if (!nextMetric) throw Error("Missing next metric");
      expect(window.getComputedStyle(nextMetric).borderTopWidth).toBe(
        width <= 700 ? "1px" : "0px",
      );
      expect(
        [...band.querySelectorAll("dt")].map((el) => el.textContent),
      ).toEqual(["Surfaces", "Projection", "Directory"]);
      expect(band.textContent).toContain("0");
      expect(ring.getAttribute("aria-label")).toBe("Waiting for public data");
      expect(window.getComputedStyle(ring).width).toBe(
        width <= 420 ? "68px" : "78px",
      );
      expect(
        doc.querySelector('[role="progressbar"],[aria-valuenow]'),
      ).toBeNull();
      expect(
        [...doc.querySelectorAll("ol li")].map((el) =>
          el.getAttribute("data-complete"),
        ),
      ).toEqual(["true", "false", "true"]);
      expect(table.querySelectorAll('thead th[scope="col"]')).toHaveLength(3);
      expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(3);
      expect(
        [...table.querySelectorAll("tbody tr")].map((el) =>
          el.getAttribute("data-tone"),
        ),
      ).toEqual(["warn", "good", "error"]);
      const updated = table.querySelector("tbody td");
      if (!updated) throw Error("Missing updated value");
      expect(window.getComputedStyle(updated).display).not.toBe("none");
      expect(window.getComputedStyle(updated).gridRow).toBe(
        width <= 700 ? "2" : "1",
      );
      expect(updated.querySelector("time")?.getAttribute("datetime")).toBe(
        "2026-09-08T12:34:56.789Z",
      );
      expect(
        doc.body.querySelector("script,style,[style],[wash],[inset]"),
      ).toBeNull();
      expect(doc.body.textContent).toContain("Host diagnostic <script>");
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("edge-aligned band presentation remains independent of density", () => {
  const render = (density: "compact" | "comfortable"): string =>
    renderToStaticMarkup(
      <OperatorStats
        density={density}
        presentation="band"
        items={[
          {
            label: "Projection",
            value: 0,
            caption: "waiting",
            captionTone: "warn",
          },
        ]}
      />,
    );
  expect(render("compact")).toBe(render("comfortable"));
});

test("new snapshot exports render production SSR without a DOM, runtime compiler, or injected stylesheet", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as ui from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h('main',{},h(ui.OperatorStatusSummary,{title:'Ready',description:'Source-owned',status:'Healthy',tone:'good'}),h(ui.OperatorReadiness,{tone:'good',indicator:'Live',indicatorLabel:'Projection ready',title:'Ready',description:'Source',facts:['21 points']}),h(ui.OperatorSteps,{label:'Pipeline',items:[{label:'indexed',complete:true}]}),h(ui.OperatorChecks,{label:'Checks',headings:['Operation','Updated','Status'],items:[{name:'exact-id',description:'Full diagnostic',updated:'this render',status:'current',tone:'good'}]}))));`,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain("Full diagnostic");
  expect(html).toContain('scope="col"');
  expect(html).not.toContain("<style");
  expect(html).not.toContain("progressbar");
});
