import type {
  AnchorProfileKind,
  BaseEntity,
  ProfileCategory,
  SkillData,
} from "@brains/sdk/entities";
import {
  anchorProfileKindSchema,
  parseMarkdown,
  skillDataSchema,
} from "@brains/sdk/entities";
import { StructuredContentFormatter } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";

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
  kind?: AnchorProfileKind;
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
  kind: anchorProfileKindSchema,
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: z.enum(["approved", "discovered", "archived"]),
  discoveredAt: z.string().datetime().optional(),
});

type CapabilityAgentFrontmatter = z.infer<
  typeof capabilityAgentFrontmatterSchema
>;
type CapabilityAgentSkill = z.infer<typeof capabilityAgentSkillSchema>;

const capabilityAgentBodySchema = z.object({
  about: z.string(),
  skills: z.array(capabilityAgentSkillSchema),
  notes: z.string(),
});

type CapabilityAgentBody = z.infer<typeof capabilityAgentBodySchema>;

function formatSkills(value: unknown): string {
  // Parsed rather than asserted: the value arrives from stored body JSON, and
  // a skill list written under an older shape must not reach the formatter.
  const parsed = z.array(capabilityAgentSkillSchema).safeParse(value);
  if (!parsed.success || parsed.data.length === 0) return "";
  const skills = parsed.data;

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

/**
 * Read an agent entity the way its own package writes one.
 *
 * Was a BaseEntityAdapter subclass, for two of its helpers: splitting
 * frontmatter from body. Both have public equivalents, and this never was
 * an adapter — nothing registered it.
 */
function parseAgentEntity(entity: BaseEntity): {
  frontmatter: CapabilityAgentFrontmatter;
  body: CapabilityAgentBody;
} | null {
  const parsed = parseMarkdown(entity.content);
  const frontmatterResult = capabilityAgentFrontmatterSchema.safeParse(
    parsed.frontmatter,
  );
  if (!frontmatterResult.success) return null;

  const empty = { about: "", skills: [], notes: "" };
  if (!parsed.content.trim()) {
    return { frontmatter: frontmatterResult.data, body: empty };
  }
  try {
    return {
      frontmatter: frontmatterResult.data,
      body: agentBodyFormatter.parse(parsed.content),
    };
  } catch {
    return { frontmatter: frontmatterResult.data, body: empty };
  }
}

function asProfileSkill(skill: SkillData): CapabilityProfileSkill {
  return {
    name: skill.name,
    description: skill.description,
    tags: normalizeTags(skill.tags),
    examples: skill.examples,
  };
}

function parseSkillEntity(entity: BaseEntity): SkillData | null {
  const parsed = skillDataSchema.safeParse(entity.metadata);
  return parsed.success ? parsed.data : null;
}

export function buildCapabilityProfilesFromEntities(params: {
  identity?: {
    brainName?: string;
    role?: string;
    purpose?: string;
    profileName?: string;
    profileDescription?: string;
    profileCategory?: ProfileCategory;
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
    ...(identity?.profileCategory && { kind: identity.profileCategory }),
    ...(descriptionParts.length > 0 && {
      description: descriptionParts.join("\n\n"),
    }),
    skills: params.skills
      .map(parseSkillEntity)
      .filter((skill): skill is SkillData => skill !== null)
      .map(asProfileSkill),
  };

  const networkProfiles = params.agents
    .map((entity): CapabilityProfile | null => {
      const parsed = parseAgentEntity(entity);
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
