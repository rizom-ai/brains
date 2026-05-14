/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { ContentArchive } from "./ContentArchive";
import type { ContentItem } from "./ContentSection";

const items: ContentItem[] = [
  {
    id: "newer-essay",
    url: "/newer-essay",
    title: "Newer Essay",
    date: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "older-essay",
    url: "/older-essay",
    title: "Older Essay",
    date: "2024-01-01T00:00:00.000Z",
  },
];

describe("ContentArchive", () => {
  it("normalizes paginated titles for archive labels", () => {
    const html = render(
      <ContentArchive
        title="Essays - Page 2"
        items={items}
        pagination={{
          currentPage: 2,
          totalPages: 2,
          totalItems: 2,
          pageSize: 2,
        }}
        baseUrl="/essays"
      />,
    );

    expect(html).toContain("Essays");
    expect(html).toContain("1 essay");
    expect(html).not.toContain("essays - page 2s");
  });
});
