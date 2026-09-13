/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";
import { OperatorViewRenderer } from "@brains/operator-view-react";
const data: RuntimeStudioWorkspaceData = {
  view: {
    title: "Overview",
    blocks: [
      {
        type: "columns",
        id: "overview-columns",
        primary: [
          {
            type: "card",
            id: "overview-attention",
            label: "Needs you",
            blocks: [
              {
                type: "list",
                id: "attention-entries",
                empty: "Nothing needs attention.",
                items: [
                  {
                    id: "failed",
                    title: "Delivery failed",
                    description: "Permission denied",
                    metadata: ["Publishing"],
                    tone: "error",
                    link: {
                      kind: "entity",
                      entityType: "post",
                      id: "draft-one",
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "system",
            label: "Runtime",
            presentation: "disclosure",
            blocks: [{ type: "text", text: "Source diagnostics" }],
          },
        ],
        aside: [
          {
            type: "card",
            id: "overview-activity",
            label: "Recent activity",
            blocks: [
              {
                type: "list",
                id: "activity-entries",
                empty: "No recent activity.",
                items: [
                  {
                    id: "activity",
                    title: "A completed operation",
                    description: "Full activity description",
                    metadata: ["Site", "run-123", "2026-09-05T13:19:25.792Z"],
                    tone: "warn",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
function render(value = data): string {
  return renderToStaticMarkup(
    <OperatorViewRenderer
      data={value}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
      renderHead={false}
    />,
  );
}
describe("Studio Overview composition", () => {
  it("separates attention from activity and keeps diagnostics closed on arrival", () => {
    const html = render();
    expect(html).toContain("declarative-columns");
    expect(html).toContain("Needs you");
    expect(html).toContain("Recent activity");
    expect(html).toContain("Delivery failed");
    expect(html).toContain("Permission denied");
    expect(html).toMatch(/<summary[^>]*>Runtime<\/summary>/);
    expect(html).not.toContain('open=""');
    expect(html).toContain("Source diagnostics");
    expect(html).toContain("run-123");
    expect(html).toMatch(/datetime="2026-09-05T13:19:25.792Z"/i);
    expect(html).not.toContain(">2026-09-05T13:19:25.792Z</time>");
    expect(html).toContain("Full activity description");
  });
  it("renders arbitrary provider blocks through the same renderer", () => {
    const html = render({
      view: {
        blocks: [{ type: "notice", tone: "error", text: "Source unavailable" }],
      },
    });
    expect(html).toContain("Source unavailable");
    expect(html).not.toContain("Nothing needs your attention");
  });
});
