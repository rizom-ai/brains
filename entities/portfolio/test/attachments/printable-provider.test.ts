import { describe, expect, it, spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import { PortfolioPlugin } from "../../src/plugin";
import { createProjectPrintableProvider } from "../../src/attachments/printable-provider";
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

## Problem

Signals were spread across disconnected systems.

## Solution

We built a lightweight knowledge interface.

## Outcome

Teams spotted patterns earlier.
`,
  metadata: {
    title: "Civic Signals",
    slug: "civic-signals",
    status: "published",
    publishedAt: "2024-02-01T00:00:00.000Z",
    year: 2024,
  },
};

describe("Project printable attachment provider", () => {
  it("registers a project printable attachment provider", async () => {
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("project", "printable")).toBe(true);
  });

  it("resolves a project into a printable PDF attachment", async () => {
    const inspectHtml = (html: string): void => {
      expect(html).toContain("Civic Signals");
      expect(html).toContain("City teams needed a shared view");
      expect(html).toContain("https://example.com/projects/civic-signals");
    };
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProject });

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
    const provider = createProjectPrintableProvider({
      entityService: harness.getEntityService(),
      themeCSS: "",
      identity: harness.getEntityContext("test").identity,
      domain: "example.com",
    });

    const attachment = await provider.withFile(
      {
        sourceEntityType: "project",
        sourceEntityId: "project-1",
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
      filename: "civic-signals-printable.pdf",
    });
  });
});
