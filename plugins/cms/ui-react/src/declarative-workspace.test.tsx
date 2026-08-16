/** @jsxImportSource react */
import type { RuntimeCmsWorkspaceData } from "@brains/plugins";
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeclarativeWorkspace } from "./declarative-workspace";

const data: RuntimeCmsWorkspaceData = {
  view: {
    title: "Reading library",
    blocks: [
      {
        type: "stats",
        items: [{ label: "Saved", value: 1, tone: "good" }],
      },
      {
        type: "notice",
        tone: "warn",
        text: "Review <script>alert('unsafe')</script>",
      },
      {
        type: "group",
        id: "automation",
        label: "Automation",
        items: [{ id: "watcher", label: "Watcher", value: true }],
      },
      {
        type: "flow",
        id: "pipeline",
        label: "Content flow",
        direction: "bidirectional",
        steps: [
          { id: "files", label: "Files", status: "complete" },
          { id: "store", label: "Store", status: "active" },
        ],
      },
      {
        type: "meters",
        id: "health",
        items: [{ id: "routes", label: "Routes", value: 4, max: 10 }],
      },
      {
        type: "progress",
        id: "build",
        label: "Preview build",
        state: "building",
        progress: 0.5,
      },
      {
        type: "query",
        id: "library-query",
        controls: [
          {
            key: "source",
            label: "Source",
            value: "mail",
            allLabel: "All sources",
            options: [{ value: "mail", label: "Mail", count: 1 }],
          },
        ],
        pagination: { offset: 0, limit: 1, total: 2 },
      },
      {
        type: "links",
        items: [
          {
            label: "Open publishing",
            target: {
              kind: "launch",
              launch: { target: "publishing" },
            },
          },
        ],
      },
      {
        type: "table",
        id: "saved",
        empty: "Nothing saved.",
        columns: [
          { key: "title", label: "Title" },
          { key: "tags", label: "Tags" },
        ],
        rows: [
          {
            id: "saved-1",
            cells: { title: "Saved item", tags: ["one", "two"] },
            actions: [
              {
                actionId: "refresh",
                label: "Refresh",
                input: { id: "saved-1" },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("DeclarativeWorkspace", () => {
  it("renders normalized base blocks and typed action controls", () => {
    const html = renderToStaticMarkup(
      createElement(DeclarativeWorkspace, {
        data,
        onAction: async () => ({}),
        onOpenEntity: () => {},
        query: { source: "mail", offset: 0, limit: 1 },
        onQueryChange: () => {},
      }),
    );

    expect(html).toContain("Reading library");
    expect(html).toContain("Saved item");
    expect(html).toContain("one, two");
    expect(html).toContain("Refresh");
    expect(html).toContain("Review &lt;script&gt;");
    expect(html).toContain("Automation");
    expect(html).toContain('data-direction="bidirectional"');
    expect(html).toContain('data-status="active"');
    expect(html).toContain('<progress value="4" max="10">');
    expect(html).toContain("Preview build");
    expect(html).toContain("All sources");
    expect(html).toContain("Mail (1)");
    expect(html).toContain("1 of 2");
    expect(html).toContain("Load more");
    expect(html).toContain(
      '<button type="button" class="declarative-inline-link">Open publishing</button>',
    );
    expect(html).not.toContain("<script>");
  });
});
