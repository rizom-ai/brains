import { describe, expect, it } from "bun:test";
import {
  createAgentContent,
  createSkillContent,
} from "@brains/agent-discovery";
import {
  ProjectionJsonObjectSchema,
  appInfoSchema,
  type BaseEntity,
  type EntitySchema,
  type ListEntitiesRequest,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { parseSwotContent } from "../src";
import {
  SWOT_DERIVATION_RULE_ID,
  createSwotProjectionRule,
} from "../src/lib/swot-projection";
import {
  buildDraftPromptFallback,
  buildPromptContext,
  buildRefinementPromptFallback,
} from "../src/lib/swot-prompts";

/**
 * The swot-derivation rule, as production runs it: it reads the brain's
 * agents and skills, drafts a SWOT and refines it with AI through the
 * editable prompts, and writes the one SWOT record.
 */

function hasParser<T>(schema: unknown): schema is { parse(value: unknown): T } {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    typeof schema.parse === "function"
  );
}

function parseGenerated<T>(schema: unknown, value: unknown): T {
  if (!hasParser<T>(schema)) {
    throw new Error("Test generation schema does not provide parsing");
  }
  return schema.parse(value);
}

function stored(
  entityType: string,
  id: string,
  content: string,
  metadata: Record<string, unknown>,
  updated = "2026-05-01T00:00:00.000Z",
): BaseEntity {
  return {
    id,
    entityType,
    content,
    metadata,
    visibility: "public",
    contentHash: id,
    created: "2026-04-01T00:00:00.000Z",
    updated,
  };
}

const research = {
  name: "Research",
  description: "Turn source material into grounded findings.",
  tags: ["research", "synthesis"],
  examples: ["Example"],
};

const researchSkill = stored(
  "skill",
  "skill-1",
  createSkillContent(research),
  research,
  "2026-05-03T00:00:00.000Z",
);

const signalForge = stored(
  "agent",
  "agent-1",
  createAgentContent({
    name: "Signal Forge",
    brainName: "signal-forge",
    url: "https://signal-forge.example",
    status: "approved",
    kind: "person",
    discoveredAt: "2026-04-20T00:00:00.000Z",
    about: "Research partner",
    notes: "Approved and reliable.",
    skills: [
      {
        name: "Research Operations",
        description: "Deep source gathering and synthesis.",
        tags: ["research", "synthesis"],
      },
      {
        name: "Facilitation",
        description: "Turns research into collaborative sessions.",
        tags: ["facilitation", "workshops"],
      },
    ],
  }),
  {
    name: "Signal Forge",
    url: "https://signal-forge.example",
    status: "approved",
    slug: "signal-forge",
  },
);

const draft = {
  strengths: [
    {
      theme: "research",
      evidence: "Research is reinforced by Research Operations.",
      action: "Use it confidently.",
    },
  ],
  weaknesses: [
    {
      theme: "analysis",
      evidence: "owner lacks dependable support",
      action: "strengthen it before promising it",
    },
  ],
  opportunities: [
    {
      theme: "facilitation",
      evidence: "Facilitation appears as an external network skill.",
      action: "Test it in live sessions.",
    },
  ],
  threats: [],
};

const refined = {
  strengths: [
    { sourceTheme: "research", title: "Research edge", detail: "Use it." },
  ],
  weaknesses: [
    {
      sourceTheme: "analysis",
      title: "Analysis gap",
      detail: "Strengthen it before promising it.",
    },
  ],
  opportunities: [
    {
      sourceTheme: "facilitation",
      title: "Facilitation",
      detail: "Test it in live sessions.",
    },
  ],
  threats: [],
};

interface Run {
  readonly written: Awaited<
    ReturnType<ReturnType<typeof createSwotProjectionRule>["derive"]>
  >;
  readonly prompts: readonly string[];
  readonly resolved: readonly string[];
}

async function runRule(
  entities: readonly BaseEntity[],
  prompts: Readonly<Record<string, string>> = {},
): Promise<Run> {
  const rule = createSwotProjectionRule();
  const resolved: string[] = [];
  function listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  function listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  async function listEntities(
    request: ListEntitiesRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity[]> {
    const found = entities.filter(
      ({ entityType }) => entityType === request.entityType,
    );
    return schema ? found.map((entity) => schema.parse(entity)) : found;
  }
  const input: ProjectionInputContext = {
    entities: {
      getEntity: async () => null,
      listEntities,
      getEntityTypes: () => ["agent", "skill", "swot"],
      hasEntityType: () => true,
      getEntityTypeConfig: () => ({}),
      isProjectionOwnedEntity: async () => false,
    },
    resolvePrompt: async (reference, fallback) => {
      resolved.push(reference);
      return prompts[reference] ?? fallback;
    },
    appInfo: async () =>
      appInfoSchema.parse({
        model: "test-model",
        version: "0.0.0-test",
        uptime: 0,
        entities: entities.length,
        entityCounts: [],
        embeddings: 0,
        backgroundWork: {
          status: "operational",
          reasons: [],
          worker: {
            state: "active",
            activeSessions: 1,
            staleSessions: 0,
            latestHeartbeatAgeMs: null,
          },
          queue: {
            duePending: 0,
            processing: 0,
            oldestDuePendingAgeMs: null,
            latestClaimAgeMs: null,
            stalled: false,
          },
        },
        ai: { model: "test-model", embeddingModel: "test-embedding" },
        daemons: [],
        endpoints: [],
        interactions: [],
      }),
    identityInput: () => ({ brainName: "Owner brain", profileName: "Owner" }),
  };
  const received: string[] = [];
  const execution: ProjectionExecutionContext = {
    ai: {
      generate: async () => {
        throw new Error("The rule generates objects only");
      },
      generateObject: async <T>(
        prompt: string,
        schema: unknown,
      ): Promise<{ object: T }> => {
        received.push(prompt);
        return {
          object: parseGenerated<T>(
            schema,
            received.length === 1 ? draft : refined,
          ),
        };
      },
    },
    logger: createSilentLogger("swot-projection"),
  };
  const signal = new AbortController().signal;
  const selected = await rule.selectInput(
    { waveId: "test", inputs: [] },
    input,
    signal,
  );
  const written = await rule.derive(
    rule.inputSchema.parse(selected),
    execution,
    signal,
  );
  return { written, prompts: received, resolved };
}

describe("the swot-derivation rule", () => {
  it("derives the SWOT from the brain's agents and skills", () => {
    const rule = createSwotProjectionRule();
    expect(rule).toMatchObject({
      id: SWOT_DERIVATION_RULE_ID,
      version: "1",
      targetType: "swot",
      sources: [{ kind: "entity", types: ["agent", "skill"] }],
    });
  });

  it("names no sources unscheduled, so no change queues it", () => {
    expect(createSwotProjectionRule({ scheduled: false }).sources).toEqual([]);
  });

  it("preserves distinct grounded capabilities across SWOT passes", () => {
    expect(buildDraftPromptFallback()).toContain(
      "cover at least three named owner or network capability areas",
    );
    expect(buildRefinementPromptFallback()).toContain(
      "preserve at least three of them in the final SWOT",
    );
  });

  it("builds JSON-compatible prompt context without optional evidence", () => {
    const promptContext = buildPromptContext({
      summary: {
        brainSkillCount: 1,
        approvedAgentCount: 1,
        discoveredAgentCount: 0,
        approvedCoverageRatio: 0,
        uncoveredSkillCount: 1,
        singleSourceSkillCount: 0,
        pendingReviewCount: 0,
      },
      selfProfile: { name: "Owner" },
      brainSkills: [
        {
          name: "Research",
          description: "Research skill",
          tags: ["research"],
          approvedCoverageCount: 0,
          approvedCoverageAgents: [],
        },
      ],
      approvedAgents: [
        {
          brainName: "Collaborator",
          category: "person",
          skills: [
            {
              name: "Facilitation",
              description: "Facilitation skill",
              tags: ["facilitation"],
            },
          ],
        },
      ],
      discoveredAgents: [],
      hints: {
        strongestTags: [],
        uncoveredSkills: ["Research"],
        singleSourceSkills: [],
        agentOnlyTags: ["facilitation"],
      },
    });

    expect(() => ProjectionJsonObjectSchema.parse(promptContext)).not.toThrow();
  });

  it("writes the one SWOT from the refined AI output, derived when its sources last changed", async () => {
    const { written } = await runRule([researchSkill, signalForge]);

    expect(written).toHaveLength(1);
    const [intent] = written;
    if (intent?.operation !== "upsert") throw new Error("Expected an upsert");
    expect(intent.entity).toMatchObject({
      id: "swot",
      entityType: "swot",
      visibility: "public",
      metadata: { derivedAt: "2026-05-03T00:00:00.000Z" },
    });
    expect(parseSwotContent(intent.entity.content).frontmatter).toEqual({
      strengths: [{ title: "Research edge", detail: "Use it." }],
      weaknesses: [
        { title: "Analysis gap", detail: "Strengthen it before promising it." },
      ],
      opportunities: [
        { title: "Facilitation", detail: "Test it in live sessions." },
      ],
      threats: [],
      derivedAt: "2026-05-03T00:00:00.000Z",
    });
  });

  it("writes an empty SWOT without asking the AI when there is nothing to assess", async () => {
    const { written, prompts } = await runRule([]);

    expect(prompts).toEqual([]);
    const [intent] = written;
    if (intent?.operation !== "upsert") throw new Error("Expected an upsert");
    expect(parseSwotContent(intent.entity.content).frontmatter).toMatchObject({
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    });
  });

  it("includes evidence cards with candidate matches and external skills in the draft prompt", async () => {
    const { prompts } = await runRule([researchSkill, signalForge]);

    expect(prompts[0]).toContain("Grounded directory context:");
    expect(prompts[0]).toContain('"candidateMatches"');
    expect(prompts[0]).toContain('"Research Operations"');
    expect(prompts[0]).toContain('"externalNetworkSkills"');
    expect(prompts[0]).toContain('"Facilitation"');
  });

  it("includes exact allowed themes in the refinement prompt", async () => {
    const { prompts } = await runRule([researchSkill, signalForge]);

    expect(prompts[1]).toContain("Draft SWOT:");
    expect(prompts[1]).toContain("Allowed themes by quadrant:");
    expect(prompts[1]).toContain('"research"');
    expect(prompts[1]).toContain('"facilitation"');
  });

  it("drafts and refines through the brain's editable prompts", async () => {
    const { prompts, resolved } = await runRule([researchSkill, signalForge], {
      "assessment:swot-derivation": "Edited derivation prompt.",
      "assessment:swot-refinement": "Edited refinement prompt.",
    });

    expect([...resolved].sort()).toEqual([
      "assessment:swot-derivation",
      "assessment:swot-refinement",
    ]);
    expect(prompts[0]).toContain("Edited derivation prompt.");
    expect(prompts[1]).toContain("Edited refinement prompt.");
  });
});
