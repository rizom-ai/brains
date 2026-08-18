import { beforeEach, describe, expect, it, mock } from "bun:test";
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
  beforeEach(() => {});

  it("registers a post printable attachment provider", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(postEntityPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("post", "printable")).toBe(true);
  });

  it("returns undefined for non-printable requests", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(postEntityPlugin());
    await harness.getEntityService().createEntity({ entity: samplePost });

    const provider = createBlogPrintableProvider({
      entityService: harness.getEntityService(),
      themeCSS: "",
      identity: harness.getEntityContext("test").identity,
      domain: undefined,
    });

    const attachment = await provider.resolve({
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      attachmentType: "carousel",
    });

    expect(attachment).toBeUndefined();
  });

  it("resolves a blog post into a printable PDF attachment", async () => {
    const renderPdf = mock(async (url: string) => {
      expect(url).toContain("/_media/printable/post/post-1/");
      const html = await (await fetch(url)).text();
      expect(html).toContain("Resilience Is Not Redundancy");
      expect(html).toContain("Core idea");
      expect(html).toContain(
        "https://example.com/posts/resilience-is-not-redundancy",
      );
      expect(html).toContain('meta name="robots" content="noindex,nofollow"');
      expect(
        normalizeRendererHtml(html, { ignoreImagePreloads: true }),
      ).toMatchSnapshot();
      return Buffer.from("%PDF-post-printable");
    });
    const harness = createPluginHarness();
    await harness.installPlugin(postEntityPlugin());
    await harness.getEntityService().createEntity({ entity: samplePost });

    const provider = createBlogPrintableProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: ":root { --print-test-token: #123456; }",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { renderPdf },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      attachmentType: "printable",
    });

    expect(renderPdf).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "document",
      data: Buffer.from("%PDF-post-printable"),
      mimeType: "application/pdf",
      filename: "resilience-is-not-redundancy-printable.pdf",
    });
  });
});
