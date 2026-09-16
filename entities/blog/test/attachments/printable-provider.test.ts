import { describe, expect, it, spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import { normalizeRendererHtml } from "@brains/test-utils";
import { BlogPlugin } from "../../src/plugin";
import { createBlogPrintableProvider } from "../../src/attachments/printable-provider";
import type { BlogPost } from "../../src/schemas/blog-post";

const samplePost: BlogPost = {
  id: "post-1",
  entityType: "post",
  visibility: "public",
  contentHash: "post-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  content: `---
title: Resilience Is Not Redundancy
slug: resilience-is-not-redundancy
status: published
publishedAt: 2024-01-15T00:00:00.000Z
excerpt: Resilience is about adaptive systems, not duplicated parts.
author: Alex Chen
canonicalUrl: https://example.com/posts/resilience-is-not-redundancy
---
## Core idea

Resilience is the capacity to change shape under pressure.
`,
  metadata: {
    title: "Resilience Is Not Redundancy",
    slug: "resilience-is-not-redundancy",
    status: "published",
    publishedAt: "2024-01-15T00:00:00.000Z",
  },
};

describe("Blog printable attachment provider", () => {
  it("registers a post printable attachment provider", async () => {
    const harness = createPluginHarness<BlogPlugin>();
    await harness.installPlugin(new BlogPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("post", "printable")).toBe(true);
  });

  it("returns undefined for non-printable requests", async () => {
    const harness = createPluginHarness<BlogPlugin>();
    await harness.installPlugin(new BlogPlugin());
    await harness.getEntityService().createEntity({ entity: samplePost });

    const provider = createBlogPrintableProvider({
      entityService: harness.getEntityService(),
      themeCSS: "",
      identity: harness.getEntityContext("test").identity,
      domain: undefined,
    });

    const attachment = await provider.withFile(
      {
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
      },
      async (file) => file,
    );

    expect(attachment).toBeUndefined();
  });

  it("resolves a blog post into a printable PDF attachment", async () => {
    const inspectHtml = (html: string): void => {
      expect(html).toContain("Resilience Is Not Redundancy");
      expect(html).toContain("Core idea");
      expect(html).toContain(
        "https://example.com/posts/resilience-is-not-redundancy",
      );
      expect(html).toContain('meta name="robots" content="noindex,nofollow"');
      expect(
        normalizeRendererHtml(html, { ignoreImagePreloads: true }),
      ).toMatchSnapshot();
    };
    const harness = createPluginHarness<BlogPlugin>();
    await harness.installPlugin(new BlogPlugin());
    await harness.getEntityService().createEntity({ entity: samplePost });

    const service = harness.getEntityService();
    const unexpected = async (): Promise<never> => {
      throw new Error("Unexpected file operation");
    };
    service.fileAssets = {
      inspect: unexpected,
      publish: unexpected,
      withAssetFile: unexpected,
      download: unexpected,
      fingerprint: unexpected,
      close: async (): Promise<void> => undefined,
      withProducedFile: async (
        directory,
        use,
        options,
      ): ReturnType<typeof use> => {
        inspectHtml(await readFile(join(directory, "index.html"), "utf8"));
        expect(
          JSON.parse(await readFile(join(directory, "render.json"), "utf8")),
        ).toEqual({ format: "pdf" });
        return use(
          {
            sourceFile: join(directory, "printed.pdf"),
            sizeBytes: 8,
            sha256: "a".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
      },
    };
    spyOn(service.fileAssets, "withProducedFile");
    const provider = createBlogPrintableProvider({
      entityService: harness.getEntityService(),
      themeCSS: ":root { --print-test-token: #123456; }",
      identity: harness.getEntityContext("test").identity,
      domain: "example.com",
    });

    const attachment = await provider.withFile(
      {
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "printable",
      },
      async (file) => file,
    );

    expect(service.fileAssets.withProducedFile).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "document",
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
      sha256: "a".repeat(64),
      mimeType: "application/pdf",
      filename: "resilience-is-not-redundancy-printable.pdf",
    });
  });
});
