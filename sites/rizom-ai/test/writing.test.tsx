import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { enrichedBlogPostSchema } from "@brains/blog";
import { enrichedDeckSchema } from "@brains/decks";
import {
  TalksSection,
  WritingSection,
  type TalksContent,
  type WritingContent,
} from "../src/writing";

type DeckItem = TalksContent["decks"][number];
type PostItem = WritingContent["posts"][number];

/** Deck fixtures go through the real schema — validated, never cast. */
function deck(overrides: {
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
  description?: string;
}): DeckItem {
  return enrichedDeckSchema.parse({
    id: overrides.slug,
    entityType: "deck",
    content: "",
    contentHash: "fixture-hash",
    created: overrides.publishedAt,
    updated: overrides.publishedAt,
    metadata: {
      title: overrides.title,
      slug: overrides.slug,
      status: "published",
      publishedAt: overrides.publishedAt,
      ...(overrides.description && { description: overrides.description }),
    },
    frontmatter: {
      title: overrides.title,
      status: "published",
      publishedAt: overrides.publishedAt,
      ...(overrides.description && { description: overrides.description }),
    },
    body: "…",
    url: overrides.url,
  });
}

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

  it("renders an honest empty state before anything is published", () => {
    const html = render(<WritingSection posts={[]} pagination={null} />);
    expect(html).toContain("Nothing published here yet");
  });
});

describe("TalksSection", () => {
  it("lists published decks as talk index rows linking to their detail pages", () => {
    const html = render(
      <TalksSection
        decks={[
          deck({
            slug: "kick-off-2025",
            title: "Kick Off 2025",
            url: "/decks/kick-off-2025",
            publishedAt: "2026-04-14T14:52:04Z",
            description: "Outcome-based working.",
          }),
          deck({
            slug: "cococo",
            title: "Community, Collective, Core",
            url: "/decks/cococo",
            publishedAt: "2026-03-01T09:00:00Z",
          }),
        ]}
      />,
    );

    expect(html).toContain("Talks");
    expect(html).toContain("Kick Off 2025");
    expect(html).toContain('href="/decks/kick-off-2025"');
    expect(html).toContain("Outcome-based working.");
    expect(html).toContain("Community, Collective, Core");
  });

  it("renders nothing when there are no decks (no empty band)", () => {
    const html = render(<TalksSection decks={[]} />);
    expect(html).toBe("");
  });
});
