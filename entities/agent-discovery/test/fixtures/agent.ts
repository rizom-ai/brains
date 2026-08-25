import { slugifyUrl } from "@brains/utils/string-utils";
import {
  createAgentContent,
  parseAgentEntity,
} from "../../src/lib/agent-content";
import type {
  AgentEntity,
  AgentSkill,
  AgentStatus,
  AgentWithData,
} from "../../src/schemas/agent";
import type { AgentView } from "../../src/templates/agent-view";

export const DEFAULT_DISCOVERED_AT = "2026-03-31T00:00:00.000Z";

export interface TestAgentInput {
  id?: string;
  name?: string;
  kind?: "person" | "team" | "organization";
  organization?: string;
  brainName?: string;
  url?: string;
  did?: string;
  status?: AgentStatus;
  discoveredAt?: string;
  introducedBy?: string[];
  hops?: number;
  about?: string;
  skills?: AgentSkill[];
  notes?: string;
}

export function createTestAgent(input: TestAgentInput = {}): AgentEntity {
  const name = input.name ?? "Yeehaa";
  const url = input.url ?? `https://${name.toLowerCase()}.io`;
  const discoveredAt = input.discoveredAt ?? DEFAULT_DISCOVERED_AT;

  return {
    id: input.id ?? extractDomainId(url),
    entityType: "agent",
    content: createAgentContent({
      name,
      kind: input.kind ?? "person",
      ...(input.organization !== undefined
        ? { organization: input.organization }
        : {}),
      brainName: input.brainName ?? `${name}'s Brain`,
      ...(input.did !== undefined ? { did: input.did } : {}),
      url,
      status: input.status ?? "discovered",
      discoveredAt,
      ...(input.introducedBy !== undefined
        ? { introducedBy: input.introducedBy }
        : {}),
      ...(input.hops !== undefined ? { hops: input.hops } : {}),
      about: input.about ?? `${name} is a brain agent.`,
      skills: input.skills ?? [
        {
          name: "Content Creation",
          description: "Create blog posts",
          tags: ["blog", "writing"],
        },
      ],
      notes: input.notes ?? "Connected via A2A.",
    }),
    metadata: {
      name,
      url,
      status: input.status ?? "discovered",
      discoveredAt,
      slug: slugifyUrl(url),
    },
    contentHash: "abc123",
    visibility: "public",
    created: discoveredAt,
    updated: discoveredAt,
  };
}

export function createTestAgentWithData(
  input: TestAgentInput = {},
): AgentWithData {
  const entity = createTestAgent(input);
  const parsed = parseAgentEntity(entity);

  return {
    ...entity,
    frontmatter: parsed.frontmatter,
    about: parsed.body.about,
    skills: parsed.body.skills,
    notes: parsed.body.notes,
  };
}

export function createTemplateAgent(input: TestAgentInput = {}): AgentView {
  const agent = createTestAgentWithData(input);
  const nullableMetadata = {
    ...agent.metadata,
    discoveredAt: agent.metadata.discoveredAt ?? null,
    repoDid: agent.metadata.repoDid ?? null,
    brainDid: agent.metadata.brainDid ?? null,
    anchorDid: agent.metadata.anchorDid ?? null,
    cardUri: agent.metadata.cardUri ?? null,
    cardCid: agent.metadata.cardCid ?? null,
    cardObservedAt: agent.metadata.cardObservedAt ?? null,
    cardLastCheckedAt: agent.metadata.cardLastCheckedAt ?? null,
    cardLastError: agent.metadata.cardLastError ?? null,
    cardFailureCount: agent.metadata.cardFailureCount ?? null,
    cardUnavailableAt: agent.metadata.cardUnavailableAt ?? null,
    cardStaleAfter: agent.metadata.cardStaleAfter ?? null,
    a2aEndpoint: agent.metadata.a2aEndpoint ?? null,
  };
  const nullableFrontmatter = {
    ...agent.frontmatter,
    organization: agent.frontmatter.organization ?? null,
    did: agent.frontmatter.did ?? null,
    repoDid: agent.frontmatter.repoDid ?? null,
    brainDid: agent.frontmatter.brainDid ?? null,
    anchorDid: agent.frontmatter.anchorDid ?? null,
    cardUri: agent.frontmatter.cardUri ?? null,
    cardCid: agent.frontmatter.cardCid ?? null,
    cardObservedAt: agent.frontmatter.cardObservedAt ?? null,
    cardLastCheckedAt: agent.frontmatter.cardLastCheckedAt ?? null,
    cardLastError: agent.frontmatter.cardLastError ?? null,
    cardFailureCount: agent.frontmatter.cardFailureCount ?? null,
    cardUnavailableAt: agent.frontmatter.cardUnavailableAt ?? null,
    cardStaleAfter: agent.frontmatter.cardStaleAfter ?? null,
    a2aEndpoint: agent.frontmatter.a2aEndpoint ?? null,
    introducedBy: agent.frontmatter.introducedBy ?? null,
    hops: agent.frontmatter.hops ?? null,
  };

  return {
    ...agent,
    metadata: nullableMetadata,
    frontmatter: nullableFrontmatter,
    url: `/agents/${agent.metadata.slug}`,
    typeLabel: "Agent",
  };
}

function extractDomainId(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
