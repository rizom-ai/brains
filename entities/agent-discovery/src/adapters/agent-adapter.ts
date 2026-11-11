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

    return this.buildMarkdown(body, frontmatter);
  }

  /**
   * Rebuild a parsed agent's markdown with only `patch` changed. A patched
   * field follows createAgentContent's rules: undefined or empty drops it.
   */
  public rewriteAgentContent(
    parsed: ParsedAgent,
    patch: Partial<CreateAgentContentInput> = {},
  ): string {
    return this.createAgentContent({
      ...parsed.frontmatter,
      ...parsed.body,
      ...patch,
    });
  }

  public parseAgentContent(content: string): {
    about: string;
    skills: AgentSkill[];
    notes: string;
  } {
    return parseAgentBody(this.extractBody(content));
  }

  public parseEntity(entity: AgentEntity): ParsedAgent {
    return {
      frontmatter: this.parseFrontMatter(
        entity.content,
        agentFrontmatterSchema,
      ),
      body: this.parseAgentContent(entity.content),
    };
  }
}
