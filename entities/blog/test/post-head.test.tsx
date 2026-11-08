import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HeadProps } from "@brains/contracts";
import { HeadProvider } from "@rizom/brain-ui/internal";
import { BlogPostTemplate } from "../src/templates/blog-post";
import {
  blogViewSchema,
  type BlogPostView,
} from "../src/templates/blog-view-schema";

function view(canonicalUrl: string | null): BlogPostView {
  const parsed = blogViewSchema.parse({
    id: "on-slowness",
    entityType: "post",
    content: "",
    created: "2026-01-02T00:00:00.000Z",
    updated: "2026-01-02T00:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    body: "Text.",
    metadata: {
      title: "On slowness",
      status: "published",
      slug: "on-slowness",
      publishedAt: "2025-03-12T00:00:00.000Z",
    },
    frontmatter: {
      title: "On slowness",
      status: "published",
      excerpt: "Excerpt",
      author: "Writer",
      canonicalUrl,
    },
  });
  return {
    ...parsed,
    url: "/essays/on-slowness",
    typeLabel: "Essay",
    listUrl: "/essays",
    listLabel: "Essays",
  };
}

function renderHead(post: BlogPostView): HeadProps | undefined {
  let collected: HeadProps | undefined;
  renderToStaticMarkup(
    <HeadProvider
      headCollector={{
        setHeadProps: (props): void => {
          collected = props;
        },
      }}
    >
      <BlogPostTemplate
        post={post}
        prevPost={null}
        nextPost={null}
        seriesPosts={null}
      />
    </HeadProvider>,
  );
  return collected;
}

describe("post page head", () => {
  it("names the original address as canonical when the post has one", () => {
    expect(
      renderHead(view("https://example.substack.com/p/on-slowness")),
    ).toMatchObject({
      canonicalUrl: "https://example.substack.com/p/on-slowness",
    });
  });

  it("leaves the canonical link to the site when the post has none", () => {
    expect(renderHead(view(null))?.canonicalUrl).toBeUndefined();
  });
});
