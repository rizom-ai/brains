/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorMapFrame,
  OperatorMapCanvas,
  OperatorMapCoordinates,
  OperatorMapGraphic,
  OperatorMapEmpty,
  OperatorMapSummary,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled map framing, summaries, and graphics retain their structure at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorMapSummary
            id="summary"
            aria-label="Source summary"
            metrics={[
              { label: "entities", value: 0 },
              { label: "sources", value: 21 },
              { label: "regions", value: 4 },
            ]}
            status="Waiting"
            tone="warn"
          />
          <OperatorMapFrame
            id="split"
            className="host-hook"
            layout="split"
            joined
            data-host-map="kept"
          >
            <OperatorMapCanvas id="canvas">
              <OperatorMapCoordinates start="Context ←" end="→ Practice" />
              <OperatorMapGraphic
                id="tall"
                presentation="tall"
                viewBox="0 0 820 480"
                role="img"
                aria-labelledby="title description"
              >
                <title id="title">Source title</title>
                <desc id="description">Exact authored description</desc>
                <circle cx="76" cy="58" r="3" />
              </OperatorMapGraphic>
            </OperatorMapCanvas>
            <aside>Host-owned index</aside>
          </OperatorMapFrame>
          <OperatorMapFrame id="single" ambient>
            <OperatorMapGraphic
              id="standard"
              viewBox="0 0 980 560"
              aria-label="Radial diagram"
            />
          </OperatorMapFrame>
          <OperatorMapFrame layout="split">
            <OperatorMapEmpty id="empty">
              Waiting for indexed data, not an error.
            </OperatorMapEmpty>
          </OperatorMapFrame>
        </>,
      );
      const split = doc.getElementById("split"),
        canvas = doc.getElementById("canvas"),
        tall = doc.getElementById("tall"),
        single = doc.getElementById("single"),
        standard = doc.getElementById("standard"),
        empty = doc.getElementById("empty"),
        summary = doc.getElementById("summary");
      if (
        !split ||
        !canvas ||
        !tall ||
        !single ||
        !standard ||
        !empty ||
        !summary
      )
        throw Error("Missing shared map components");
      expect(split.classList.contains("host-hook")).toBe(true);
      expect(split.getAttribute("data-host-map")).toBe("kept");
      expect(window.getComputedStyle(split).gridTemplateColumns).toBe(
        width <= 700 ? "minmax(0,1fr)" : "minmax(0,2.25fr) minmax(250px,.75fr)",
      );
      expect(Number.parseFloat(window.getComputedStyle(split).minHeight)).toBe(
        width <= 700 ? 0 : 480,
      );
      expect(window.getComputedStyle(single).minHeight).toBe(
        width <= 700 ? "260px" : "360px",
      );
      expect(window.getComputedStyle(tall).width).toBe(
        width <= 700 ? "140%" : "100%",
      );
      expect(window.getComputedStyle(tall).minHeight).toBe(
        width <= 700 ? "320px" : "480px",
      );
      expect(window.getComputedStyle(standard).width).toBe(
        width <= 700 ? "155%" : "100%",
      );
      expect(window.getComputedStyle(standard).minHeight).toBe(
        width <= 700 ? "260px" : "360px",
      );
      expect(window.getComputedStyle(empty).gridColumn).toBe("1 / -1");
      expect(window.getComputedStyle(empty).minHeight).toBe(
        width <= 700 ? "260px" : "360px",
      );
      expect(tall.getAttribute("viewBox")).toBe("0 0 820 480");
      expect(tall.getAttribute("aria-labelledby")).toBe("title description");
      expect(tall.querySelector("circle")?.getAttribute("cx")).toBe("76");
      expect(canvas.querySelector('[aria-hidden="true"]')?.textContent).toBe(
        "Context ←→ Practice",
      );
      expect(summary.getAttribute("role")).toBe("group");
      expect(summary.querySelectorAll("dd > strong")).toHaveLength(3);
      expect(
        [...summary.querySelectorAll("dt")].map((el) => el.textContent),
      ).toEqual(["entities", "sources", "regions"]);
      expect(
        [...summary.querySelectorAll("dd")].map((el) => el.textContent),
      ).toEqual(["0", "21", "4"]);
      expect(summary.querySelector('p[data-tone="warn"]')?.textContent).toBe(
        "Waiting",
      );
      expect(
        doc.body.querySelector(
          "style,[style],[layout],[ambient],[joined],[presentation]",
        ),
      ).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("host-authored labels remain escaped in map summaries and empty states", () => {
  const html = renderToStaticMarkup(
    <>
      <OperatorMapSummary
        metrics={[
          { label: "<script>", value: "<img>" },
          { label: "Source", value: 0 },
          { label: "Region", value: 1 },
        ]}
        status="Waiting <script>"
        tone="neutral"
      />
      <OperatorMapEmpty>{"No <script> data"}</OperatorMapEmpty>
    </>,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;img&gt;");
  expect(html).not.toContain("<script>");
});

test("production SSR requires neither DOM nor a runtime StyleX compiler for map frames", () => {
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {OperatorMapFrame,OperatorMapGraphic,OperatorMapSummary,OperatorMapEmpty} from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h('main',{},h(OperatorMapSummary,{metrics:[{label:'Entities',value:0},{label:'Sources',value:21},{label:'Regions',value:4}],status:'Current',tone:'good'}),h(OperatorMapFrame,{layout:'split'},h(OperatorMapGraphic,{viewBox:'0 0 820 480','aria-label':'Public map'})),h(OperatorMapEmpty,{},'Waiting'))));`,
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('viewBox="0 0 820 480"');
  expect(html).toContain("Current");
  expect(html).not.toContain("<style");
});
