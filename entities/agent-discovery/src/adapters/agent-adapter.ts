import {
  BaseEntityAdapter,
  formatAgentBody,
  parseAgentBody,
  type AnchorProfileKind,
} from "@brains/plugins";
import { slugifyUrl } from "@brains/utils/string-utils";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  agentStatusSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";
import { AGENT_ENTITY_TYPE } from "../lib/constants";

/**
 * Until 22 July 2026 an agent's kind named its brain (professional, team,
 * collective); it now names the anchor (person, team, organization). Agents
 * saved before then read as the anchor they meant, so they are neither
 * quarantined nor lost.
 */
const LEGACY_KINDS: Readonly<Record<string, AgentFrontmatter["kind"]>> = {
  professional: "person",
  collective: "organization",
};
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---/;
const LEGACY_KIND_LINE =
  /^kind:[ \t]*(['"]?)(professional|collective)\1[ \t]*$/m;

function withCurrentKind(markdown: string): string {
  const block = FRONTMATTER.exec(markdown)?.[0];
  if (!block) return markdown;
  const current = block.replace(
    LEGACY_KIND_LINE,
    (line: string, _quote: string, kind: string) =>
      LEGACY_KINDS[kind] ? `kind: ${LEGACY_KINDS[kind]}` : line,
  );
  return current === block ? markdown : current + markdown.slice(block.length);
}

export interface CreateAgentContentInput {
  name: string;
  kind: AnchorProfileKind;
  organization?: string | undefined;
  brainName: string;
  url: string;
  did?: string | undefined;
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
  cardUri?: string | undefined;
  cardCid?: string | undefined;
  cardObservedAt?: string | undefined;
  cardLastCheckedAt?: string | undefined;
  cardLastError?: string | undefined;
  cardFailureCount?: number | undefined;
  cardUnavailableAt?: string | undefined;
  cardStaleAfter?: string | undefined;
  a2aEndpoint?: string | undefined;
  status: AgentStatus | string;
  discoveredAt: string;
  introducedBy?: string[] | undefined;
  hops?: number | undefined;
  about: string;
  skills: AgentSkill[];
  notes: string;
}

export class AgentAdapter extends BaseEntityAdapter<
  AgentEntity,
  AgentMetadata,
  AgentFrontmatter
> {
  constructor() {
    super({
      entityType: AGENT_ENTITY_TYPE,
      purpose:
        "A saved remote peer-brain contact in the local agent directory.",
      schema: agentEntitySchema,
      frontmatterSchema: agentFrontmatterSchema,
      // Approval is the directory's publish gate: production site builds
      // (publishedOnly) emit detail routes only for approved agents.
      publishedStatuses: ["approved"],
    });
  }

  public fromMarkdown(saved: string): Partial<AgentEntity> {
    const markdown = withCurrentKind(saved);
    const frontmatter = this.parseFrontMatter(markdown, agentFrontmatterSchema);
    const slug = slugifyUrl(frontmatter.url);

    return {
      content: markdown,
      entityType: AGENT_ENTITY_TYPE,
      metadata: {
        name: frontmatter.name,
        url: frontmatter.url,
        status: frontmatter.status,
        discoveredAt: frontmatter.discoveredAt,
        slug,
        ...(frontmatter.repoDid && { repoDid: frontmatter.repoDid }),
        ...(frontmatter.brainDid && { brainDid: frontmatter.brainDid }),
        ...(frontmatter.anchorDid && { anchorDid: frontmatter.anchorDid }),
        ...(frontmatter.cardUri && { cardUri: frontmatter.cardUri }),
        ...(frontmatter.cardCid && { cardCid: frontmatter.cardCid }),
        ...(frontmatter.cardObservedAt && {
          cardObservedAt: frontmatter.cardObservedAt,
        }),
        ...(frontmatter.cardLastCheckedAt && {
          cardLastCheckedAt: frontmatter.cardLastCheckedAt,
        }),
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
        ...(frontmatter.a2aEndpoint && {
          a2aEndpoint: frontmatter.a2aEndpoint,
        }),
      },
    };
  }

  public createAgentContent(input: CreateAgentContentInput): string {
    const frontmatter: AgentFrontmatter = {
      name: input.name,
      kind: input.kind,
      ...(input.organization && { organization: input.organization }),
      brainName: input.brainName,
      url: input.url,
      ...(input.did && { did: input.did }),
      ...(input.repoDid && { repoDid: input.repoDid }),
      ...(input.brainDid && { brainDid: input.brainDid }),
      ...(input.anchorDid && { anchorDid: input.anchorDid }),
      ...(input.cardUri && { cardUri: input.cardUri }),
      ...(input.cardCid && { cardCid: input.cardCid }),
      ...(input.cardObservedAt && { cardObservedAt: input.cardObservedAt }),
      ...(input.cardLastCheckedAt && {
        cardLastCheckedAt: input.cardLastCheckedAt,
      }),
      ...(input.cardLastError && { cardLastError: input.cardLastError }),
      ...(input.cardFailureCount !== undefined && {
        cardFailureCount: input.cardFailureCount,
      }),
      ...(input.cardUnavailableAt && {
        cardUnavailableAt: input.cardUnavailableAt,
      }),
      ...(input.cardStaleAfter && { cardStaleAfter: input.cardStaleAfter }),
      ...(input.a2aEndpoint && { a2aEndpoint: input.a2aEndpoint }),
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

    return this.buildMarkdown(body, frontmatter);
  }

  public parseAgentContent(content: string): {
    about: string;
    skills: AgentSkill[];
    notes: string;
  } {
    return parseAgentBody(this.extractBody(content));
  }

  public parseEntity(entity: AgentEntity): {
    frontmatter: AgentFrontmatter;
    body: { about: string; skills: AgentSkill[]; notes: string };
  } {
    return {
      frontmatter: this.parseFrontMatter(
        withCurrentKind(entity.content),
        agentFrontmatterSchema,
      ),
      body: this.parseAgentContent(entity.content),
    };
  }
}
