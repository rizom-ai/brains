import { describe, expect, test } from "bun:test";
import { generateRSSFeed } from "../src/rss/feed-generator";
import type { BlogPostWithData } from "../src/datasources/blog-datasource";
import { createTestEntity } from "@brains/test-utils";

const defaultFeedConfig = {
  title: "My Blog",
  description: "Blog description",
  link: "https://example.com",
};

const post1Content = "---\ntitle: First Post\nslug: first-post\n---\nContent 1";
const post2Content =
  "---\ntitle: Second Post\nslug: second-post\n---\nContent 2";

const samplePosts: BlogPostWithData[] = [
  {
    ...createTestEntity("post", {
      id: "post-1",
      content: post1Content,
      metadata: {
        title: "First Post",
        slug: "first-post",
        status: "published",
        publishedAt: "2025-01-15T10:00:00.000Z",
      },
    }),
    frontmatter: {
      title: "First Post",
      slug: "first-post",
      status: "published",
      publishedAt: "2025-01-15T10:00:00.000Z",
      excerpt: "First post excerpt",
      author: "John Doe",
    },
    body: "Content 1",
  },
  {
    ...createTestEntity("post", {
      id: "post-2",
      content: post2Content,
      metadata: {
        title: "Second Post",
        slug: "second-post",
        status: "published",
        publishedAt: "2025-01-10T10:00:00.000Z",
      },
    }),
    frontmatter: {
      title: "Second Post",
      slug: "second-post",
      status: "published",
      publishedAt: "2025-01-10T10:00:00.000Z",
      excerpt: "Second post excerpt",
      author: "Jane Smith",
      seriesName: "Test Series",
    },
    body: "Content 2",
  },
];

function generateFeed(
  posts: BlogPostWithData[] = samplePosts,
  configOverrides: Record<string, string> = {},
): string {
  return generateRSSFeed(posts, { ...defaultFeedConfig, ...configOverrides });
}

describe("RSS Feed Generator", () => {
  describe("basic feed generation", () => {
    test("should generate valid RSS 2.0 XML", () => {
      const xml = generateFeed();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain("</rss>");
    });

    test("should include channel metadata", () => {
      const xml = generateFeed(samplePosts, { language: "en-us" });

      expect(xml).toContain("<title>My Blog</title>");
      expect(xml).toContain("<description>Blog description</description>");
      expect(xml).toContain("<link>https://example.com</link>");
      expect(xml).toContain("<language>en-us</language>");
    });

    test("should include atom:link for feed discovery", () => {
      const xml = generateFeed();

      expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
      expect(xml).toContain(
        '<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>',
      );
    });

    test("should default language to en-us", () => {
      const xml = generateFeed();

      expect(xml).toContain("<language>en-us</language>");
    });
  });

  describe("post items", () => {
    test("should include all published posts", () => {
      const xml = generateFeed();

      expect(xml).toContain("<title>First Post</title>");
      expect(xml).toContain("<title>Second Post</title>");
    });

    test("should filter out draft posts", () => {
      const draftContent =
        "---\ntitle: Draft\nslug: draft-post\n---\nDraft content";
      const postsWithDraft: BlogPostWithData[] = [
        ...samplePosts,
        {
          ...createTestEntity("post", {
            id: "draft-post",
            content: draftContent,
            metadata: {
              title: "Draft Post",
              slug: "draft-post",
              status: "draft",
            },
          }),
          frontmatter: {
            title: "Draft Post",
            slug: "draft-post",
            status: "draft",
            excerpt: "Draft excerpt",
            author: "Author",
          },
          body: "Draft content",
        },
      ];

      const xml = generateFeed(postsWithDraft);

      expect(xml).not.toContain("<title>Draft Post</title>");
    });

    test("should sort posts by publication date (newest first)", () => {
      const xml = generateFeed();

      const firstPostIndex = xml.indexOf("<title>First Post</title>");
      const secondPostIndex = xml.indexOf("<title>Second Post</title>");

      expect(firstPostIndex).toBeLessThan(secondPostIndex);
    });

    test("should include post links with correct URLs", () => {
      const xml = generateFeed();

      expect(xml).toContain(
        "<link>https://example.com/posts/first-post</link>",
      );
      expect(xml).toContain(
        "<link>https://example.com/posts/second-post</link>",
      );
    });

    test("should include guid with isPermaLink=true", () => {
      const xml = generateFeed();

      expect(xml).toContain(
        '<guid isPermaLink="true">https://example.com/posts/first-post</guid>',
      );
    });

    test("should include post descriptions from excerpt", () => {
      const xml = generateFeed();

      expect(xml).toContain("<description>First post excerpt</description>");
      expect(xml).toContain("<description>Second post excerpt</description>");
    });

    test("should include post authors", () => {
      const xml = generateFeed();

      expect(xml).toContain("<author>John Doe</author>");
      expect(xml).toContain("<author>Jane Smith</author>");
    });

    test("should include pubDate in RFC 822 format", () => {
      const xml = generateFeed();

      expect(xml).toContain("<pubDate>");
      expect(xml).toContain("GMT</pubDate>");
    });

    test("should include full content in content:encoded", () => {
      const xml = generateFeed();

      expect(xml).toContain(
        "<content:encoded><![CDATA[Content 1]]></content:encoded>",
      );
      expect(xml).toContain(
        "<content:encoded><![CDATA[Content 2]]></content:encoded>",
      );
    });

    test("should include content namespace in RSS element", () => {
      const xml = generateFeed();

      expect(xml).toContain(
        'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
      );
    });
  });

  describe("series support", () => {
    test("should include series as category tag", () => {
      const xml = generateFeed();

      expect(xml).toContain("<category>Test Series</category>");
    });

    test("should not include category tag for posts without series", () => {
      const firstPost = samplePosts[0];
      if (!firstPost) throw new Error("First post not found");

      const xml = generateFeed([firstPost]);

      expect(xml).not.toContain("<category>");
    });
  });

  describe("optional channel fields", () => {
    test("should include copyright when provided", () => {
      const xml = generateFeed(samplePosts, {
        copyright: "\u00a9 2025 My Blog",
      });

      expect(xml).toContain("<copyright>\u00a9 2025 My Blog</copyright>");
    });

    test("should not include copyright when not provided", () => {
      const xml = generateFeed();

      expect(xml).not.toContain("<copyright>");
    });

    test("should include managingEditor when provided", () => {
      const xml = generateFeed(samplePosts, {
        managingEditor: "editor@example.com",
      });

      expect(xml).toContain(
        "<managingEditor>editor@example.com</managingEditor>",
      );
    });

    test("should include webMaster when provided", () => {
      const xml = generateFeed(samplePosts, {
        webMaster: "webmaster@example.com",
      });

      expect(xml).toContain("<webMaster>webmaster@example.com</webMaster>");
    });
  });

  describe("XML escaping", () => {
    test("should escape special XML characters in titles", () => {
      const firstPost = samplePosts[0];
      if (!firstPost) throw new Error("First post not found");

      const postsWithSpecialChars: BlogPostWithData[] = [
        {
          ...firstPost,
          frontmatter: {
            ...firstPost.frontmatter,
            title: 'Post with <HTML> & "quotes"',
          },
        },
      ];

      const xml = generateFeed(postsWithSpecialChars);

      expect(xml).toContain("&lt;HTML&gt;");
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&quot;");
    });

    test("should escape special characters in descriptions", () => {
      const firstPost = samplePosts[0];
      if (!firstPost) throw new Error("First post not found");

      const postsWithSpecialChars: BlogPostWithData[] = [
        {
          ...firstPost,
          frontmatter: {
            ...firstPost.frontmatter,
            excerpt: "Excerpt with <tags> & symbols",
          },
        },
      ];

      const xml = generateFeed(postsWithSpecialChars);

      expect(xml).toContain(
        "<description>Excerpt with &lt;tags&gt; &amp; symbols</description>",
      );
    });
  });

  describe("lastBuildDate", () => {
    test("should set lastBuildDate to latest post publication date", () => {
      const xml = generateFeed();

      expect(xml).toContain("<lastBuildDate>");
      expect(xml).toContain("15 Jan 2025");
    });

    test("should use current date when no posts", () => {
      const xml = generateFeed([]);

      expect(xml).toContain("<lastBuildDate>");
    });
  });

  describe("empty feed", () => {
    test("should generate valid feed with no items", () => {
      const xml = generateFeed([]);

      expect(xml).toContain("<channel>");
      expect(xml).not.toContain("<item>");
    });
  });
});
