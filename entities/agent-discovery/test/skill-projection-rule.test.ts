import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import { SkillAdapter } from "../src/adapters/skill-adapter";
import { createSkillProjectionRule } from "../src/lib/skill-projection";
import type { SkillFrontmatter } from "../src/schemas/skill";

const now = "2026-04-30T00:00:00.000Z";
const adapter = new SkillAdapter();

function entity(input: {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}): BaseEntity {
  return {
    ...input,
    contentHash: `hash:${input.id}`,
    visibility: "public",
    created: now,
    updated: now,
  };
}

function skill(id: string, metadata: SkillFrontmatter): BaseEntity {
  return entity({
    id,
    entityType: "skill",
    content: adapter.createSkillContent(metadata),
    metadata,
  });
}

function inputContext(
  entities: BaseEntity[],
  projectionOwnedIds: ReadonlySet<string> = new Set(),
): ProjectionInputContext {
  const service = createMockEntityService({
    entityTypes: ["topic", "agent", "skill"],
    listEntitiesImpl: async ({ entityType }) =>
      entities.filter((candidate) => candidate.entityType === entityType),
  });
  service.isProjectionOwnedEntity = async ({
    entityType,
    id,
  }): Promise<boolean> => entityType === "skill" && projectionOwnedIds.has(id);
  return {
    entities: service,
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async () => ({
      version: "0.0.0",
      model: "test-model",
      uptime: 0,
      entities: 0,
      entityCounts: [],
      embeddings: 0,
      backgroundWork: {
        status: "operational",
        reasons: [],
        worker: {
          state: "active",
          activeSessions: 1,
          staleSessions: 0,
          latestHeartbeatAgeMs: 0,
        },
        queue: {
          duePending: 0,
          processing: 0,
          oldestDuePendingAgeMs: null,
          latestClaimAgeMs: null,
          stalled: false,
        },
      },
      ai: { model: "test-model", embeddingModel: "test-embedding-model" },
      daemons: [],
      endpoints: [],
      interactions: [],
    }),
    identityInput: () => ({ name: "Test Brain" }),
  };
}

function executionContext(generatedSkills: SkillFrontmatter[]): {
  context: ProjectionExecutionContext;
  generate: ProjectionExecutionContext["ai"]["generate"];
} {
  const pluginContext = createMockEntityPluginContext({
    returns: { ai: { generate: { skills: generatedSkills } } },
  });
  return {
    context: {
      ai: pluginContext.ai,
      logger: createSilentLogger("skill-projection-rule-test"),
    },
    generate: pluginContext.ai.generate,
  };
}

describe("skill projection rule", () => {
  it("derives desired skills, deletes stale projection outputs, and preserves authored skills", async () => {
    const existing = {
      name: "Existing",
      description: "Old description",
      tags: ["old"],
      examples: ["Old example"],
    };
    const stale = {
      name: "Stale",
      description: "Remove this",
      tags: ["stale"],
      examples: ["Stale example"],
    };
    const desired = {
      name: "Systems Design",
      description: "Design resilient systems",
      tags: ["systems", "design"],
      examples: ["Design this system"],
    };
    const rule = createSkillProjectionRule();
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext(
        [
          entity({
            id: "topic-1",
            entityType: "topic",
            content: "---\nname: Architecture\n---",
            metadata: { name: "Architecture" },
          }),
          skill("existing", existing),
          skill("stale", stale),
        ],
        new Set(["stale"]),
      ),
      signal,
    );
    const { context, generate } = executionContext([desired]);

    const intents = await rule.derive(selected, context, signal);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(intents).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "systems-design",
          entityType: "skill",
          content: adapter.createSkillContent(desired),
          metadata: desired,
          visibility: "public",
        },
      },
      { operation: "delete", entityType: "skill", id: "stale" },
    ]);
  });

  it("does not overwrite an authored skill whose id matches generated output", async () => {
    const authored = {
      name: "Systems Design",
      description: "Authored description",
      tags: ["authored"],
      examples: ["Authored example"],
    };
    const generated = {
      name: "Systems Design",
      description: "Generated description",
      tags: ["generated"],
      examples: ["Generated example"],
    };
    const rule = createSkillProjectionRule();
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "topic-1",
          entityType: "topic",
          content: "---\nname: Architecture\n---",
          metadata: { name: "Architecture" },
        }),
        skill("systems-design", authored),
      ]),
      signal,
    );
    const { context } = executionContext([generated]);

    expect(await rule.derive(selected, context, signal)).toEqual([]);
  });

  it("does not call the model or delete outputs when no topics exist", async () => {
    const existing = {
      name: "Existing",
      description: "Keep this",
      tags: ["existing"],
      examples: ["Existing example"],
    };
    const rule = createSkillProjectionRule();
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([skill("existing", existing)]),
      signal,
    );
    const { context, generate } = executionContext([]);

    expect(await rule.derive(selected, context, signal)).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
