import { parseAgentEntity } from "../lib/agent-content";
import { a2aAskContract, toSdkError } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import {
  choosePeers,
  collectNetworkAnswers,
  type PeerCandidate,
  type PeerReply,
} from "../lib/network-ask";
import { normalizeCosineDistance } from "../lib/proximity-map";
import { agentEntitySchema } from "../schemas/agent";
import {
  type Tool,
  type ToolResponse,
} from "@brains/sdk/internal/service-runtime";
import type { AgentContext } from "../lib/agent-context";

const networkAskInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(4_000)
    .describe("The question, as the visitor asked it."),
});

type NetworkAskContext = Pick<
  AgentContext,
  "entityService" | "logger" | "messaging" | "semantic"
>;

const BRAIN_CHARACTER = {
  entityId: "brain-character",
  entityType: "brain-character",
} as const;

/** Each indexed agent's semantic distance from this brain; none when the index is unavailable. */
async function peerDistances(
  context: NetworkAskContext,
): Promise<Map<string, number>> {
  try {
    const projection = await context.semantic.project({
      types: [AGENT_ENTITY_TYPE],
      origin: BRAIN_CHARACTER,
    });
    return new Map(
      projection.points.map((point) => [
        point.entityId,
        normalizeCosineDistance(point.distanceToOrigin),
      ]),
    );
  } catch {
    // Distance only breaks ties and picks the fallback peers; a question is
    // still matched on skills while the semantic index is unavailable, which
    // is the same answer the proximity map gives before the index is built.
    return new Map();
  }
}

async function listPeers(context: NetworkAskContext): Promise<PeerCandidate[]> {
  if (!context.entityService.hasEntityType(AGENT_ENTITY_TYPE)) return [];
  const [agents, distances] = await Promise.all([
    context.entityService.listEntities(
      { entityType: AGENT_ENTITY_TYPE },
      agentEntitySchema,
    ),
    peerDistances(context),
  ]);
  return agents.map((agent) => {
    const { frontmatter, body } = parseAgentEntity(agent);
    const distance = distances.get(agent.id);
    return {
      id: agent.id,
      name: frontmatter.name,
      url: frontmatter.url,
      status: frontmatter.status,
      about: body.about,
      skills: body.skills,
      ...(distance !== undefined ? { distance } : {}),
    };
  });
}

/** Whether the directory holds a peer the network may ask: an approved one. */
async function hasApprovedPeer(context: NetworkAskContext): Promise<boolean> {
  if (!context.entityService.hasEntityType(AGENT_ENTITY_TYPE)) return false;
  const approved = await context.entityService.countEntities({
    entityType: AGENT_ENTITY_TYPE,
    options: { filter: { metadata: { status: "approved" } } },
  });
  return approved > 0;
}

/** One peer's reply to the A2A ask contract; a refused question is a failure. */
async function askPeer(
  context: NetworkAskContext,
  peer: PeerCandidate,
  question: string,
): Promise<PeerReply> {
  try {
    return await context.messaging.request(a2aAskContract, {
      agent: peer.id,
      question,
    });
  } catch (error) {
    // The visitor's turn hears the failure's public form; the diagnostic
    // stays in this brain's log.
    context.logger.warn(`Could not ask ${peer.id}`, {
      error: getErrorMessage(error),
    });
    return { status: "failed", error: toSdkError(error).toJSON() };
  }
}

/**
 * Ask the network: the approved peers whose skills fit the question (three
 * at most, or the two nearest), in parallel, each within the A2A ask budget.
 * Public and side-effect free, so a visitor's turn may use it. Offered only
 * while an approved peer exists: with none, it could only report silence.
 */
export function createNetworkAskTool(context: NetworkAskContext): Tool {
  return {
    name: "network_ask",
    description:
      "Ask the connected brains a question. Picks the approved peers whose skills fit it best (at most three, or the two nearest when none fit), asks them in parallel (each peer answers with its own model turn, so expect to wait up to half a minute), and returns every answer with its sources attributed to the brain that gave it, plus who did not answer. Search this brain first; use it when that search holds little on the question or the user asks what the network thinks; pass the question as asked.",
    inputSchema: networkAskInputSchema.shape,
    visibility: "public",
    sideEffects: "none",
    isAvailable: () => hasApprovedPeer(context),
    handler: async (rawInput): Promise<ToolResponse> => {
      const parsed = networkAskInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }
      const { question } = parsed.data;
      const peers = choosePeers(question, await listPeers(context));
      const replies = await Promise.all(
        peers.map(async (peer) => ({
          peer,
          reply: await askPeer(context, peer, question),
        })),
      );
      return { success: true, data: collectNetworkAnswers(question, replies) };
    },
  };
}
