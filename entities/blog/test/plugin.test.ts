import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { BlogPost } from "../src/schemas/blog-post";
import {
  blogPostFrontmatterSchema,
  blogPostMetadataSchema,
} from "../src/schemas/blog-post";
import type { EntityAdapter } from "@brains/plugins";
import { createSilentLogger, createTestEntity } from "@brains/test-utils";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import { postEntityPlugin, PACKAGE_METADATA } from "./helpers/install";

describe("blog package", () => {
  it("produces an entity plugin scoped to the package", () => {
    const plugin = postEntityPlugin();
    expect(plugin.id).toBe(`${PACKAGE_METADATA.name}:post`);
    expect(plugin.type).toBe("entity");
    expect(plugin.version).toBe(PACKAGE_METADATA.version);
  });

  // system_generate refuses an entity type whose adapter cannot build a
  // placeholder, so converting the package to a declaration took blog post
  // generation away entirely until `stub` was declared.
  it("offers a placeholder that satisfies its own metadata schema", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("blog-stub-test"),
    });
    await harness.installPlugin(postEntityPlugin());
    // The same route system_generate takes to reach it.
    const adapter = harness.getEntityRegistry().getAdapter("post");
    const buildStub = adapter.buildStub;
    if (!buildStub) {
      throw new Error("Expected the post adapter to build a stub");
    }

    const stub = buildStub({ id: "how-to-fish", title: "How To Fish" });

    expect(blogPostMetadataSchema.parse(stub.metadata)).toEqual({
      title: "How To Fish",
      slug: "how-to-fish",
      status: "generating",
    });
    // The runtime writes this markdown straight to the entity, so it has to
    // survive being read back through the codec that produced it.
    expect(adapter.fromMarkdown(stub.content).metadata).toMatchObject({
      slug: "how-to-fish",
      status: "generating",
    });

    harness.reset();
  });

  it("registers templates that point at data sources it declares", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("blog-datasource-test"),
    });
    await harness.installPlugin(postEntityPlugin());

    expectTemplateDataSourcesResolve(harness);

    harness.reset();
  });

  describe("blogPostFrontmatterSchema", () => {
    it("rejects an empty-string publishedAt, so list templates can use ?? to fall back to created", () => {
      const base = {
        title: "Post",
        status: "draft",
        excerpt: "Excerpt",
        author: "Author",
      };
      expect(
        blogPostFrontmatterSchema.safeParse({ ...base, publishedAt: "" })
          .success,
      ).toBe(false);
      expect(blogPostFrontmatterSchema.safeParse(base).success).toBe(true);
    });
  });

  // These round-trips used to be asserted against BlogPostAdapter's own
  // toMarkdown/fromMarkdown. The declarative entity builds its adapter from
  // the `markdown` codec on `post`, so the class's copies stopped running
  // when the package converted. The behaviour is real; it belongs to
  // whichever adapter the registry hands out.
  describe("the post markdown codec", () => {
    let adapter: EntityAdapter<BlogPost>;
    let harness: ReturnType<typeof createPluginHarness>;

    beforeEach(async () => {
      harness = createPluginHarness({
        logger: createSilentLogger("blog-codec-test"),
      });
      await harness.installPlugin(postEntityPlugin());
      adapter = harness.getEntityRegistry().getAdapter<BlogPost>("post");
    });

    afterEach(() => {
      harness.reset();
    });

    it("carries frontmatter the metadata does not index", () => {
      const markdown = [
        "---",
        "title: Another Blog Post",
        "slug: another-blog-post",
        "status: published",
        'publishedAt: "2025-01-30T12:00:00.000Z"',
        "excerpt: Another excerpt",
        "author: Jane Doe",
        "---",
        "",
        "This is another blog post.",
      ].join("\n");

      const parsed = adapter.fromMarkdown(markdown);

      expect(parsed.metadata).toMatchObject({
        title: "Another Blog Post",
        slug: "another-blog-post",
        status: "published",
        publishedAt: "2025-01-30T12:00:00.000Z",
      });
      // Author and excerpt live in the content, not the index.
      expect("author" in (parsed.metadata ?? {})).toBe(false);
      expect("excerpt" in (parsed.metadata ?? {})).toBe(false);
    });

    it("derives a slug from the title when the frontmatter has none", () => {
      const parsed = adapter.fromMarkdown(
        [
          "---",
          "title: No Slug Here",
          "status: draft",
          "excerpt: e",
          "author: A",
          "---",
          "",
          "Body",
        ].join("\n"),
      );

      expect(parsed.metadata?.["slug"]).toBe("no-slug-here");
    });

    it("indexes series placement", () => {
      const parsed = adapter.fromMarkdown(
        [
          "---",
          "title: Part One",
          "status: published",
          "excerpt: e",
          "author: A",
          "seriesName: Foundations",
          "seriesIndex: 1",
          "---",
          "",
          "Body",
        ].join("\n"),
      );

      expect(parsed.metadata).toMatchObject({
        seriesName: "Foundations",
        seriesIndex: 1,
      });
    });

    it("survives a round trip through markdown and back", () => {
      const original = [
        "---",
        "title: Round Trip",
        "status: published",
        'publishedAt: "2025-02-01T00:00:00.000Z"',
        "excerpt: An excerpt",
        "author: Jane Doe",
        "coverImageId: image-1",
        "---",
        "",
        "The body.",
      ].join("\n");

      const parsed = adapter.fromMarkdown(original);
      if (!parsed.metadata) {
        throw new Error("The codec returned an incomplete post");
      }
      // A stored post holds the full markdown, frontmatter included — that
      // is what createPostContent writes and what the entity service keeps.
      const entity = createTestEntity<BlogPost>("post", {
        id: "round-trip",
        content: original,
        metadata: parsed.metadata,
      });
      const written = adapter.toMarkdown(entity);

      expect(adapter.fromMarkdown(written).metadata).toEqual(parsed.metadata);
      // Frontmatter the codec does not index is carried forward, not dropped.
      expect(written).toContain("coverImageId: image-1");
      expect(written).toContain("author: Jane Doe");
    });
  });
});
