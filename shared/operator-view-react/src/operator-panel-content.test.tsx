/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorPanelParagraph,
  OperatorPanelStatus,
  OperatorPanelEmpty,
  OperatorPanelList,
  OperatorPanelListItem,
  OperatorStats,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled summary copy, native links, and ledger preserve their hierarchy at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const document = window.document;
      document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      document.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorPanelParagraph lead="Rover">
            {" "}
            is a public brain.
          </OperatorPanelParagraph>
          <OperatorPanelStatus tone="good">
            Public scope only
          </OperatorPanelStatus>
          <OperatorPanelEmpty>No public entities yet.</OperatorPanelEmpty>
          <OperatorPanelList>
            <OperatorPanelListItem
              label="Chat"
              description="Ask about public content."
              badge="Human"
              href="/ask?from=public&mode=guest"
              data-kind="human"
            />
            <OperatorPanelListItem
              label="Agent API"
              badge="Agent"
              tone="secondary"
              href="/mcp"
            />
            <OperatorPanelListItem
              label="Shared context"
              description="Human–AI collaboration"
              badge="Skill"
              tone="good"
            />
          </OperatorPanelList>
          <OperatorStats
            density="compact"
            presentation="ledger"
            items={[
              { label: "Notes", value: 112 },
              { label: "Links", value: 86 },
              { label: "Posts", value: 24 },
              { label: "Topics", value: 12 },
            ]}
          />
        </>,
      );
      const paragraph = document.querySelector("p");
      const list = document.querySelector("ul");
      const ledger = document.querySelector("dl");
      if (!paragraph || !list || !ledger)
        throw new Error("Missing summary anatomy");
      expect(paragraph.textContent).toBe("Rover is a public brain.");
      expect(window.getComputedStyle(paragraph).fontSize).toBe(
        width <= 640 ? "13px" : "14px",
      );
      expect(window.getComputedStyle(paragraph).overflowWrap).toBe("anywhere");
      const rows = [...list.querySelectorAll("li")];
      expect(rows).toHaveLength(3);
      const first = rows[0],
        second = rows[1],
        last = rows[2];
      if (!first || !second || !last) throw new Error("Missing rows");
      expect(window.getComputedStyle(first).paddingTop).toBe("2px");
      expect(window.getComputedStyle(first).borderTopWidth).toBe("0px");
      expect(window.getComputedStyle(second).paddingTop).toBe("8px");
      expect(window.getComputedStyle(second).borderTopWidth).toBe("1px");
      expect(first.getAttribute("data-kind")).toBe("human");
      expect(second.getAttribute("data-tone")).toBe("secondary");
      expect(last.querySelector("a")).toBeNull();
      expect(last.querySelector('[aria-hidden="true"]')).not.toBeNull();
      for (const link of list.querySelectorAll("a"))
        if (width <= 640)
          expect(window.getComputedStyle(link).minHeight).toBe("44px");
      expect(
        first.querySelector("a")?.classList.contains("x-default-marker"),
      ).toBe(true);
      expect(first.querySelector("a")?.getAttribute("href")).toBe(
        "/ask?from=public&mode=guest",
      );
      const description = first.querySelector("em");
      if (!description) throw new Error("Missing description");
      expect(window.getComputedStyle(description).fontSize).toBe(
        width <= 640 ? "10.5px" : "11.5px",
      );
      expect(window.getComputedStyle(ledger).gridTemplateColumns).toBe(
        width <= 640 ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))",
      );
      expect(
        [...ledger.querySelectorAll("dd")].map((value) => value.textContent),
      ).toEqual(["112", "86", "24", "12"]);
      const value = ledger.querySelector("dd");
      if (!value) throw new Error("Missing ledger value");
      expect(window.getComputedStyle(value).fontSize).toBe(
        width <= 640 ? "25px" : "28px",
      );
      expect(window.getComputedStyle(value).marginLeft).toBe("0px");
      expect(document.body.querySelector("style,[style]")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("summary rows escape full authored copy and bound long badges without changing destinations", async () => {
  const window = new Window();
  try {
    const label = "long-token".repeat(80) + " <script>";
    window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
    window.document.body.innerHTML = renderToStaticMarkup(
      <OperatorPanelList>
        <OperatorPanelListItem
          label={label}
          description="<img src=x>"
          badge={label}
          href="mailto:public@example.test"
        />
        <OperatorPanelListItem label="No description" badge="Kind" />
      </OperatorPanelList>,
    );
    expect(window.document.querySelector("strong")?.textContent).toBe(label);
    expect(window.document.querySelector("a")?.getAttribute("href")).toBe(
      "mailto:public@example.test",
    );
    expect(window.document.querySelector("script,img")).toBeNull();
    const badge = window.document.querySelector("small");
    if (!badge) throw new Error("Missing badge");
    expect(badge.textContent).toBe(label);
    expect(window.getComputedStyle(badge).maxWidth).toBe("40%");
    expect(window.getComputedStyle(badge).overflowWrap).toBe("anywhere");
    expect(window.document.querySelector("li:last-child em")).toBeNull();
  } finally {
    await window.happyDOM.abort();
  }
});

test("production SSR uses compiled summary components and ledger totals without a style loader", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {OperatorPanelList,OperatorPanelListItem,OperatorStats} from ${JSON.stringify(entry)}; console.log(renderToStaticMarkup(h('main',{},h(OperatorPanelList,{},h(OperatorPanelListItem,{label:'Ask',badge:'Human',href:'/ask'})),h(OperatorStats,{density:'comfortable',presentation:'ledger',items:[{label:'Notes',value:112}]}))));`,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('href="/ask"');
  expect(html).toContain('data-stats-presentation="ledger"');
  expect(html).toContain(">112</dd>");
  expect(html).not.toContain("<style");
});
