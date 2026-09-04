import { z, type EntityReactionContext } from "@brains/sdk/entities";
import { createAgentContent, parseAgentEntity } from "../lib/agent-content";
import { defineTool, type ServiceToolDefinition } from "@brains/sdk/services";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import { buildAgentFromCard } from "../lib/build-agent-content";
import {
  extractDomain,
  fetchAgentCard,
  type FetchFn,
} from "../lib/fetch-agent-card";

import { agentEntitySchema } from "../schemas/agent";

const agentScanDirectoriesInputSchema: z.ZodObject<Record<string, never>> =
  z.object({});

export type AgentScanContext = EntityReactionContext;

export interface AgentScanDirectoriesResult {
  peersScanned: number;
  unreachablePeers: number;
  created: number;
  updated: number;
  alreadyKnown: number;
  unverified: number;
  createdDomains: string[];
  introducingPeers: string[];
  observedAt: string;
}

const remoteDirectorySchema = z.object({
  agents: z.array(z.object({ name: z.string(), url: z.string() })),
});

async function fetchAgentDirectory(
  domain: string,
  fetchFn: FetchFn,
  signal?: AbortSignal,
): Promise<z.infer<typeof remoteDirectorySchema> | null> {
  const url = `https://${domain}/.well-known/agent-directory.json`;
  try {
    const response = await fetchFn(url, signal ? { signal } : undefined);
    if (!response.ok) return null;

    const parsed = remoteDirectorySchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    if (signal?.aborted) throw signal.reason;
    return null;
  }
}

export async function scanAgentDirectories(
  context: AgentScanContext,
  fetchFn: FetchFn = globalThis.fetch,
  signal?: AbortSignal,
): Promise<AgentScanDirectoriesResult> {
  const allAgents = await context.entities.listEntities(
    {
      entityType: AGENT_ENTITY_TYPE,
    },
    agentEntitySchema,
  );
  const peers = allAgents.filter(
    (agent) => agent.metadata.status === "approved",
  );
  const selfDomain = context.domain?.toLowerCase();

  // Aggregate across all directories first so an agent reported by
  // several peers is upserted once, with its full set of introducers.
  const introducersByDomain = new Map<string, Set<string>>();
  let unreachablePeers = 0;
  for (const peer of peers) {
    signal?.throwIfAborted();
    const directory = await fetchAgentDirectory(peer.id, fetchFn, signal);
    if (!directory) {
      unreachablePeers += 1;
      continue;
    }
    for (const entry of directory.agents) {
      const domain = extractDomain(entry.url).toLowerCase();
      if (!domain || domain === selfDomain || domain === peer.id) continue;
      const introducers = introducersByDomain.get(domain) ?? new Set();
      introducers.add(peer.id);
      introducersByDomain.set(domain, introducers);
    }
  }

  const agentsById = new Map(allAgents.map((agent) => [agent.id, agent]));
  const now = new Date().toISOString();
  const createdDomains: string[] = [];
  const introducingPeers = new Set<string>();
  let created = 0;
  let updated = 0;
  let alreadyKnown = 0;
  let unverified = 0;

  for (const [domain, introducers] of introducersByDomain) {
    signal?.throwIfAborted();
    const existing = agentsById.get(domain);
    if (existing) {
      const { frontmatter, body } = parseAgentEntity(existing);
      const prior = frontmatter.introducedBy ?? [];
      // Only sightings accumulate introducers. Agents known first-hand
      // (connected, or discovered via ATProto) don't gain provenance
      // from peer reports — how we already know them stands.
      if (frontmatter.status !== "discovered" || prior.length === 0) {
        alreadyKnown += 1;
        continue;
      }
      const merged = [
        ...prior,
        ...[...introducers].filter((id) => !prior.includes(id)),
      ];
      if (merged.length === prior.length) continue;

      await context.entities.update({
        ...existing,
        content: createAgentContent({
          ...frontmatter,
          introducedBy: merged,
          about: body.about,
          skills: body.skills,
          notes: body.notes,
        }),
        updated: now,
      });
      updated += 1;
      continue;
    }

    // The pointee's own card is the source of truth — the peer only
    // vouches that it exists.
    const card = await fetchAgentCard(domain, fetchFn, signal);
    if (!card) {
      unverified += 1;
      continue;
    }

    const built = buildAgentFromCard(card, {
      status: "discovered",
      provenance: { introducedBy: [...introducers], hops: 2 },
    });
    const parsedContent = parseAgentEntity({ content: built.content });
    await context.entities.create({
      id: domain,
      entityType: AGENT_ENTITY_TYPE,
      content: built.content,
      metadata: { ...parsedContent.frontmatter, ...built.metadata },
      visibility: "public",
      created: now,
      updated: now,
    });
    created += 1;
    createdDomains.push(domain);
    for (const introducer of introducers) introducingPeers.add(introducer);
  }

  return {
    peersScanned: peers.length,
    unreachablePeers,
    created,
    updated,
    alreadyKnown,
    unverified,
    createdDomains,
    introducingPeers: [...introducingPeers],
    observedAt: now,
  };
}

const agentScanDirectoriesOutputSchema: z.ZodObject<{
  peersScanned: z.ZodNumber;
  unreachablePeers: z.ZodNumber;
  created: z.ZodNumber;
  updated: z.ZodNumber;
  alreadyKnown: z.ZodNumber;
  unverified: z.ZodNumber;
}> = z.object({
  peersScanned: z.number(),
  unreachablePeers: z.number(),
  created: z.number(),
  updated: z.number(),
  alreadyKnown: z.number(),
  unverified: z.number(),
});

/** Record second-order sightings from each approved peer's public directory. */
export function agentScanDirectoriesTool(
  fetchFn: FetchFn = globalThis.fetch,
): ServiceToolDefinition<
  "scan-directories",
  typeof agentScanDirectoriesInputSchema,
  typeof agentScanDirectoriesOutputSchema
> {
  return defineTool({
    name: "scan-directories",
    description:
      "Walk each approved agent's public directory at /.well-known/agent-directory.json and record second-order sightings: agents your peers list that you are not connected to. A sighting is saved as a discovered agent with provenance (which peers introduced it, hop count) and data from its own verified Agent Card. Re-scanning is idempotent: connected agents are skipped and repeat sightings only merge new introducers. Never approves anything; promotion stays with the connect tool.",
    input: agentScanDirectoriesInputSchema,
    output: agentScanDirectoriesOutputSchema,
    permission: "trusted",
    sideEffects: "external",
    execute: async ({ caller, signal, ...context }) => {
      context.permissions.assertEntityActionAllowed(
        AGENT_ENTITY_TYPE,
        "create",
        caller ?? {},
      );
      const result = await scanAgentDirectories(context, fetchFn, signal);
      return {
        peersScanned: result.peersScanned,
        unreachablePeers: result.unreachablePeers,
        created: result.created,
        updated: result.updated,
        alreadyKnown: result.alreadyKnown,
        unverified: result.unverified,
      };
    },
  });
}
