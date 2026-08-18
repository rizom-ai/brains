import { describe, expect, it } from "bun:test";
import { renderRssFeed, type FeedChannel, type FeedItem } from "../src/feed";

const channel: FeedChannel = {
  title: "Test Blog",
  description: "A blog for testing",
  link: "https://example.com/posts",
};

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "First Post",
    slug: "first-post",
    description: "An excerpt",
    content: "# Heading\n\nBody text.",
    author: "Test Author",
    publishedAt: "2024-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("renderRssFeed", () => {
  it("renders a channel with the declared fields", () => {
    const xml = renderRssFeed([item()], channel);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Test Blog</title>");
    expect(xml).toContain("<link>https://example.com/posts</link>");
    expect(xml).toContain("<description>A blog for testing</description>");
    expect(xml).toContain("<language>en-us</language>");
  });

  it("builds an item URL from the channel link and the item slug", () => {
    const xml = renderRssFeed([item()], channel);

    expect(xml).toContain("<link>https://example.com/posts/first-post</link>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/posts/first-post</guid>',
    );
  });

  it("carries content as CDATA so markup survives", () => {
    const xml = renderRssFeed([item()], channel);

    expect(xml).toContain(
      "<content:encoded><![CDATA[# Heading\n\nBody text.]]></content:encoded>",
    );
  });

  it("formats dates as RFC 822, which RSS 2.0 requires", () => {
    const xml = renderRssFeed([item()], channel);

    expect(xml).toContain("<pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate>");
  });

  it("emits newest first and dates the channel from the newest item", () => {
    const xml = renderRssFeed(
      [
        item({
          title: "Older",
          slug: "older",
          publishedAt: "2024-01-01T00:00:00.000Z",
        }),
        item({
          title: "Newer",
          slug: "newer",
          publishedAt: "2024-06-01T00:00:00.000Z",
        }),
      ],
      channel,
    );

    expect(xml.indexOf("Newer")).toBeLessThan(xml.indexOf("Older"));
    expect(xml).toContain(
      "<lastBuildDate>Sat, 01 Jun 2024 00:00:00 GMT</lastBuildDate>",
    );
  });

  it("includes a category only when the item has one", () => {
    expect(renderRssFeed([item({ category: "A Series" })], channel)).toContain(
      "<category>A Series</category>",
    );
    expect(renderRssFeed([item()], channel)).not.toContain("<category>");
  });

  it("escapes XML metacharacters in text fields", () => {
    const xml = renderRssFeed(
      [item({ title: "Tom & Jerry <script>", description: 'He said "hi"' })],
      channel,
    );

    expect(xml).toContain("<title>Tom &amp; Jerry &lt;script&gt;</title>");
    expect(xml).toContain("<description>He said &quot;hi&quot;</description>");
  });

  it("includes optional channel fields only when supplied", () => {
    const xml = renderRssFeed([item()], {
      ...channel,
      copyright: "© 2024",
      managingEditor: "editor@example.com",
      webMaster: "web@example.com",
      language: "fr",
    });

    expect(xml).toContain("<copyright>© 2024</copyright>");
    expect(xml).toContain(
      "<managingEditor>editor@example.com</managingEditor>",
    );
    expect(xml).toContain("<webMaster>web@example.com</webMaster>");
    expect(xml).toContain("<language>fr</language>");
    expect(renderRssFeed([item()], channel)).not.toContain("<copyright>");
  });

  it("renders a valid empty channel when there is nothing to syndicate", () => {
    const xml = renderRssFeed([], channel);

    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });
});
