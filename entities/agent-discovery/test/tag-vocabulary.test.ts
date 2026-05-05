import { describe, expect, it } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { createMockEntityService } from "@brains/test-utils";
import { AgentAdapter } from "../src/adapters/agent-adapter";
import {
  collectTagVocabulary,
  formatVocabularyForPrompt,
  normalizeTag,
  normalizeTags,
} from "../src/lib/tag-vocabulary";

const agentAdapter = new AgentAdapter();

describe("tag vocabulary", () => {
  it("should normalize and dedupe tags conservatively", () => {
    expect(normalizeTag("  Academic Research  ")).toBe("academic-research");
    expect(
      normalizeTags([" Research ", "research", "RESEARCH", "data analysis"]),
    ).toEqual(["research", "data-analysis"]);
  });

  it("should collect tag counts across skill and agent entities", async () => {
    const agentEntities = [
      {
        id: "kai.brain",
        entityType: "agent" as const,
        content: agentAdapter.createAgentContent({
          name: "Kai",
          kind: "professional",
          brainName: "kai.brain",
          url: "https://kai.brain",
          status: "approved",
          discoveredAt: "2026-04-20T00:00:00.000Z",
          about: "Research partner.",
          skills: [
            {
              name: "Citation Work",
              description: "Find and connect sources",
              tags: [" Research ", "Citations", "research"],
            },
          ],
          notes: "",
        }),
        contentHash: "agent-1",
        created: "2026-04-20T00:00:00.000Z",
        updated: "2026-04-20T00:00:00.000Z",
        metadata: {
          name: "Kai",
          url: "https://kai.brain",
          status: "approved" as const,
          discoveredAt: "2026-04-20T00:00:00.000Z",
          slug: "kai-brain",
        },
      },
      {
        id: "north.ops",
        entityType: "agent" as const,
        content: agentAdapter.createAgentContent({
          name: "North",
          kind: "team",
          brainName: "north.ops",
          url: "https://north.ops",
          status: "approved",
          discoveredAt: "2026-04-21T00:00:00.000Z",
          about: "Operations team.",
          skills: [
            {
              name: "Ops",
              description: "Maintain runbooks",
              tags: ["operations", "Citations"],
            },
          ],
          notes: "",
        }),
        contentHash: "agent-2",
        created: "2026-04-21T00:00:00.000Z",
        updated: "2026-04-21T00:00:00.000Z",
        metadata: {
          name: "North",
          url: "https://north.ops",
          status: "approved" as const,
          discoveredAt: "2026-04-21T00:00:00.000Z",
          slug: "north-ops",
        },
      },
    ];

    const skillEntities = [
      {
        id: "research-writing",
        entityType: "skill" as const,
        content: "",
        contentHash: "skill-1",
        created: "2026-04-20T00:00:00.000Z",
        updated: "2026-04-20T00:00:00.000Z",
        metadata: {
          name: "Research & Writing",
          description: "Create synthesis from sources",
          tags: ["Research", "Writing", "research"],
          examples: [],
        },
      },
      {
        id: "ops",
        entityType: "skill" as const,
        content: "",
        contentHash: "skill-2",
        created: "2026-04-20T00:00:00.000Z",
        updated: "2026-04-20T00:00:00.000Z",
        metadata: {
          name: "Operations",
          description: "Run operational routines",
          tags: ["operations"],
          examples: [],
        },
      },
    ];

    const context = {
      entityService: createMockEntityService({
        listEntitiesImpl: async (request: { entityType: string }) => {
          if (request.entityType === "agent") return agentEntities;
          if (request.entityType === "skill") return skillEntities;
          return [];
        },
      }),
    } as EntityPluginContext;

    const vocabulary = await collectTagVocabulary(context, {
      minCount: 1,
      topN: 10,
    });

    expect(vocabulary).toEqual([
      { tag: "citations", count: 2 },
      { tag: "operations", count: 2 },
      { tag: "research", count: 2 },
      { tag: "writing", count: 1 },
    ]);
  });

  it("should format vocabulary for the derivation prompt", () => {
    expect(
      formatVocabularyForPrompt([
        { tag: "research", count: 3 },
        { tag: "operations", count: 2 },
      ]),
    ).toContain("- research (3)");

    expect(formatVocabularyForPrompt([])).toBe("");
  });
});
