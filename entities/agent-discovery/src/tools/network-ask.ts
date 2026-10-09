import { A2A_CHANNELS } from "@brains/contracts";
import type { ServicePluginContext } from "@brains/plugins";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { AgentAdapter } from "../adapters/agent-adapter";
import { AGENT_ENTITY_TYPE } from "../lib/constants";
import {
  choosePeers,
  collectNetworkAnswers,
  type PeerCandidate,
  type PeerReply,
} from "../lib/network-ask";
import { normalizeCosineDistance } from "../lib/proximity-map";
import { agentEntitySchema } from "../schemas/agent";

const networkAskInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(4_000)
    .describe("The question, as the visitor asked it."),
});

type NetworkAskContext = Pick<
  ServicePluginContext,
  "entityService" | "messaging" | "semantic"
>;

const BRAIN_CHARACTER = {
  entityId: "brain-character",
  entityType: "brain-character",
} as const;

const agentAdapter = new AgentAdapter();

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
    const { frontmatter, body } = agentAdapter.parseEntity(agent);
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

/** One peer's reply over the A2A ask channel, however the bus answered. */
async function askPeer(
  context: NetworkAskContext,
  peer: PeerCandidate,
  question: string,
): Promise<PeerReply> {
  try {
    const reply = await context.messaging.send({
      type: A2A_CHANNELS.askRequest,
      payload: { agent: peer.id, question },
    });
    if ("noop" in reply) return reply;
    return reply.success
      ? { success: true, data: reply.data }
      : { success: false, ...(reply.error ? { error: reply.error } : {}) };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, "network unavailable"),
    };
  }
}

/**
 * Ask the network: the approved peers whose skills fit the question (three
 * at most, or the two nearest), in parallel, each within the A2A ask budget.
 * Public and side-effect free, so a visitor's turn may use it.
 */
export function createNetworkAskTool(context: NetworkAskContext): Tool {
  return {
    name: "network_ask",
    description:
      "Ask the connected brains a question. Picks the approved peers whose skills fit it best (at most three, or the two nearest when none fit), asks them in parallel with a short budget each, and returns every answer with its sources attributed to the brain that gave it, plus who did not answer. Use it when this brain holds little on the question or the user asks what the network thinks; pass the question as asked.",
    inputSchema: networkAskInputSchema.shape,
    visibility: "public",
    sideEffects: "none",
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
