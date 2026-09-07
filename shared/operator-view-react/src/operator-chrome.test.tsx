/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorHeader,
  OperatorHeaderLink,
  OperatorHeaderButton,
  OperatorMasthead,
  OperatorSectionTabs,
  OperatorSectionTab,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

const chrome = (
  <>
    <OperatorHeader
      title="Rover Collective"
      mark="R"
      homeHref="/dashboard"
      label="Public brain"
      actionsLabel="Public actions"
    >
      <OperatorHeaderLink variant="primary" href="/ask">
        Ask
      </OperatorHeaderLink>
      <OperatorHeaderLink variant="secondary" href="/login">
        Sign in
      </OperatorHeaderLink>
      <OperatorHeaderButton
        id="climateToggle"
        aria-label="Toggle climate"
        desktopOnly
      >
        ◐
      </OperatorHeaderButton>
    </OperatorHeader>
    <OperatorMasthead
      title="Rover Collective"
      description="A public & private brain."
    />
    <OperatorSectionTabs label="Sections">
      <OperatorSectionTab
        id="overview-tab"
        href="#overview"
        selected
        data-ui-tab="overview"
        aria-controls="overview"
      >
        Overview
      </OperatorSectionTab>
      <OperatorSectionTab
        id="knowledge-tab"
        href="#knowledge"
        selected={false}
        data-ui-tab="knowledge"
        aria-controls="knowledge"
        count={236}
      >
        Knowledge
      </OperatorSectionTab>
    </OperatorSectionTabs>
  </>
);

test("compiled chrome preserves identity, native navigation, and accessible controls", async () => {
  const window = new Window();
  try {
    window.document.head.innerHTML = `<style>:root { --console-text: #ffffff; --console-accent: #ff5500; --console-text-muted: #888888; }${operatorViewStylexCSS}</style>`;
    window.document.body.innerHTML = renderToStaticMarkup(chrome);
    const header = window.document.querySelector(
      'header[aria-label="Public brain"]',
    );
    if (!header) throw new Error("Missing header");
    expect(window.getComputedStyle(header).minHeight).toBe("66px");
    expect(window.getComputedStyle(header).borderBottomWidth).toBe("1px");
    expect(header.querySelector("a")?.getAttribute("href")).toBe("/dashboard");
    expect(header.querySelector("strong")?.textContent).toBe(
      "Rover Collective",
    );
    expect(header.querySelector("em")?.textContent).toBe("Collective");
    expect(
      [...header.querySelectorAll("nav a")].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/ask", "/login"]);
    expect(header.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Toggle climate",
    );
    expect(window.document.querySelector("h1")?.textContent).toBe(
      "Rover Collective",
    );
    const tabs = [...window.document.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "overview",
      "knowledge",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("data-ui-tab"))).toEqual([
      "overview",
      "knowledge",
    ]);
    expect(tabs[1]?.textContent).toBe("Knowledge236");
    const active = tabs[0],
      inactive = tabs[1];
    if (!active || !inactive) throw new Error("Missing section tabs");
    expect(window.getComputedStyle(active).borderBottomWidth).toBe("2px");
    expect(window.getComputedStyle(inactive).borderBottomWidth).toBe("2px");
    const activeBorder = window.getComputedStyle(active).borderBottomColor;
    expect(window.getComputedStyle(inactive).borderBottomColor).not.toBe(
      activeBorder,
    );
    inactive.setAttribute("aria-selected", "true");
    expect(window.getComputedStyle(inactive).borderBottomColor).toBe(
      activeBorder,
    );
    expect(inactive.classList.contains("is-active")).toBe(false);
    expect(window.document.body.querySelector("style")).toBeNull();
  } finally {
    await window.happyDOM.abort();
  }
});

test("chrome escapes authored text and bounds long identities without dropping words", async () => {
  const window = new Window();
  try {
    const title = "unbroken".repeat(80) + " <script>";
    window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
    window.document.body.innerHTML = renderToStaticMarkup(
      <OperatorMasthead
        title={title}
        description="<img src=x onerror=alert(1)>"
      />,
    );
    const heading = window.document.querySelector("h1");
    if (!heading) throw new Error("Missing identity heading");
    expect(heading.textContent).toBe(title);
    expect(window.getComputedStyle(heading).overflowWrap).toBe("anywhere");
    expect(window.document.querySelector("script,img")).toBeNull();
    expect(
      renderToStaticMarkup(<OperatorMasthead title="Rover" />),
    ).not.toContain("<em");
  } finally {
    await window.happyDOM.abort();
  }
});

test("production SSR uses compiled chrome without a DOM, loader, or style injection", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `
    import {createElement as h} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {OperatorMasthead, OperatorSectionTabs, OperatorSectionTab} from ${JSON.stringify(entry)};
    console.log(renderToStaticMarkup(h('main', {}, h(OperatorMasthead, {title: 'Rover Collective'}), h(OperatorSectionTabs, {label: 'Sections'}, h(OperatorSectionTab, {selected: true, href: '#overview'}, 'Overview')))));
  `,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('role="tab"');
  expect(html).toContain('aria-selected="true"');
  expect(html).toContain('href="#overview"');
  expect(html).not.toContain("<style");
});
