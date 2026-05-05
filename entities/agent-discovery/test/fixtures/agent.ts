import { slugifyUrl } from "@brains/utils";
import { AgentAdapter } from "../../src/adapters/agent-adapter";
import type {
  AgentEntity,
  AgentStatus,
  AgentWithData,
} from "../../src/schemas/agent";

const adapter = new AgentAdapter();

export const DEFAULT_DISCOVERED_AT = "2026-03-31T00:00:00.000Z";

export interface TestAgentInput {
  id?: string;
  name?: string;
  kind?: "professional" | "team" | "collective";
  organization?: string;
  brainName?: string;
  url?: string;
  did?: string;
  status?: AgentStatus;
  discoveredAt?: string;
  about?: string;
  notes?: string;
}

export function createTestAgent(input: TestAgentInput = {}): AgentEntity {
  const name = input.name ?? "Yeehaa";
  const url = input.url ?? `https://${name.toLowerCase()}.io`;
  const discoveredAt = input.discoveredAt ?? DEFAULT_DISCOVERED_AT;

  return {
    id: input.id ?? extractDomainId(url),
    entityType: "agent",
    content: adapter.createAgentContent({
      name,
      kind: input.kind ?? "professional",
      ...(input.organization !== undefined
        ? { organization: input.organization }
        : {}),
      brainName: input.brainName ?? `${name}'s Brain`,
      ...(input.did !== undefined ? { did: input.did } : {}),
      url,
      status: input.status ?? "discovered",
      discoveredAt,
      about: input.about ?? `${name} is a brain agent.`,
      skills: [
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
    created: discoveredAt,
    updated: discoveredAt,
  };
}

export function createTestAgentWithData(
  input: TestAgentInput = {},
): AgentWithData {
  const entity = createTestAgent(input);
  const parsed = adapter.parseEntity(entity);

  return {
    ...entity,
    frontmatter: parsed.frontmatter,
    about: parsed.body.about,
    skills: parsed.body.skills,
    notes: parsed.body.notes,
  };
}

function extractDomainId(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
