/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorDocumentBody,
  operatorViewStylexCSS,
  operatorApplicationDocumentClasses,
} from "@brains/operator-view-react";

test("compiled document body preserves host attributes and native structure", async () => {
  const window = new Window();
  try {
    const html = renderToStaticMarkup(
      <OperatorDocumentBody
        id="document"
        className="host-body"
        data-source-id="exact:document"
      >
        <main>Full &lt;source&gt;</main>
      </OperatorDocumentBody>,
    );
    const doc = window.document;
    doc.documentElement.innerHTML = `<head><style>${operatorViewStylexCSS}</style></head>${html}`;
    const body = doc.body,
      style = window.getComputedStyle(body);
    expect(body.id).toBe("document");
    expect(body.classList.contains("host-body")).toBe(true);
    expect(body.getAttribute("data-source-id")).toBe("exact:document");
    expect(body.querySelector("main")?.textContent).toBe("Full <source>");
    expect(style.fontSize).toBe("14px");
    expect(style.position).toBe("relative");
    expect(style.overflowX).toBe("clip");
    expect(style.minHeight).toBe("100%");
    expect(style.maxWidth).toBe("100%");
    expect(Number.parseFloat(style.marginTop)).toBe(0);
  } finally {
    await window.happyDOM.close();
  }
});
test("application document slots retain native body, mount and boot typography", async () => {
  const window = new Window();
  try {
    const classes = operatorApplicationDocumentClasses(),
      doc = window.document;
    doc.documentElement.innerHTML = `<head><style>${operatorViewStylexCSS}</style></head><body class="${classes.body}" data-console-host="studio"><main class="${classes.mount}"><p class="${classes.boot}">Exact boot message</p></main></body>`;
    const mount = doc.querySelector("main"),
      boot = doc.querySelector("p");
    if (!mount || !boot) throw Error("Missing document slots");
    expect(window.getComputedStyle(doc.body).display).toBe("flex");
    expect(window.getComputedStyle(doc.body).fontSize).toBe("14px");
    expect(window.getComputedStyle(mount).flexDirection).toBe("column");
    expect(window.getComputedStyle(boot).fontSize).toBe("12px");
    expect(window.getComputedStyle(boot).paddingTop).toBe("48px");
    expect(boot.textContent).toBe("Exact boot message");
  } finally {
    await window.happyDOM.close();
  }
});

test("document body renders production SSR without DOM or style injection", () => {
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {OperatorDocumentBody} from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h(OperatorDocumentBody,{id:'host-body'},h('main',{},'Source content'))));`,
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('<body id="host-body"');
  expect(html).toContain("<main>Source content</main>");
  expect(html).not.toContain("<style");
});
