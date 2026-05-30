import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createProjectAtprotoProjection } from "../src/atproto-projection";
import { PortfolioPlugin } from "../src/plugin";
import type { Project } from "../src/schemas/project";

const project: Project = {
  id: "project-1",
  entityType: "project",
  content:
    "---\ntitle: Network Atlas\nslug: network-atlas\nstatus: published\npublishedAt: 2026-05-28T10:00:00.000Z\ndescription: A public case study.\nyear: 2026\nurl: https://example.com/network-atlas\n---\n## Context\n\nA project body.",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Network Atlas",
    slug: "network-atlas",
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
    year: 2026,
  },
};

describe("project ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps projects to ai.rizom.brain.project records", async () => {
    const projection = createProjectAtprotoProjection();

    const record = await projection.buildRecord({
      entity: project,
      context: createPluginHarness().getServiceContext("portfolio"),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.project",
      title: "Network Atlas",
      slug: "network-atlas",
      description: "A public case study.",
      body: "## Context\n\nA project body.",
      format: "text/markdown",
      year: 2026,
      url: "https://example.com/network-atlas",
      publishedAt: "2026-05-28T10:00:00.000Z",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "project",
      sourceEntityId: "project-1",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("registers the project projection when the portfolio plugin registers", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-project-atproto",
    });
    await harness.installPlugin(new PortfolioPlugin({}));

    const projection = AtprotoProjectionRegistry.getInstance().get("project");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.project");
  });
});
