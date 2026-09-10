/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorMapGroup,
  OperatorMapPath,
  OperatorMapCircle,
  OperatorMapText,
  OperatorMapCount,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390])
  test(`compiled SVG primitives preserve authored geometry and explicit paint at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-warn:rgb(200,140,40);--console-ok:rgb(40,140,80);--console-secondary:rgb(80,60,120);--console-text-dim:rgb(100,100,100);--console-text-muted:rgb(120,120,120)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <svg viewBox="0 0 820 480" role="img" aria-labelledby="title">
          <title id="title">Exact &lt;source&gt;</title>
          <OperatorMapGroup id="region" data-map-active="false">
            <OperatorMapPath
              id="contour"
              presentation="contour"
              d="M 1 2 L 3 4 Z"
            />
            <OperatorMapCircle
              id="anchor"
              presentation="anchor"
              cx={1}
              cy={2}
              r={3}
            />
          </OperatorMapGroup>
          <OperatorMapGroup id="points" bloom>
            <OperatorMapCircle
              id="published"
              presentation="point"
              tone="warn"
              cx={17}
              cy={29}
              r={3.1}
            />
            <OperatorMapCircle
              id="skill"
              presentation="point"
              tone="good"
              r={2.7}
            />
            <OperatorMapCircle
              id="signal"
              presentation="point"
              hollow
              r={2.2}
            />
          </OperatorMapGroup>
          <OperatorMapCircle
            id="halo"
            presentation="halo"
            fill="url(#authored-gradient)"
            r={48}
          />
          <OperatorMapGroup id="archived" dimmed>
            <OperatorMapCircle
              id="node"
              presentation="node"
              tone="warn"
              r={5.5}
            />
          </OperatorMapGroup>
          <OperatorMapPath
            id="diamond"
            presentation="node"
            tone="secondary"
            d="M 1 0 L 2 1 L 1 2 Z"
          />
          <OperatorMapText id="label" presentation="region" x={10} y={20}>
            Exact name
            <OperatorMapCount id="count" dx={6}>
              0
            </OperatorMapCount>
          </OperatorMapText>
          <OperatorMapText id="peer-label" presentation="node" x={30}>
            Peer
          </OperatorMapText>
        </svg>,
      );
      function element(
        id: string,
      ): NonNullable<ReturnType<typeof doc.getElementById>> {
        const result = doc.getElementById(id);
        if (!result) throw Error(`Missing ${id}`);
        return result;
      }
      const css = (id: string): ReturnType<typeof window.getComputedStyle> =>
        window.getComputedStyle(element(id));
      expect(element("contour").getAttribute("d")).toBe("M 1 2 L 3 4 Z");
      expect(element("published").getAttribute("cx")).toBe("17");
      expect(element("published").getAttribute("cy")).toBe("29");
      expect(element("published").getAttribute("r")).toBe("3.1");
      expect(element("halo").getAttribute("fill")).toBe(
        "url(#authored-gradient)",
      );
      expect(element("diamond").getAttribute("d")).toBe("M 1 0 L 2 1 L 1 2 Z");
      expect(css("published").getPropertyValue("fill")).toBe("rgb(200,140,40)");
      expect(css("skill").getPropertyValue("fill")).toBe("rgb(40,140,80)");
      expect(css("signal").getPropertyValue("fill")).toBe("none");
      expect(css("diamond").getPropertyValue("stroke")).toBe("rgb(80,60,120)");
      expect(Number.parseFloat(css("archived").opacity)).toBe(0.25);
      expect(css("label").fontSize).toBe(width <= 700 ? "10px" : "8.5px");
      expect(css("peer-label").fontSize).toBe(width <= 700 ? "16px" : "9px");
      expect(element("count").getAttribute("dx")).toBe("6");
      expect(element("count").textContent).toBe("0");
      expect(css("count").fontWeight).toBe("600");
      expect(css("contour").animationDuration).toBe("1.15s");
      expect(css("points").animationDuration).toBe(".55s");
      expect(css("halo").animationDuration).toBe("5.2s");
      expect(css("halo").animationIterationCount).toBe("infinite");
    } finally {
      await window.happyDOM.close();
    }
  });

test("SVG primitives render production SSR without a DOM or runtime compiler", () => {
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as ui from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h('svg',{},h(ui.OperatorMapGroup,{'data-map-active':'true'},h(ui.OperatorMapPath,{presentation:'contour',d:'M 1 2 L 3 4 Z'}),h(ui.OperatorMapCircle,{presentation:'point',tone:'good',cx:17,r:2.7}),h(ui.OperatorMapText,{presentation:'region'},'Exact <source>',h(ui.OperatorMapCount,{dx:6},0))))));`,
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('data-map-active="true"');
  expect(html).toContain('d="M 1 2 L 3 4 Z"');
  expect(html).toContain('r="2.7"');
  expect(html).toContain("Exact &lt;source&gt;");
  expect(html).not.toContain("<style");
  expect(operatorViewStylexCSS).toContain("@keyframes");
  expect(operatorViewStylexCSS).not.toContain("@keyframes map-");
});
