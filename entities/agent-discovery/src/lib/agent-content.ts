import {
  formatAgentBody,
  parseAgentBody,
  type AnchorProfileKind,
} from "@brains/sdk/internal/service-runtime";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { slugifyUrl } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  agentFrontmatterSchema,
  agentStatusSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";
import {
  skillFrontmatterSchema,
  type SkillFrontmatter,
} from "../schemas/skill";
import { AGENT_ENTITY_TYPE, SKILL_ENTITY_TYPE } from "./constants";

/*
 * An agent's and a skill's markdown, written and read as the agent and
 * skill adapters wrote and read them: an agent's header holds its card and
 * provenance, its body its about, skills and notes; a skill is all header.
 */

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

export interface CreateAgentContentInput {
  name: string;
  kind: AnchorProfileKind;
  organization?: string | undefined;
  brainName: string;
  url: string;
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  cardUri?: string | undefined;
  cardCid?: string | undefined;
  cardLastError?: string | undefined;
  cardFailureCount?: number | undefined;
  cardUnavailableAt?: string | undefined;
  cardStaleAfter?: string | undefined;
  status: AgentStatus | string;
  discoveredAt: string;
  introducedBy?: string[] | undefined;
  hops?: number | undefined;
  about: string;
  skills: AgentSkill[];
  notes: string;
}

/** An agent's markdown, read back into its frontmatter and body sections. */
export interface ParsedAgent {
  frontmatter: AgentFrontmatter;
  body: { about: string; skills: AgentSkill[]; notes: string };
}

/** The markdown under a document's header; the document itself when it has none. */
function bodyOf(markdown: string): string {
  try {
    return parseMarkdownWithFrontmatter(markdown, frontmatterRecordSchema)
      .content;
  } catch {
    return markdown;
  }
}

/** An agent's metadata, from its header: the fields the directory indexes. */
export function agentMetadataOf(frontmatter: AgentFrontmatter): AgentMetadata {
  return {
    name: frontmatter.name,
    url: frontmatter.url,
    status: frontmatter.status,
    discoveredAt: frontmatter.discoveredAt,
    slug: slugifyUrl(frontmatter.url),
    ...(frontmatter.repoDid && { repoDid: frontmatter.repoDid }),
    ...(frontmatter.brainDid && { brainDid: frontmatter.brainDid }),
    ...(frontmatter.cardUri && { cardUri: frontmatter.cardUri }),
    ...(frontmatter.cardCid && { cardCid: frontmatter.cardCid }),
    ...(frontmatter.cardLastError && {
      cardLastError: frontmatter.cardLastError,
    }),
    ...(frontmatter.cardFailureCount !== undefined && {
      cardFailureCount: frontmatter.cardFailureCount,
    }),
    ...(frontmatter.cardUnavailableAt && {
      cardUnavailableAt: frontmatter.cardUnavailableAt,
    }),
    ...(frontmatter.cardStaleAfter && {
      cardStaleAfter: frontmatter.cardStaleAfter,
    }),
  };
}

/** An agent's markdown header, as an agent document states it. */
export function agentFrontmatterOf(markdown: string): AgentFrontmatter {
  return parseTypedFrontmatter(
    AGENT_ENTITY_TYPE,
    markdown,
    agentFrontmatterSchema,
  );
}

/** An agent's document and its metadata, as a write of a new agent carries them. */
export function agentFromMarkdown(markdown: string): {
  content: string;
  metadata: AgentMetadata;
} {
  return {
    content: markdown,
    metadata: agentMetadataOf(agentFrontmatterOf(markdown)),
  };
}

export function createAgentContent(input: CreateAgentContentInput): string {
  const frontmatter: AgentFrontmatter = {
    name: input.name,
    kind: input.kind,
    ...(input.organization && { organization: input.organization }),
    brainName: input.brainName,
    url: input.url,
    ...(input.repoDid && { repoDid: input.repoDid }),
    ...(input.brainDid && { brainDid: input.brainDid }),
    ...(input.cardUri && { cardUri: input.cardUri }),
    ...(input.cardCid && { cardCid: input.cardCid }),
    ...(input.cardLastError && { cardLastError: input.cardLastError }),
    ...(input.cardFailureCount !== undefined && {
      cardFailureCount: input.cardFailureCount,
    }),
    ...(input.cardUnavailableAt && {
      cardUnavailableAt: input.cardUnavailableAt,
    }),
    ...(input.cardStaleAfter && { cardStaleAfter: input.cardStaleAfter }),
    status: agentStatusSchema.parse(input.status),
    discoveredAt: input.discoveredAt,
    ...(input.introducedBy?.length && { introducedBy: input.introducedBy }),
    ...(input.hops !== undefined && { hops: input.hops }),
  };

  const body = formatAgentBody({
    about: input.about,
    skills: input.skills,
    notes: input.notes,
  });

  return generateMarkdownWithFrontmatter(body, frontmatter);
}

/**
 * Rebuild a parsed agent's markdown with only `patch` changed. A patched
 * field follows createAgentContent's rules: undefined or empty drops it.
 */
export function rewriteAgentContent(
  parsed: ParsedAgent,
  patch: Partial<CreateAgentContentInput> = {},
): string {
  return createAgentContent({
    ...parsed.frontmatter,
    ...parsed.body,
    ...patch,
  });
}

/** An agent document's about, skills and notes. */
export function parseAgentContent(content: string): {
  about: string;
  skills: AgentSkill[];
  notes: string;
} {
  return parseAgentBody(bodyOf(content));
}

/** An agent read back into its header and body sections. */
export function parseAgentEntity(
  entity: Pick<AgentEntity, "content"> & Partial<AgentEntity>,
): ParsedAgent {
  return {
    frontmatter: agentFrontmatterOf(entity.content),
    body: parseAgentContent(entity.content),
  };
}

/** A skill's markdown: its fields as header, with no body. */
export function createSkillContent(input: SkillFrontmatter): string {
  return generateMarkdownWithFrontmatter("", input);
}

/** A skill's fields, from its document. */
export function skillFromMarkdown(markdown: string): SkillFrontmatter {
  return parseTypedFrontmatter(
    SKILL_ENTITY_TYPE,
    markdown,
    skillFrontmatterSchema,
  );
}
