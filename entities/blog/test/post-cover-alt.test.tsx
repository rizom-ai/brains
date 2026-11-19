import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HeadProvider } from "@rizom/brain-ui/internal";
import { BlogPostTemplate } from "../src/templates/blog-post";
import {
  blogViewSchema,
  type BlogPostView,
} from "../src/templates/blog-view-schema";

function view(coverImageAlt: string | null): BlogPostView {
  const parsed = blogViewSchema.parse({
    id: "harbor-notes",
    entityType: "post",
    content: "",
    created: "2026-01-02T00:00:00.000Z",
    updated: "2026-01-02T00:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    body: "Text.",
    metadata: {
      title: "Harbor notes",
      status: "published",
      slug: "harbor-notes",
      publishedAt: "2025-03-12T00:00:00.000Z",
    },
    frontmatter: {
      title: "Harbor notes",
      status: "published",
      excerpt: "Excerpt",
      author: "Writer",
    },
    coverImageUrl: "/images/harbor.png",
    coverImageWidth: 800,
    coverImageHeight: 600,
    coverImageAlt,
  });
  return {
    ...parsed,
    url: "/essays/harbor-notes",
    typeLabel: "Essay",
    listUrl: "/essays",
    listLabel: "Essays",
  };
}

function coverAlt(post: BlogPostView): string | undefined {
  const html = renderToStaticMarkup(
    <HeadProvider headCollector={{ setHeadProps: (): void => {} }}>
      <BlogPostTemplate
        post={post}
        prevPost={null}
        nextPost={null}
        seriesPosts={null}
      />
    </HeadProvider>,
  );
  return /<img[^>]*src="\/images\/harbor\.png"[^>]*alt="([^"]*)"/.exec(
    html,
  )?.[1];
}

describe("a post's cover image", () => {
  it("says what the image shows when the image is described", () => {
    expect(coverAlt(view("Fishing boats moored at dawn"))).toBe(
      "Fishing boats moored at dawn",
    );
  });

  it("falls back to the post's title when it is not", () => {
    expect(coverAlt(view(null))).toBe("Harbor notes");
  });
});
