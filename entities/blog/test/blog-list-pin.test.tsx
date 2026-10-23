import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogListTemplate } from "../src/templates/blog-list";
import {
  blogViewSchema,
  type BlogPostView,
} from "../src/templates/blog-view-schema";

/**
 * Pins the essay archive markup, so sharing its post-to-item mapping with
 * site homepages cannot change a single byte of it.
 */

const post = (
  id: string,
  overrides: {
    publishedAt?: string | null;
    seriesName?: string | null;
    seriesIndex?: number | null;
  } = {},
): BlogPostView => {
  const parsed = blogViewSchema.parse({
    id,
    entityType: "post",
    content: "",
    created: "2026-01-02T00:00:00.000Z",
    updated: "2026-01-02T00:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    body: "",
    metadata: {
      title: `Title ${id}`,
      status: "published",
      slug: id,
      publishedAt: overrides.publishedAt ?? null,
    },
    frontmatter: {
      title: `Title ${id}`,
      status: "published",
      excerpt: `Excerpt ${id}`,
      author: "Jan Hein Hoogstad",
      seriesName: overrides.seriesName ?? null,
      seriesIndex: overrides.seriesIndex ?? null,
    },
  });
  return {
    ...parsed,
    url: `/essays/${id}`,
    typeLabel: "Essay",
    listUrl: "/essays",
    listLabel: "Essays",
  };
};

const posts: BlogPostView[] = [
  post("standalone", { publishedAt: "2026-03-04T00:00:00.000Z" }),
  post("in-series", {
    publishedAt: "2026-02-03T00:00:00.000Z",
    seriesName: "New Institutions",
    seriesIndex: 2,
  }),
  post("unpublished-date"),
  post("series-without-index", { seriesName: "Orphaned" }),
];

describe("blog list pin", () => {
  it("renders the essay archive", () => {
    expect(
      renderToStaticMarkup(
        <BlogListTemplate
          posts={posts}
          pageTitle={null}
          pageLabel={null}
          pagination={null}
          baseUrl="/essays"
        />,
      ),
    ).toMatchSnapshot();
  });
});
