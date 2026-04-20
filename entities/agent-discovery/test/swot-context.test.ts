import { describe, expect, it } from "bun:test";
import type { AgentEntity, SkillEntity } from "../src";
import { AgentAdapter, SkillAdapter } from "../src";
import { buildSwotContextFromEntities } from "../src";

const agentAdapter = new AgentAdapter();
const skillAdapter = new SkillAdapter();

function makeSkill(input: {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}): SkillEntity {
  const content = skillAdapter.createSkillContent({
    name: input.name,
    description: input.description,
    tags: input.tags,
    examples: input.examples ?? ["Example"],
  });

  return {
    id: input.id,
    entityType: "skill",
    content,
    metadata: {
      name: input.name,
      description: input.description,
      tags: input.tags,
      examples: input.examples ?? ["Example"],
    },
    contentHash: `hash-${input.id}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function makeAgent(input: {
  id: string;
  brainName: string;
  status: "approved" | "discovered";
  kind?: "professional" | "team" | "collective";
  skills: Array<{ name: string; description: string; tags: string[] }>;
}): AgentEntity {
  return {
    id: input.id,
    entityType: "agent",
    content: agentAdapter.createAgentContent({
      name: input.brainName,
      brainName: input.brainName,
      url: `https://${input.id}`,
      status: input.status,
      kind: input.kind ?? "professional",
      discoveredAt: new Date().toISOString(),
      about: "",
      notes: "",
      skills: input.skills,
    }),
    metadata: {
      name: input.brainName,
      url: `https://${input.id}`,
      status: input.status,
      slug: input.id,
    },
    contentHash: `hash-${input.id}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

describe("buildSwotContextFromEntities", () => {
  it("counts approved coverage but excludes discovered agents from strength coverage", () => {
    const skills = [
      makeSkill({
        id: "research-writing",
        name: "Research & Writing",
        description: "Write and synthesize research",
        tags: ["Research", "Writing"],
      }),
      makeSkill({
        id: "data-analysis",
        name: "Data Analysis",
        description: "Analyze data",
        tags: ["Data", "Analysis"],
      }),
    ];

    const agents = [
      makeAgent({
        id: "approved-agent.io",
        brainName: "Approved Agent",
        status: "approved",
        skills: [
          {
            name: "Research Ops",
            description: "Research support",
            tags: ["research", "operations"],
          },
        ],
      }),
      makeAgent({
        id: "discovered-agent.io",
        brainName: "Discovered Agent",
        status: "discovered",
        skills: [
          {
            name: "Data Work",
            description: "Data support",
            tags: ["data", "analysis"],
          },
        ],
      }),
    ];

    const context = buildSwotContextFromEntities({ agents, skills });

    expect(context.summary.brainSkillCount).toBe(2);
    expect(context.summary.approvedAgentCount).toBe(1);
    expect(context.summary.discoveredAgentCount).toBe(1);
    expect(context.summary.pendingReviewCount).toBe(1);
    expect(context.summary.uncoveredSkillCount).toBe(1);
    expect(context.summary.singleSourceSkillCount).toBe(1);
    expect(context.summary.approvedCoverageRatio).toBe(0.5);

    expect(context.hints.uncoveredSkills).toEqual(["Data Analysis"]);
    expect(context.hints.singleSourceSkills).toEqual(["Research & Writing"]);
  });

  it("normalizes tags and reports strongest and agent-only tags", () => {
    const skills = [
      makeSkill({
        id: "skill-1",
        name: "Research",
        description: "Research capability",
        tags: ["Research", "Long Form"],
      }),
    ];

    const agents = [
      makeAgent({
        id: "agent-1.io",
        brainName: "Agent One",
        status: "approved",
        skills: [
          {
            name: "Writing",
            description: "Writing capability",
            tags: ["research", "video-production"],
          },
        ],
      }),
      makeAgent({
        id: "agent-2.io",
        brainName: "Agent Two",
        status: "approved",
        skills: [
          {
            name: "Analysis",
            description: "Analysis capability",
            tags: ["long_form", "contracts"],
          },
        ],
      }),
    ];

    const context = buildSwotContextFromEntities({ agents, skills });

    expect(context.hints.strongestTags).toEqual([
      { tag: "long-form", sourceCount: 2 },
      { tag: "research", sourceCount: 2 },
    ]);
    expect(context.hints.agentOnlyTags).toEqual([
      "contracts",
      "video-production",
    ]);
  });
});
