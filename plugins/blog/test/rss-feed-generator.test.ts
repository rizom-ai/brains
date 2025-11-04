import { describe, expect, test } from "bun:test";
import { generateRSSFeed } from "../src/rss/feed-generator";
import type { BlogPostWithData } from "../src/datasources/blog-datasource";

describe("RSS Feed Generator", () => {
  const samplePosts: BlogPostWithData[] = [
    {
      id: "post-1",
      entityType: "post",
      content: "---\ntitle: First Post\n---\nContent 1",
      created: "2025-01-01T10:00:00.000Z",
      updated: "2025-01-01T10:00:00.000Z",
      metadata: {
        title: "First Post",
        status: "published",
        publishedAt: "2025-01-15T10:00:00.000Z",
      },
      frontmatter: {
        title: "First Post",
        status: "published",
        publishedAt: "2025-01-15T10:00:00.000Z",
        excerpt: "First post excerpt",
        author: "John Doe",
      },
      body: "Content 1",
    },
    {
      id: "post-2",
      entityType: "post",
      content: "---\ntitle: Second Post\n---\nContent 2",
      created: "2025-01-02T10:00:00.000Z",
      updated: "2025-01-02T10:00:00.000Z",
      metadata: {
        title: "Second Post",
        status: "published",
        publishedAt: "2025-01-10T10:00:00.000Z",
      },
      frontmatter: {
        title: "Second Post",
        status: "published",
        publishedAt: "2025-01-10T10:00:00.000Z",
        excerpt: "Second post excerpt",
        author: "Jane Smith",
        seriesName: "Test Series",
      },
      body: "Content 2",
    },
  ];

  describe("basic feed generation", () => {
    test("should generate valid RSS 2.0 XML", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<rss version="2.0"');
      expect(xml).toContain("</rss>");
    });

    test("should include channel metadata", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
        language: "en-us",
      });

      expect(xml).toContain("<title>My Blog</title>");
      expect(xml).toContain("<description>Blog description</description>");
      expect(xml).toContain("<link>https://example.com</link>");
      expect(xml).toContain("<language>en-us</language>");
    });

    test("should include atom:link for feed discovery", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
      expect(xml).toContain(
        '<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>',
      );
    });

    test("should default language to en-us", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<language>en-us</language>");
    });
  });

  describe("post items", () => {
    test("should include all published posts", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<title>First Post</title>");
      expect(xml).toContain("<title>Second Post</title>");
    });

    test("should filter out draft posts", () => {
      const postsWithDraft: BlogPostWithData[] = [
        ...samplePosts,
        {
          id: "draft-post",
          entityType: "post",
          content: "---\ntitle: Draft\n---\nDraft content",
          created: "2025-01-03T10:00:00.000Z",
          updated: "2025-01-03T10:00:00.000Z",
          metadata: {
            title: "Draft Post",
            status: "draft",
          },
          frontmatter: {
            title: "Draft Post",
            status: "draft",
            excerpt: "Draft excerpt",
            author: "Author",
          },
          body: "Draft content",
        },
      ];

      const xml = generateRSSFeed(postsWithDraft, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).not.toContain("<title>Draft Post</title>");
    });

    test("should sort posts by publication date (newest first)", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      const firstPostIndex = xml.indexOf("<title>First Post</title>");
      const secondPostIndex = xml.indexOf("<title>Second Post</title>");

      // First Post (Jan 15) should appear before Second Post (Jan 10)
      expect(firstPostIndex).toBeLessThan(secondPostIndex);
    });

    test("should include post links with correct URLs", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<link>https://example.com/posts/post-1</link>");
      expect(xml).toContain("<link>https://example.com/posts/post-2</link>");
    });

    test("should include guid with isPermaLink=true", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain(
        '<guid isPermaLink="true">https://example.com/posts/post-1</guid>',
      );
    });

    test("should include post descriptions from excerpt", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<description>First post excerpt</description>");
      expect(xml).toContain("<description>Second post excerpt</description>");
    });

    test("should include post authors", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<author>John Doe</author>");
      expect(xml).toContain("<author>Jane Smith</author>");
    });

    test("should include pubDate in RFC 822 format", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      // RFC 822 format: "Wed, 15 Jan 2025 10:00:00 GMT"
      expect(xml).toContain("<pubDate>");
      expect(xml).toContain("GMT</pubDate>");
    });

    test("should include full content in content:encoded", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain(
        "<content:encoded><![CDATA[Content 1]]></content:encoded>",
      );
      expect(xml).toContain(
        "<content:encoded><![CDATA[Content 2]]></content:encoded>",
      );
    });

    test("should include content namespace in RSS element", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain(
        'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
      );
    });
  });

  describe("series support", () => {
    test("should include series as category tag", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<category>Test Series</category>");
    });

    test("should not include category tag for posts without series", () => {
      const firstPost = samplePosts[0];
      if (!firstPost) throw new Error("First post not found");

      const xml = generateRSSFeed([firstPost], {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).not.toContain("<category>");
    });
  });

  describe("optional channel fields", () => {
    test("should include copyright when provided", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
        copyright: "© 2025 My Blog",
      });

      expect(xml).toContain("<copyright>© 2025 My Blog</copyright>");
    });

    test("should not include copyright when not provided", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).not.toContain("<copyright>");
    });

    test("should include managingEditor when provided", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
        managingEditor: "editor@example.com",
      });

      expect(xml).toContain(
        "<managingEditor>editor@example.com</managingEditor>",
      );
    });

    test("should include webMaster when provided", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
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

      const xml = generateRSSFeed(postsWithSpecialChars, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

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

      const xml = generateRSSFeed(postsWithSpecialChars, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain(
        "<description>Excerpt with &lt;tags&gt; &amp; symbols</description>",
      );
    });
  });

  describe("lastBuildDate", () => {
    test("should set lastBuildDate to latest post publication date", () => {
      const xml = generateRSSFeed(samplePosts, {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<lastBuildDate>");
      // Should use the newest post (Jan 15)
      expect(xml).toContain("15 Jan 2025");
    });

    test("should use current date when no posts", () => {
      const xml = generateRSSFeed([], {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<lastBuildDate>");
    });
  });

  describe("empty feed", () => {
    test("should generate valid feed with no items", () => {
      const xml = generateRSSFeed([], {
        title: "My Blog",
        description: "Blog description",
        link: "https://example.com",
      });

      expect(xml).toContain("<channel>");
      expect(xml).not.toContain("<item>");
    });
  });
});
