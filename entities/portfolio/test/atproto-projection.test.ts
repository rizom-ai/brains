import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { buildProjectAtprotoRecord } from "../src/atproto-projection";
import { portfolioPlugin } from "./portfolio-plugin";

// A project as a declared type reads it: its metadata and its body.
const project: Parameters<typeof buildProjectAtprotoRecord>[0]["entity"] = {
  id: "project-1",
  entityType: "project",
  content: "## Context\n\nA project body.",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Network Atlas",
    slug: "network-atlas",
    authoredSlug: true,
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
    description: "A public case study.",
    year: 2026,
    url: "https://example.com/network-atlas",
  },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildProjectAtprotoRecord>[0]> = {},
): Parameters<typeof buildProjectAtprotoRecord>[0] {
  return {
    entity: project,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("project ATProto projection", () => {
  it("maps projects to ai.rizom.brain.project records", async () => {
    const record = await buildProjectAtprotoRecord(
      recordInput({ config: { brainDid: "did:web:brain.example.com" } }),
    );

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

  it("names its page when the site gives the project one, and nothing otherwise", async () => {
    const placed = await buildProjectAtprotoRecord(
      recordInput({ pageUrl: "https://brain.example.com/projects/project-1" }),
    );
    expect(placed.canonicalUrl).toBe(
      "https://brain.example.com/projects/project-1",
    );
    const unplaced = await buildProjectAtprotoRecord(recordInput());
    expect(unplaced.canonicalUrl).toBeUndefined();
  });

  it("registers the project projection when the portfolio registers", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-project-atproto",
    });
    await harness.installPlugin(portfolioPlugin());

    const projection = harness
      .getMockShell()
      .getAtprotoProjectionRegistry()
      .get("project");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.project");
  });
});
