import { describe, expect, it, spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import { PortfolioPlugin } from "../../src/plugin";
import { createProjectOgImageProvider } from "../../src/attachments/og-image-provider";
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

const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected file operation");
};

describe("Project OG image attachment provider", () => {
  it("registers a project OG image attachment provider", async () => {
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("project", "og-image")).toBe(true);
  });

  it("resolves a project into a PNG OG image attachment", async () => {
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProject });

    const service = harness.getEntityService();
    service.fileAssets = {
      inspect: unexpected,
      publish: unexpected,
      putHttp: unexpected,
      postHttp: unexpected,
      withAssetFile: unexpected,
      download: unexpected,
      fingerprint: unexpected,
      close: async (): Promise<void> => undefined,
      withProducedFile: async (
        directory,
        use,
        options,
      ): ReturnType<typeof use> => {
        const html = await readFile(join(directory, "index.html"), "utf8");
        expect(html).toContain("Civic Signals");
        expect(html).toContain("slow infrastructure signals");
        return use(
          {
            sourceFile: join(directory, "rendered.png"),
            sizeBytes: 8,
            sha256: "a".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
      },
    };
    spyOn(service.fileAssets, "withProducedFile");
    const provider = createProjectOgImageProvider({
      entityService: harness.getEntityService(),
      themeCSS: "",
      identity: harness.getEntityContext("test").identity,
      domain: "example.com",
    });

    const attachment = await provider.withFile(
      {
        sourceEntityType: "project",
        sourceEntityId: "project-1",
        attachmentType: "og-image",
      },
      async (file) => file,
    );

    expect(service.fileAssets.withProducedFile).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "image",
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
      sha256: "a".repeat(64),
      mimeType: "image/png",
      filename: "civic-signals-og.png",
    });
  });
});
