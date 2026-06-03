import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { PortfolioPlugin } from "../../src/plugin";
import { ProjectOgImageAttachmentProvider } from "../../src/attachments/og-image-provider";
import type { Project } from "../../src/schemas/project";

const sampleProject: Project = {
  id: "project-1",
  entityType: "project",
  visibility: "public",
  contentHash: "project-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  content: `---
title: Civic Signals
slug: civic-signals
status: published
publishedAt: 2024-02-01T00:00:00.000Z
description: A civic data project for surfacing slow infrastructure signals.
year: 2024
url: https://example.com/projects/civic-signals
---
## Context

City teams needed a shared view of maintenance patterns.
`,
  metadata: {
    title: "Civic Signals",
    slug: "civic-signals",
    status: "published",
    publishedAt: "2024-02-01T00:00:00.000Z",
    year: 2024,
  },
};

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Project OG image attachment provider", () => {
  beforeEach(() => {
    AttachmentRegistry.resetInstance();
  });

  it("registers a project OG image attachment provider", async () => {
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("project", "og-image")).toBe(true);
  });

  it("resolves a project into a PNG OG image attachment", async () => {
    const screenshotPng = mock(async (url: string, viewport) => {
      expect(url).toContain("/_media/og/project/project-1/");
      expect(viewport).toEqual({ width: 1200, height: 630 });
      const html = await (await fetch(url)).text();
      expect(html).toContain("Civic Signals");
      expect(html).toContain("slow infrastructure signals");
      return TINY_PNG;
    });
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProject });

    const provider = new ProjectOgImageAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { screenshotPng },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "project",
      sourceEntityId: "project-1",
      attachmentType: "og-image",
    });

    expect(screenshotPng).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "image",
      data: TINY_PNG,
      mimeType: "image/png",
      filename: "civic-signals-og.png",
    });
  });
});
