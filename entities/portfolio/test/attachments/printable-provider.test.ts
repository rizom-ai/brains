import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { PortfolioPlugin } from "../../src/plugin";
import { ProjectPrintableAttachmentProvider } from "../../src/attachments/printable-provider";
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
  beforeEach(() => {
    AttachmentRegistry.resetInstance();
  });

  it("registers a project printable attachment provider", async () => {
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("project", "printable")).toBe(true);
  });

  it("resolves a project into a printable PDF attachment", async () => {
    const renderPdf = mock(async (url: string) => {
      expect(url).toContain("/_media/printable/project/project-1/");
      const html = await (await fetch(url)).text();
      expect(html).toContain("Civic Signals");
      expect(html).toContain("City teams needed a shared view");
      expect(html).toContain("https://example.com/projects/civic-signals");
      return Buffer.from("%PDF-project-printable");
    });
    const harness = createPluginHarness<PortfolioPlugin>();
    await harness.installPlugin(new PortfolioPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProject });

    const provider = new ProjectPrintableAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { renderPdf },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "project",
      sourceEntityId: "project-1",
      attachmentType: "printable",
    });

    expect(renderPdf).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "document",
      data: Buffer.from("%PDF-project-printable"),
      mimeType: "application/pdf",
      filename: "civic-signals-printable.pdf",
    });
  });
});
