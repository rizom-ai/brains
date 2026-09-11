/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorColumns,
  OperatorPanel,
  OperatorFacts,
  OperatorStatusDot,
  OperatorStatusList,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled panel groups, reference facts, and status rows preserve structure at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root {--console-ok:rgb(0,120,60);--console-warn:rgb(180,90,0);--console-err:rgb(180,0,0);--console-text-dim:rgb(80,80,80)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorColumns
          density="compact"
          presentation="panels"
          primary={
            <>
              <OperatorPanel heading="Health" fullWidth id="full">
                <p>Source-owned health</p>
              </OperatorPanel>
              <OperatorPanel heading="Content">
                <OperatorFacts
                  density="compact"
                  presentation="reference"
                  items={[
                    {
                      label: "Projection",
                      value: (
                        <>
                          <OperatorStatusDot tone="warn" />
                          Waiting
                        </>
                      ),
                    },
                    { label: "Entities", value: 0 },
                    {
                      label: "Rendered",
                      value: (
                        <time dateTime="2026-09-08T12:34:56.789Z">
                          2026-09-08 12:34
                        </time>
                      ),
                    },
                  ]}
                />
              </OperatorPanel>
            </>
          }
          aside={
            <OperatorStatusList
              items={[
                {
                  id: "not-a-dom-id",
                  label: "Dashboard",
                  status: "Online",
                  tone: "good",
                },
                {
                  id: "soon",
                  label: "Directory",
                  status: "Soon",
                  tone: "warn",
                },
                {
                  id: "offline",
                  label: "Chat",
                  status: "Offline",
                  tone: "error",
                },
              ]}
            />
          }
        />,
      );
      const root = doc.querySelector('[data-columns-presentation="panels"]');
      const primary = root?.firstElementChild;
      const aside = root?.querySelector(":scope > aside");
      const full = doc.getElementById("full");
      const facts = doc.querySelector('[data-facts-presentation="reference"]');
      if (!root || !primary || !aside || !full || !facts)
        throw new Error("Missing panel composition");
      expect(window.getComputedStyle(root).gap).toBe("14px");
      expect(window.getComputedStyle(root).gridTemplateColumns).toBe(
        width <= 960 ? "minmax(0,1fr)" : "minmax(0,2fr) minmax(270px,.86fr)",
      );
      expect(window.getComputedStyle(primary).gridTemplateColumns).toBe(
        width <= 700 ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))",
      );
      expect(window.getComputedStyle(aside).display).toBe(
        width <= 960 ? "grid" : "flex",
      );
      if (width <= 960)
        expect(window.getComputedStyle(aside).gridTemplateColumns).toBe(
          width <= 700 ? "minmax(0,1fr)" : "repeat(3,minmax(0,1fr))",
        );
      expect(window.getComputedStyle(full).gridColumn).toBe("1 / -1");
      expect(full.hasAttribute("fullwidth")).toBe(false);
      const row = facts.querySelector("div"),
        label = facts.querySelector("dt"),
        value = facts.querySelector("dd");
      if (!row || !label || !value) throw new Error("Missing fact row");
      expect(
        window.getComputedStyle(row).getPropertyValue("padding-block"),
      ).toBe("8px");
      expect(window.getComputedStyle(row).borderTopWidth).toBe("0px");
      expect(window.getComputedStyle(row).borderBottomWidth).toBe("0px");
      expect(window.getComputedStyle(label).fontSize).toBe("9.5px");
      expect(window.getComputedStyle(value).fontSize).toBe("10.5px");
      expect(window.getComputedStyle(value).textAlign).toBe("right");
      expect(facts.querySelector("time")?.getAttribute("datetime")).toBe(
        "2026-09-08T12:34:56.789Z",
      );
      expect(
        [...facts.querySelectorAll("dd")].map((item) => item.textContent),
      ).toEqual(["Waiting", "0", "2026-09-08 12:34"]);
      const states = [...aside.querySelectorAll("li")];
      expect(states.map((item) => item.getAttribute("data-tone"))).toEqual([
        "good",
        "warn",
        "error",
      ]);
      expect(
        states.map((item) => item.querySelector("small")?.textContent),
      ).toEqual(["Online", "Soon", "Offline"]);
      expect(aside.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
      expect(aside.querySelector("a")).toBeNull();
      expect(doc.body.innerHTML).not.toContain("not-a-dom-id");
      expect(doc.body.querySelector("style,[style]")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("reference facts and availability retain escaped source text rather than rendering HTML", () => {
  const html = renderToStaticMarkup(
    <>
      <OperatorFacts
        density="comfortable"
        presentation="reference"
        items={[{ label: "<script>", value: "<img src=x>" }]}
      />
      <OperatorStatusList
        items={[
          {
            id: "private-key",
            label: "<script>",
            status: "Offline <img>",
            tone: "error",
          },
        ]}
      />
    </>,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;img src=x&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("private-key");
});

test("production SSR renders composed facts and status without a DOM or StyleX loader", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {OperatorFacts,OperatorStatusDot,OperatorStatusList} from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h('main',{},h(OperatorFacts,{density:'compact',presentation:'reference',items:[{label:'Rendered',value:h('time',{dateTime:'2026-09-08T12:34:56.789Z'},'12:34')},{label:'Projection',value:h(OperatorStatusDot,{tone:'warn'})}]}),h(OperatorStatusList,{items:[{id:'source',label:'Chat',status:'Offline',tone:'error'}]}))));`,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('dateTime="2026-09-08T12:34:56.789Z"');
  expect(html).toContain("Offline");
  expect(html).not.toContain("<style");
});
