import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod-v4";

export interface CapabilityProfileSkill {
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface CapabilityProfile {
  id: string;
  source: "self" | "agent";
  name: string;
  brainName?: string;
  kind?: "professional" | "team" | "collective";
  status?: "approved" | "discovered" | "archived";
  description?: string;
  notes?: string;
  skills: CapabilityProfileSkill[];
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of raw) {
    const value = normalizeTag(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

const capabilityAgentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

const capabilityAgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: z.enum(["approved", "discovered", "archived"]),
  discoveredAt: z.string().datetime().optional(),
});

type CapabilityAgentFrontmatter = z.output<
  typeof capabilityAgentFrontmatterSchema
>;
type CapabilityAgentSkill = z.output<typeof capabilityAgentSkillSchema>;

const capabilitySkillDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

type CapabilitySkillData = z.output<typeof capabilitySkillDataSchema>;

const capabilityAgentBodySchema = z.object({
  about: z.string(),
  skills: z.array(capabilityAgentSkillSchema),
  notes: z.string(),
});

type CapabilityAgentBody = z.output<typeof capabilityAgentBodySchema>;

function formatSkills(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const skills = value as CapabilityAgentSkill[];

  return skills
    .map((skill) => {
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- ${skill.name}: ${skill.description}${tags}`;
    })
    .join("\n");
}

function parseSkills(text: string): CapabilityAgentSkill[] {
  if (!text.trim()) return [];

  const skills: CapabilityAgentSkill[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/);
    if (!match) continue;

    const name = match[1] ?? "";
    const description = match[2] ?? "";
    const tagsStr = match[3];
    const tags = tagsStr
      ? tagsStr
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    skills.push({ name, description, tags });
  }
  return skills;
}

const agentBodyFormatter = new StructuredContentFormatter<CapabilityAgentBody>(
  capabilityAgentBodySchema,
  {
    title: "Agent",
    mappings: [
      { key: "about", label: "About", type: "string" },
      {
        key: "skills",
        label: "Skills",
        type: "custom",
        formatter: formatSkills,
        parser: parseSkills,
      },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },
);

function parseAgent(entity: BaseEntity): {
  frontmatter: CapabilityAgentFrontmatter;
  body: CapabilityAgentBody;
} | null {
  let parsed: {
    content: string;
    metadata: CapabilityAgentFrontmatter;
  };

  try {
    parsed = parseMarkdownWithFrontmatter(
      entity.content,
      capabilityAgentFrontmatterSchema,
    );
  } catch {
    return null;
  }

  if (!parsed.content.trim()) {
    return {
      frontmatter: parsed.metadata,
      body: { about: "", skills: [], notes: "" },
    };
  }

  try {
    return {
      frontmatter: parsed.metadata,
      body: agentBodyFormatter.parse(parsed.content),
    };
  } catch {
    return {
      frontmatter: parsed.metadata,
      body: { about: "", skills: [], notes: "" },
    };
  }
}

function asProfileSkill(skill: CapabilitySkillData): CapabilityProfileSkill {
  return {
    name: skill.name,
    description: skill.description,
    tags: normalizeTags(skill.tags),
    examples: skill.examples,
  };
}

function parseSkillEntity(entity: BaseEntity): CapabilitySkillData | null {
  const parsed = capabilitySkillDataSchema.safeParse(entity.metadata);
  return parsed.success ? parsed.data : null;
}

export function buildCapabilityProfilesFromEntities(params: {
  identity?: {
    brainName?: string;
    role?: string;
    purpose?: string;
    profileName?: string;
    profileDescription?: string;
  };
  agents: BaseEntity[];
  skills: BaseEntity[];
}): { selfProfile: CapabilityProfile; networkProfiles: CapabilityProfile[] } {
  const identity = params.identity;
  const brainName = identity?.brainName ?? "This brain";
  const profileName = identity?.profileName ?? brainName;
  const purposeDescription =
    identity?.role && identity.purpose
      ? `${brainName} is ${identity.role}. Its purpose is: ${identity.purpose}.`
      : identity?.purpose;
  const descriptionParts = [
    identity?.profileDescription,
    purposeDescription,
  ].filter((value): value is string => Boolean(value?.trim()));

  const selfProfile: CapabilityProfile = {
    id: "self",
    source: "self",
    name: profileName,
    brainName,
    ...(descriptionParts.length > 0 && {
      description: descriptionParts.join("\n\n"),
    }),
    skills: params.skills
      .map(parseSkillEntity)
      .filter((skill): skill is CapabilitySkillData => skill !== null)
      .map(asProfileSkill),
  };

  const networkProfiles = params.agents
    .map((entity): CapabilityProfile | null => {
      const parsed = parseAgent(entity);
      if (!parsed) return null;
      const { frontmatter, body } = parsed;
      if (frontmatter.status === "archived") return null;

      return {
        id: entity.id,
        source: "agent",
        name: frontmatter.name,
        brainName: frontmatter.brainName,
        kind: frontmatter.kind,
        status: frontmatter.status,
        ...(body.about && { description: body.about }),
        ...(body.notes && { notes: body.notes }),
        skills: body.skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          tags: normalizeTags(skill.tags),
        })),
      };
    })
    .filter((profile): profile is CapabilityProfile => profile !== null);

  return { selfProfile, networkProfiles };
}

export async function buildCapabilityProfiles(
  context: EntityPluginContext,
): Promise<{
  selfProfile: CapabilityProfile;
  networkProfiles: CapabilityProfile[];
}> {
  const [agents, skills] = await Promise.all([
    context.entityService.listEntities<BaseEntity>({
      entityType: "agent",
      options: { limit: 1000 },
    }),
    context.entityService.listEntities<BaseEntity>({
      entityType: "skill",
      options: { limit: 1000 },
    }),
  ]);

  const character = context.identity.get();
  const profile = context.identity.getProfile();

  return buildCapabilityProfilesFromEntities({
    identity: {
      brainName: character.name,
      role: character.role,
      purpose: character.purpose,
      profileName: profile.name,
      ...(profile.description && { profileDescription: profile.description }),
    },
    agents,
    skills,
  });
}
