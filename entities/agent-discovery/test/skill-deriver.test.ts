import { describe, it, expect, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import type { EntityPluginContext } from "@brains/plugins";
import {
  buildSkillPrompt,
  deriveSkills,
  type SkillDeriverInput,
} from "../src/lib/skill-deriver";
import { SkillAdapter } from "../src/adapters/skill-adapter";
import type { SkillEntity, SkillFrontmatter } from "../src/schemas/skill";

const adapter = new SkillAdapter();
const now = "2026-04-30T00:00:00.000Z";

function skillEntity(id: string, metadata: SkillFrontmatter): SkillEntity {
  const content = adapter.createSkillContent(metadata);
  return {
    id,
    entityType: "skill",
    content,
    contentHash: "hash",
    created: now,
    updated: now,
    metadata,
  };
}

function contextForSkills(
  existingSkills: SkillEntity[],
  generatedSkills: SkillFrontmatter[],
): {
  context: EntityPluginContext;
  createEntity: ReturnType<typeof mock>;
  updateEntity: ReturnType<typeof mock>;
  deleteEntity: ReturnType<typeof mock>;
} {
  const createEntity = mock(async () => ({ entityId: "created", jobId: "" }));
  const updateEntity = mock(async () => ({ entityId: "updated", jobId: "" }));
  const deleteEntity = mock(async () => true);

  const context = {
    entityService: {
      listEntities: mock(async (request: { entityType: string }) => {
        if (request.entityType === "topic") {
          return [
            {
              id: "topic-1",
              entityType: "topic",
              content: "---\nname: Topic 1\n---\n",
              contentHash: "topic-hash",
              created: now,
              updated: now,
              metadata: { name: "Topic 1" },
            },
          ];
        }
        if (request.entityType === "skill") return existingSkills;
        if (request.entityType === "agent") return [];
        return [];
      }),
      createEntity,
      updateEntity,
      deleteEntity,
    },
    ai: {
      generate: mock(async () => ({ skills: generatedSkills })),
    },
  } as unknown as EntityPluginContext;

  return { context, createEntity, updateEntity, deleteEntity };
}

describe("deriveSkills", () => {
  it("diffs replace-all skills instead of deleting and recreating unchanged rows", async () => {
    const unchanged = {
      name: "Research",
      description: "Research complex systems",
      tags: ["research"],
      examples: ["What should I read?"],
    };
    const changedOld = {
      name: "Writing",
      description: "Old description",
      tags: ["writing"],
      examples: ["Draft this"],
    };
    const changedNew = {
      ...changedOld,
      description: "Write clear essays",
    };
    const stale = {
      name: "Stale Skill",
      description: "Remove me",
      tags: ["old"],
      examples: ["Old prompt"],
    };
    const fresh = {
      name: "Design",
      description: "Design institutions",
      tags: ["design"],
      examples: ["Design this governance process"],
    };

    const { context, createEntity, updateEntity, deleteEntity } =
      contextForSkills(
        [
          skillEntity("research", unchanged),
          skillEntity("writing", changedOld),
          skillEntity("stale-skill", stale),
        ],
        [unchanged, changedNew, fresh],
      );

    const result = await deriveSkills(context, createSilentLogger(), {
      replaceAll: true,
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 1,
      deleted: 1,
      skipped: 1,
    });
    expect(deleteEntity).toHaveBeenCalledTimes(1);
    expect(deleteEntity).toHaveBeenCalledWith({
      entityType: "skill",
      id: "stale-skill",
    });
    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(updateEntity).toHaveBeenCalledTimes(1);
  });

  it("deletes stale skills sequentially on replace-all", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const staleSkills = Array.from({ length: 12 }, (_, i) =>
      skillEntity(`stale-${i}`, {
        name: `Stale ${i}`,
        description: "Remove me",
        tags: ["old"],
        examples: ["Old prompt"],
      }),
    );
    const { context, deleteEntity } = contextForSkills(staleSkills, []);
    deleteEntity.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return true;
    });

    await deriveSkills(context, createSilentLogger(), { replaceAll: true });

    expect(deleteEntity).toHaveBeenCalledTimes(12);
    expect(maxInFlight).toBe(1);
  });
});

describe("buildSkillPrompt", () => {
  it("should include topic titles grouped", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing", "Distributed Systems", "Urban Sensing"],
      toolDescriptions: ["Create blog posts", "Build website"],
      tagVocabulary: [],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Event Sourcing");
    expect(prompt).toContain("Distributed Systems");
    expect(prompt).toContain("Urban Sensing");
  });

  it("should include tool descriptions", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["TypeScript"],
      toolDescriptions: [
        "Create and publish blog posts",
        "Generate social media content",
        "Build and deploy a website",
      ],
      tagVocabulary: [],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Create and publish blog posts");
    expect(prompt).toContain("Generate social media content");
    expect(prompt).toContain("Build and deploy a website");
  });

  it("should handle empty topics", () => {
    const input: SkillDeriverInput = {
      topicTitles: [],
      toolDescriptions: ["Create blog posts"],
      tagVocabulary: [],
    };

    const prompt = buildSkillPrompt(input);

    // Should still produce a prompt (tools-only skills)
    expect(prompt).toContain("Create blog posts");
  });

  it("should handle empty tools", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: [],
      tagVocabulary: [],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Event Sourcing");
  });

  it("should include the tag vocabulary primer when provided", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: ["Create blog posts"],
      tagVocabulary: [{ tag: "research", count: 3 }],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("Current agent-directory tag vocabulary");
    expect(prompt).toContain("research (3)");
  });

  it("should ask for action-oriented skill descriptions", () => {
    const input: SkillDeriverInput = {
      topicTitles: ["Event Sourcing"],
      toolDescriptions: ["Create blog posts"],
      tagVocabulary: [],
    };

    const prompt = buildSkillPrompt(input);

    expect(prompt).toContain("action-oriented");
    expect(prompt).toContain("Reuse an existing tag when one fits");
  });
});
