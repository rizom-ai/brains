import {
  anchorProfileKindSchema,
  parseAgentBody,
  skillDataSchema,
  type AgentBody,
  type AnchorProfileKind,
  type ProfileCategory,
  type SkillData,
} from "@brains/sdk/internal/service-runtime";
import {
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import { normalizeTags } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

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

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/** The markdown under a document's header; the document itself when it has none. */
function bodyOf(markdown: string): string {
  try {
    return parseMarkdownWithFrontmatter(markdown, frontmatterRecordSchema)
      .content;
  } catch {
    // A document whose header does not parse is read as all body, as the
    // adapter's extractBody read it.
    return markdown;
  }
}

/**
 * An agent document's header and body sections, as the capability
 * profile's agent adapter read them: a header the agent schema refuses
 * fails as the agent type's validation error.
 */
function parseAgent(entity: BaseEntity): {
  frontmatter: CapabilityAgentFrontmatter;
  body: AgentBody;
} | null {
  const frontmatterResult = capabilityAgentFrontmatterSchema.safeParse(
    parseTypedFrontmatter(
      "agent",
      entity.content,
      capabilityAgentFrontmatterSchema,
    ),
  );
  if (!frontmatterResult.success) return null;
  return {
    frontmatter: frontmatterResult.data,
    body: parseAgentBody(bodyOf(entity.content)),
  };
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
