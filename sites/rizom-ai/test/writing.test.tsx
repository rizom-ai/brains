import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { enrichedBlogPostSchema } from "@brains/blog";
import { WritingSection, type WritingContent } from "../src/writing";

type PostItem = WritingContent["posts"][number];

/** Fixtures go through the real schema — validated, never cast. */
function post(overrides: {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  excerpt?: string;
  seriesName?: string;
}): PostItem {
  return enrichedBlogPostSchema.parse({
    id: overrides.id,
    entityType: "post",
    content: "",
    contentHash: "fixture-hash",
    created: overrides.publishedAt,
    updated: overrides.publishedAt,
    metadata: {
      title: overrides.title,
      slug: overrides.id,
      status: "published",
      publishedAt: overrides.publishedAt,
    },
    frontmatter: {
      title: overrides.title,
      author: "Rizom",
      status: "published",
      publishedAt: overrides.publishedAt,
      excerpt: overrides.excerpt ?? "",
      ...(overrides.seriesName && { seriesName: overrides.seriesName }),
    },
    body: "…",
    url: overrides.url,
  });
}

describe("WritingSection", () => {
  it("lists published posts as journal index rows", () => {
    const html = render(
      <WritingSection
        posts={[
          post({
            id: "post-1",
            title: "The future of work is play",
            url: "/posts/the-future-of-work-is-play",
            publishedAt: "2026-04-14T14:52:04Z",
            excerpt: "Why coordination beats headcount.",
            seriesName: "Foundation essays",
          }),
          post({
            id: "post-2",
            title: "Markdown, not databases",
            url: "/posts/markdown-not-databases",
            publishedAt: "2026-05-01T09:00:00Z",
          }),
        ]}
        pagination={null}
      />,
    );

    expect(html).toContain("The future of work is play");
    expect(html).toContain('href="/posts/the-future-of-work-is-play"');
    expect(html).toContain("Why coordination beats headcount.");
    expect(html).toContain("Foundation essays");
    expect(html).toContain("Markdown, not databases");
    expect(html).toContain("2026");
  });

  it("points to the deck archive", () => {
    const html = render(<WritingSection posts={[]} pagination={null} />);
    expect(html).toContain('href="/decks"');
  });

  it("renders an honest empty state before anything is published", () => {
    const html = render(<WritingSection posts={[]} pagination={null} />);
    expect(html).toContain("Nothing published here yet");
  });
});
