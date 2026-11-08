import { describe, expect, it } from "bun:test";
import { feedItemSchema, renderRssFeed, type FeedItem } from "../src/feed";

const channel = {
  title: "Reading & Notes",
  description: "What I read",
  link: "https://reader.example/bookmarks",
  selfLink: "https://reader.example/bookmarks.xml",
};

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "A page",
    slug: "a-page",
    description: "Worth reading",
    content: "<p>Body</p>",
    author: "Reader",
    publishedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function render(items: FeedItem[]): string {
  return renderRssFeed(
    items.map((entry) => feedItemSchema.parse(entry)),
    channel,
    (entry) => `https://reader.example/bookmarks/${entry.slug}`,
  );
}

describe("RSS feed rendering", () => {
  it("renders the channel, a self link and one item per entry", () => {
    const xml = render([item({ category: "Essays" })]);
    expect(xml).toContain("<title>Reading &amp; Notes</title>");
    expect(xml).toContain(
      '<atom:link href="https://reader.example/bookmarks.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain(
      "<link>https://reader.example/bookmarks/a-page</link>",
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://reader.example/bookmarks/a-page</guid>',
    );
    expect(xml).toContain("<content:encoded><![CDATA[<p>Body</p>]]>");
    expect(xml).toContain("<category>Essays</category>");
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>");
  });

  it("orders items newest first and dates the channel by the newest", () => {
    const xml = render([
      item({ slug: "older", publishedAt: "2026-01-01T00:00:00.000Z" }),
      item({ slug: "newer", publishedAt: "2026-03-01T00:00:00.000Z" }),
    ]);
    expect(xml.indexOf("/newer<")).toBeLessThan(xml.indexOf("/older<"));
    expect(xml).toContain(
      "<lastBuildDate>Sun, 01 Mar 2026 00:00:00 GMT</lastBuildDate>",
    );
  });

  it("escapes item text and keeps content that closes a CDATA section", () => {
    const xml = render([
      item({
        title: `Tom & "Jerry" <3`,
        content: "Ends ]]> here",
      }),
    ]);
    expect(xml).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;3</title>");
    expect(xml).toContain(
      "<content:encoded><![CDATA[Ends ]]]]><![CDATA[> here]]></content:encoded>",
    );
  });

  it("refuses an item without the fields a reader needs", () => {
    expect(feedItemSchema.safeParse(item({ title: "" })).success).toBe(false);
    expect(
      feedItemSchema.safeParse(item({ publishedAt: "yesterday" })).success,
    ).toBe(false);
  });
});
