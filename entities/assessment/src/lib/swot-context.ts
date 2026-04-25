import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import {
  buildCapabilityProfiles,
  buildCapabilityProfilesFromEntities,
  normalizeTags,
  type CapabilityProfile,
  type CapabilityProfileSkill,
} from "./capability-profile";

export interface SwotContextSkill {
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface SwotContextAgent {
  brainName: string;
  name?: string;
  kind: "professional" | "team" | "collective";
  description?: string;
  notes?: string;
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
  selfProfile: {
    name: string;
    brainName?: string;
    description?: string;
  };
  brainSkills: Array<{
    name: string;
    description: string;
    tags: string[];
    examples?: string[];
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

function toContextSkill(skill: CapabilityProfileSkill): SwotContextSkill {
  return {
    name: skill.name,
    description: skill.description,
    tags: normalizeTags(skill.tags),
    ...(skill.examples && { examples: skill.examples }),
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

function toContextAgent(profile: CapabilityProfile): SwotContextAgent {
  return {
    brainName: profile.brainName ?? profile.name,
    name: profile.name,
    kind: profile.kind ?? "professional",
    ...(profile.description && { description: profile.description }),
    ...(profile.notes && { notes: profile.notes }),
    skills: profile.skills.map(toContextSkill),
  };
}

export function buildSwotContextFromProfiles(params: {
  selfProfile: CapabilityProfile;
  networkProfiles: CapabilityProfile[];
}): SwotContext {
  const approvedProfiles = params.networkProfiles.filter(
    (profile) => profile.status === "approved",
  );
  const discoveredProfiles = params.networkProfiles.filter(
    (profile) => profile.status === "discovered",
  );

  const brainSkills = params.selfProfile.skills.map(toContextSkill);

  const enrichedBrainSkills = brainSkills.map((brainSkill) => {
    const approvedCoverageAgents = approvedProfiles
      .filter((profile) =>
        profile.skills.some((agentSkill) =>
          skillOverlap(brainSkill, agentSkill),
        ),
      )
      .map((profile) => profile.brainName ?? profile.name);

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
  for (const profile of approvedProfiles) {
    const sourceKey = `agent:${normalizeName(profile.brainName ?? profile.name)}`;
    const agentTags = new Set(
      profile.skills.flatMap((skill) => normalizeTags(skill.tags)),
    );
    for (const tag of agentTags) addSource(tag, sourceKey);
  }

  const brainTagSet = new Set(brainSkills.flatMap((skill) => skill.tags));
  const approvedAgentTagSet = new Set(
    approvedProfiles.flatMap((profile) =>
      profile.skills.flatMap((skill) => normalizeTags(skill.tags)),
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
      approvedAgentCount: approvedProfiles.length,
      discoveredAgentCount: discoveredProfiles.length,
      approvedCoverageRatio:
        brainSkills.length === 0
          ? 0
          : enrichedBrainSkills.filter(
              (skill) => skill.approvedCoverageCount > 0,
            ).length / brainSkills.length,
      uncoveredSkillCount: uncoveredSkills.length,
      singleSourceSkillCount: singleSourceSkills.length,
      pendingReviewCount: discoveredProfiles.length,
    },
    selfProfile: {
      name: params.selfProfile.name,
      ...(params.selfProfile.brainName && {
        brainName: params.selfProfile.brainName,
      }),
      ...(params.selfProfile.description && {
        description: params.selfProfile.description,
      }),
    },
    brainSkills: enrichedBrainSkills,
    approvedAgents: approvedProfiles.map(toContextAgent),
    discoveredAgents: discoveredProfiles.map(toContextAgent),
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

export function buildSwotContextFromEntities(params: {
  agents: BaseEntity[];
  skills: BaseEntity[];
}): SwotContext {
  return buildSwotContextFromProfiles(
    buildCapabilityProfilesFromEntities({
      agents: params.agents,
      skills: params.skills,
    }),
  );
}

export async function buildSwotContext(
  context: EntityPluginContext,
): Promise<SwotContext> {
  return buildSwotContextFromProfiles(await buildCapabilityProfiles(context));
}
