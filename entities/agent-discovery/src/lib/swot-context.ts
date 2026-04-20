import type { EntityPluginContext } from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentEntity, AgentSkill } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import { normalizeTags } from "./tag-vocabulary";

const agentAdapter = new AgentAdapter();

export interface SwotContextSkill {
  name: string;
  description: string;
  tags: string[];
}

export interface SwotContextAgent {
  brainName: string;
  kind: "professional" | "team" | "collective";
  skills: SwotContextSkill[];
}

export interface SwotContext {
  summary: {
    brainSkillCount: number;
    approvedAgentCount: number;
    discoveredAgentCount: number;
    approvedCoverageRatio: number;
    uncoveredSkillCount: number;
    singleSourceSkillCount: number;
    pendingReviewCount: number;
  };
  brainSkills: Array<{
    name: string;
    description: string;
    tags: string[];
    approvedCoverageCount: number;
    approvedCoverageAgents: string[];
  }>;
  approvedAgents: SwotContextAgent[];
  discoveredAgents: SwotContextAgent[];
  hints: {
    strongestTags: Array<{ tag: string; sourceCount: number }>;
    uncoveredSkills: string[];
    singleSourceSkills: string[];
    agentOnlyTags: string[];
  };
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

function toContextSkill(
  skill: AgentSkill | { name: string; description: string; tags: string[] },
): SwotContextSkill {
  return {
    name: skill.name,
    description: skill.description,
    tags: normalizeTags(skill.tags),
  };
}

function parseAgent(entity: AgentEntity): {
  status: "approved" | "discovered";
  brainName: string;
  kind: "professional" | "team" | "collective";
  skills: SwotContextSkill[];
} {
  const { frontmatter, body } = agentAdapter.parseEntity(entity);

  return {
    status: frontmatter.status,
    brainName: frontmatter.brainName,
    kind: frontmatter.kind,
    skills: body.skills.map(toContextSkill),
  };
}

function skillOverlap(
  left: { name: string; tags: string[] },
  right: { name: string; tags: string[] },
): boolean {
  if (normalizeName(left.name) === normalizeName(right.name)) return true;

  const rightTags = new Set(right.tags);
  return left.tags.some((tag) => rightTags.has(tag));
}

export function buildSwotContextFromEntities(params: {
  agents: AgentEntity[];
  skills: SkillEntity[];
}): SwotContext {
  const parsedAgents = params.agents.map(parseAgent);
  const approvedAgents = parsedAgents.filter(
    (agent) => agent.status === "approved",
  );
  const discoveredAgents = parsedAgents.filter(
    (agent) => agent.status === "discovered",
  );

  const brainSkills = params.skills.map((skill) => ({
    name: skill.metadata.name,
    description: skill.metadata.description,
    tags: normalizeTags(skill.metadata.tags),
  }));

  const enrichedBrainSkills = brainSkills.map((brainSkill) => {
    const approvedCoverageAgents = approvedAgents
      .filter((agent) =>
        agent.skills.some((agentSkill) => skillOverlap(brainSkill, agentSkill)),
      )
      .map((agent) => agent.brainName);

    return {
      ...brainSkill,
      approvedCoverageCount: approvedCoverageAgents.length,
      approvedCoverageAgents,
    };
  });

  const sourceCounts = new Map<string, Set<string>>();
  const addSource = (tag: string, sourceKey: string): void => {
    const sources = sourceCounts.get(tag) ?? new Set<string>();
    sources.add(sourceKey);
    sourceCounts.set(tag, sources);
  };

  for (const skill of brainSkills) {
    const sourceKey = `brain:${normalizeName(skill.name)}`;
    for (const tag of skill.tags) addSource(tag, sourceKey);
  }
  for (const agent of approvedAgents) {
    const sourceKey = `agent:${normalizeName(agent.brainName)}`;
    const agentTags = new Set(agent.skills.flatMap((skill) => skill.tags));
    for (const tag of agentTags) addSource(tag, sourceKey);
  }

  const brainTagSet = new Set(brainSkills.flatMap((skill) => skill.tags));
  const approvedAgentTagSet = new Set(
    approvedAgents.flatMap((agent) =>
      agent.skills.flatMap((skill) => skill.tags),
    ),
  );

  const uncoveredSkills = enrichedBrainSkills
    .filter((skill) => skill.approvedCoverageCount === 0)
    .map((skill) => skill.name);
  const singleSourceSkills = enrichedBrainSkills
    .filter((skill) => skill.approvedCoverageCount === 1)
    .map((skill) => skill.name);

  return {
    summary: {
      brainSkillCount: brainSkills.length,
      approvedAgentCount: approvedAgents.length,
      discoveredAgentCount: discoveredAgents.length,
      approvedCoverageRatio:
        brainSkills.length === 0
          ? 0
          : enrichedBrainSkills.filter(
              (skill) => skill.approvedCoverageCount > 0,
            ).length / brainSkills.length,
      uncoveredSkillCount: uncoveredSkills.length,
      singleSourceSkillCount: singleSourceSkills.length,
      pendingReviewCount: discoveredAgents.length,
    },
    brainSkills: enrichedBrainSkills,
    approvedAgents: approvedAgents.map((agent) => ({
      brainName: agent.brainName,
      kind: agent.kind,
      skills: agent.skills,
    })),
    discoveredAgents: discoveredAgents.map((agent) => ({
      brainName: agent.brainName,
      kind: agent.kind,
      skills: agent.skills,
    })),
    hints: {
      strongestTags: Array.from(sourceCounts.entries())
        .map(([tag, sources]) => ({ tag, sourceCount: sources.size }))
        .filter((item) => item.sourceCount >= 2)
        .sort(
          (a, b) => b.sourceCount - a.sourceCount || a.tag.localeCompare(b.tag),
        )
        .slice(0, 6),
      uncoveredSkills,
      singleSourceSkills,
      agentOnlyTags: Array.from(approvedAgentTagSet)
        .filter((tag) => !brainTagSet.has(tag))
        .sort(),
    },
  };
}

export async function buildSwotContext(
  context: EntityPluginContext,
): Promise<SwotContext> {
  const [agents, skills] = await Promise.all([
    context.entityService.listEntities<AgentEntity>("agent", { limit: 1000 }),
    context.entityService.listEntities<SkillEntity>("skill", { limit: 1000 }),
  ]);

  return buildSwotContextFromEntities({ agents, skills });
}
