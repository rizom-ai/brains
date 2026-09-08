/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { createMockAppInfo } from "@brains/test-utils";
import { SystemPanel } from "../src/render/system-panel";
import type { DashboardRenderInput } from "../src/render/types";
import type { ComponentProps } from "react";

function input(): DashboardRenderInput {
  return {
    title: "Owner",
    baseUrl: "https://brain.test",
    dashboardPath: "/console",
    character: { role: "", purpose: "", values: [] },
    profile: { name: "Owner" },
    appInfo: createMockAppInfo({
      entities: 0,
      uptime: 90061,
      version: "1.2.3-exact",
      embeddings: 54321,
      daemons: [
        {
          name: "Private daemon",
          pluginId: "private-daemon",
          status: "running",
        },
      ],
    }),
    widgets: {},
  };
}
function render(
  data: DashboardRenderInput,
  overrides: Partial<ComponentProps<typeof SystemPanel>> = {},
): string {
  return renderToStaticMarkup(
    <SystemPanel
      input={data}
      now={new Date("2026-09-08T12:34:56.789Z")}
      knowledgeMapPoints={0}
      knowledgeMapZones={0}
      hasKnowledgeMap={false}
      hasNetworkMap={false}
      networkCount={0}
      {...overrides}
    />,
  );
}

test("System reference facts preserve exact time, zero counts, uptime, waiting maps, and public-only metadata without enhancement", async () => {
  const window = new Window();
  try {
    const html = render(input());
    window.document.body.innerHTML = html;
    const doc = window.document;
    expect(doc.querySelector("#system")?.getAttribute("aria-labelledby")).toBe(
      "dashboard-tab-system",
    );
    expect(doc.querySelectorAll("article")).toHaveLength(7);
    expect(doc.querySelector('[data-status-summary="good"]')).not.toBeNull();
    expect(doc.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Public semantic projection is waiting for data",
    );
    expect(
      [...doc.querySelectorAll("ol li")].map((item) =>
        item.getAttribute("data-complete"),
      ),
    ).toEqual(["true", "false", "true"]);
    expect(
      [...doc.querySelectorAll("tbody th strong")].map(
        (item) => item.textContent,
      ),
    ).toEqual([
      "public-card-render",
      "knowledge-map-refresh",
      "agent-proximity-scan",
    ]);
    expect(
      [...doc.querySelectorAll("tbody tr")].map((item) =>
        item.getAttribute("data-tone"),
      ),
    ).toEqual(["good", "warn", "warn"]);
    expect(
      [...doc.querySelectorAll("tbody td:first-of-type")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["now", "this render", "this render"]);
    expect(
      doc.querySelectorAll('[data-facts-presentation="reference"]'),
    ).toHaveLength(2);
    expect(doc.querySelectorAll("aside article")).toHaveLength(3);
    expect(
      [...doc.querySelectorAll(".system-content-card dd")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Waiting", "Waiting", "0"]);
    expect(
      [...doc.querySelectorAll(".system-runtime-card dd")]
        .slice(0, 4)
        .map((item) => item.textContent),
    ).toEqual(["v1.2.3-exact", "1d 01h 01m", "0 public", "1/1 online"]);
    expect(doc.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-09-08T12:34:56.789Z",
    );
    expect(doc.querySelector(".system-surfaces-card li")?.textContent).toBe(
      "DashboardOnline",
    );
    expect(doc.querySelector(".system-surfaces-card a")).toBeNull();
    expect(html).toContain("All public systems operational");
    expect(html).not.toContain("Private daemon");
    expect(html).not.toContain("54321");
    expect(html).not.toContain("system-kv");
  } finally {
    await window.happyDOM.abort();
  }
});

test("public availability keeps priority order, cross-source deduplication, source labels, and distinct soon/offline tones", async () => {
  const data = input();
  data.appInfo.interactions = [
    {
      id: "dashboard",
      label: "Duplicate dashboard",
      href: "https://brain.test/console/#status",
      kind: "human",
      pluginId: "dashboard",
      priority: 1,
      visibility: "public",
      status: "available",
    },
    {
      id: "chat",
      label: "Chat <script>",
      href: "/ask",
      kind: "human",
      pluginId: "chat",
      priority: 2,
      visibility: "public",
      status: "disabled",
    },
    {
      id: "directory",
      label: "Directory",
      href: "/directory",
      kind: "human",
      pluginId: "directory",
      priority: 3,
      visibility: "public",
      status: "coming-soon",
    },
  ];
  data.appInfo.endpoints = [
    {
      label: "Duplicate chat",
      url: "https://brain.test/ask/#status",
      priority: 4,
      visibility: "public",
      pluginId: "chat",
    },
  ];
  const window = new Window();
  try {
    window.document.body.innerHTML = render(data, {
      hasKnowledgeMap: true,
      knowledgeMapPoints: 21,
      knowledgeMapZones: 4,
    });
    const doc = window.document;
    expect(
      [...doc.querySelectorAll(".system-surfaces-card li")].map((item) => ({
        text: item.textContent,
        tone: item.getAttribute("data-tone"),
      })),
    ).toEqual([
      { text: "DashboardOnline", tone: "good" },
      { text: "Chat <Script>Offline", tone: "error" },
      { text: "DirectorySoon", tone: "warn" },
    ]);
    expect(doc.body.textContent).toContain("A public surface needs attention");
    expect(doc.querySelector(".system-content-card dd")?.textContent).toBe(
      "Current",
    );
    expect(doc.querySelector('[data-status-summary="warn"]')).not.toBeNull();
    expect(doc.querySelector('[data-readiness-tone="good"]')).not.toBeNull();
    expect(doc.body.textContent).toContain("1/3 online");
    expect(doc.body.textContent).not.toContain("Duplicate");
    expect(doc.querySelector("script")).toBeNull();
  } finally {
    await window.happyDOM.abort();
  }
  data.appInfo.interactions = data.appInfo.interactions.filter(
    (item) => item.id !== "chat",
  );
  data.appInfo.endpoints = [];
  expect(render(data)).toContain("All public systems operational");
});

test("availability remains capped at five while totals and health include an unshown offline surface", async () => {
  const data = input();
  data.appInfo.interactions = Array.from({ length: 6 }, (_, index) => ({
    id: `surface-${index}`,
    label: `Surface ${index}`,
    href: `/surface-${index}`,
    kind: "human",
    pluginId: "test",
    priority: index + 1,
    visibility: "public",
    status: index === 5 ? "disabled" : "available",
  }));
  const window = new Window();
  try {
    window.document.body.innerHTML = render(data);
    const doc = window.document;
    expect(doc.querySelectorAll(".system-surfaces-card li")).toHaveLength(5);
    expect(
      doc.querySelector(".system-surfaces-card")?.textContent,
    ).not.toContain("Surface 5");
    expect(doc.body.textContent).toContain("6/7 online");
    expect(doc.body.textContent).toContain("A public surface needs attention");
  } finally {
    await window.happyDOM.abort();
  }
});
