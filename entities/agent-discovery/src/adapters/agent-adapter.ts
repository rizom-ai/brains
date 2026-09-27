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

  public fromMarkdown(markdown: string): Partial<AgentEntity> {
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
        entity.content,
        agentFrontmatterSchema,
      ),
      body: this.parseAgentContent(entity.content),
    };
  }
}
