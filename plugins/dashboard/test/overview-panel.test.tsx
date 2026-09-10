/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { createMockAppInfo } from "@brains/plugins/test";
import { OverviewPanel } from "../src/render/overview-panel";
import type { DashboardRenderInput } from "../src/render/types";

function input(): DashboardRenderInput {
  return {
    title: "Owner",
    baseUrl: "https://brain.test",
    character: { role: "", purpose: "", values: [] },
    profile: { name: "Owner" },
    appInfo: createMockAppInfo(),
    widgets: {},
  };
}

test("overview preserves native public destinations, cross-source deduplication, URL safety, and the five-door limit", async () => {
  const data = input();
  data.appInfo = createMockAppInfo({
    interactions: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        kind: "human",
        pluginId: "dashboard",
        priority: 0,
        visibility: "public",
        status: "available",
      },
      {
        id: "chat",
        label: "Chat",
        href: "/ask",
        kind: "human",
        pluginId: "web-chat",
        priority: 1,
        visibility: "public",
        status: "available",
      },
      {
        id: "mcp",
        label: "Agent API",
        href: "/mcp",
        kind: "protocol",
        pluginId: "mcp",
        priority: 2,
        visibility: "public",
        status: "available",
      },
    ],
    endpoints: [
      {
        label: "Duplicate chat",
        url: "/ask",
        pluginId: "web-chat",
        priority: 1,
        visibility: "public",
      },
      {
        label: "Public site",
        url: "/site",
        pluginId: "site",
        priority: 2,
        visibility: "public",
      },
    ],
  });
  data.profile = {
    name: "Owner",
    website: "https://brain.test/site",
    email: "public@example.test",
    socialLinks: [
      { platform: "unsafe", url: "javascript:alert(1)" },
      { platform: "repeat", url: "https://brain.test/ask" },
      {
        platform: "network",
        url: "https://network.example/profile",
        label: "Network",
      },
      { platform: "overflow", url: "https://other.example/profile" },
    ],
  };
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <OverviewPanel input={data} />,
    );
    const panel = window.document.querySelector(".public-contact-card");
    if (!panel) throw new Error("Missing public contact panel");
    expect(
      [...panel.querySelectorAll("a")].map((link) => link.getAttribute("href")),
    ).toEqual([
      "https://brain.test/ask",
      "https://brain.test/mcp",
      "https://brain.test/site",
      "mailto:public@example.test",
      "https://network.example/profile",
    ]);
    expect(
      panel
        .querySelector('li[data-kind="protocol"]')
        ?.getAttribute("data-tone"),
    ).toBe("secondary");
    expect(panel.textContent).not.toContain("Duplicate chat");
    expect(panel.innerHTML).not.toContain("javascript:");
    expect(panel.innerHTML).not.toContain("other.example");
  } finally {
    await window.happyDOM.abort();
  }
});

test("overview retains sorted positive counts, singular labels, and the four-total limit", async () => {
  const data = input();
  data.appInfo = createMockAppInfo({
    entityCounts: [
      { entityType: "zero", count: 0 },
      { entityType: "note", count: 1 },
      { entityType: "post", count: 5 },
      { entityType: "link", count: 5 },
      { entityType: "topic", count: 2 },
      { entityType: "archive", count: 1 },
    ],
  });
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <OverviewPanel input={data} />,
    );
    const ledger = window.document.querySelector(
      '.public-holdings-card [data-stats-presentation="ledger"]',
    );
    if (!ledger) throw new Error("Missing public holdings ledger");
    expect(
      [...ledger.querySelectorAll("dt")].map((item) => item.textContent),
    ).toEqual(["Links", "Posts", "Topics", "Archive"]);
    expect(
      [...ledger.querySelectorAll("dd")].map((item) => item.textContent),
    ).toEqual(["5", "5", "2", "1"]);
    expect(ledger.textContent).not.toContain("Zero");
    expect(window.document.querySelector(".public-skills-card li")).toBeNull();
    expect(
      window.document.querySelector(".public-skills-card")?.textContent,
    ).toContain("No public skills advertised yet.");
  } finally {
    await window.happyDOM.abort();
  }
});

test("overview empty states and authored identity remain readable without scripts or invented links", () => {
  const data = input();
  data.title = "Owner <script>";
  data.profile = {
    name: "Owner",
    website: "javascript:alert(1)",
    email: "public@example.test\r\nBcc:other@example.test",
  };
  const html = renderToStaticMarkup(<OverviewPanel input={data} />);
  expect(html).toContain("No public interaction doors are advertised yet.");
  expect(html).toContain("No public entities yet.");
  expect(html).toContain("Owner &lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("href=");
  expect(html).not.toContain(" hidden");
});
