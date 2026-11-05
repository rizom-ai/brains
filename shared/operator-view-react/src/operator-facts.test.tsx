/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorFacts } from "./operator-facts";

const root = join(import.meta.dir, "..");
const css = await Bun.file(join(root, "dist/stylex.css")).text();
for (const density of ["compact", "comfortable"] as const) {
  test(`compiled facts preserve long values and ${density} composition`, async () => {
    const window = new Window();
    try {
      const doc = window.document;
      const value = "failure/".repeat(50);
      doc.head.innerHTML = `<style>${css}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorFacts
          density={density}
          items={[
            {
              label: "Build <detail>",
              value,
              caption: "Full/".repeat(100),
              tone: "error",
            },
            { label: "Pending", caption: "Not available" },
          ]}
        />,
      );
      expect(doc.querySelector("dt")?.textContent).toBe("Build <detail>");
      expect(doc.querySelector("dd")?.textContent).toBe(value);
      expect(doc.body.querySelector("style")).toBeNull();
      expect(doc.body.textContent).toContain("Full/".repeat(100));
      expect(doc.body.textContent).toContain("Not available");
      for (const element of doc.querySelectorAll("dt, dd")) {
        const computed = window.getComputedStyle(element);
        expect(computed.overflowWrap).toBe("anywhere");
        expect(computed.whiteSpace).not.toBe("nowrap");
      }
      const row = doc.querySelector("dl > div");
      if (!row) throw new Error("Missing fact row");
      expect(row.getAttribute("data-tone")).toBe("error");
      // A long value takes its own line under the label instead of being
      // pinched into a fixed value column.
      expect(window.getComputedStyle(row).display).toBe("flex");
      expect(window.getComputedStyle(row).flexWrap).toBe("wrap");
      // On a wide page facts flow into columns, keeping each label near its
      // value.
      const list = doc.querySelector("dl");
      if (!list) throw new Error("Missing facts");
      expect(window.getComputedStyle(list).display).toBe("grid");
      expect(window.getComputedStyle(list).gridTemplateColumns).toBe(
        "repeat(auto-fill,minmax(min(100%,24rem),1fr))",
      );
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("the built server entry renders without a DOM or StyleX loader", () => {
  const result = Bun.spawnSync(
    [
      "bun",
      "--eval",
      `
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {OperatorViewRenderer,operatorViewStylexCSS} from './dist/index.js';
  if(typeof document!=='undefined') throw new Error('SSR must not have a DOM');
  const data={view:{title:'Facts',blocks:[{type:'key-values',items:[{label:'Enabled',value:true},{label:'Missing',value:null}]}]}};
  const html=renderToStaticMarkup(createElement(OperatorViewRenderer,{data}));
  console.log(JSON.stringify({html,css:operatorViewStylexCSS}));
 `,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const output: unknown = JSON.parse(result.stdout.toString());
  if (
    typeof output !== "object" ||
    output === null ||
    !("html" in output) ||
    typeof output.html !== "string" ||
    !("css" in output) ||
    typeof output.css !== "string"
  )
    throw new Error("Invalid SSR test output");
  for (const text of ["data-facts", ">Yes</dd>", ">—</dd>"]) {
    expect(output.html).toContain(text);
  }
  expect(output.html).not.toContain("<style");
  expect(output.css.trim()).toBe(css.trim());
  expect(css).toContain("overflow-wrap:anywhere");
});
