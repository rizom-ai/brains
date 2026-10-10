import {
  SourceCitationSchema,
  sourceBrainSchema,
  type SourceCitation,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { AgentSkill, AgentStatus } from "../schemas/agent";

/**
 * Asking the network: which peers a question goes to, and what comes back.
 * Pure; the tool supplies the directory and the transport.
 */

/** Peers asked at most, so one question never fans out across a directory. */
export const MAX_ASKED_PEERS = 3;
/** Nearest peers asked when no skill matches the question. */
export const NEAREST_PEERS = 2;
/** The least a peer's skills must share with the question to be asked. */
const MIN_MATCH_SCORE = 3;

export interface PeerCandidate {
  /** The agent's id: its domain. */
  id: string;
  name: string;
  /** The agent's A2A url or home, from the directory entry. */
  url: string;
  status: AgentStatus;
  about: string;
  skills: AgentSkill[];
  /** Semantic distance from this brain, when the agent is indexed. */
  distance?: number;
}

const STOP_WORDS = new Set([
  "about",
  "and",
  "are",
  "can",
  "could",
  "does",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "should",
  "than",
  "that",
  "the",
  "them",
  "then",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/** Words that carry a text: lowercase, three letters or more, singular. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
      .map((word) =>
        word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
      ),
  );
}

/** How much a peer's skills share with the question: tags over skill text over the about. */
function matchScore(question: Set<string>, peer: PeerCandidate): number {
  const tags = words(peer.skills.flatMap((skill) => skill.tags).join(" "));
  const skillText = words(
    peer.skills.map((skill) => `${skill.name} ${skill.description}`).join(" "),
  );
  const about = words(peer.about);
  return Array.from(question).reduce(
    (score, word) =>
      score +
      (tags.has(word) ? 3 : skillText.has(word) ? 2 : about.has(word) ? 1 : 0),
    0,
  );
}

function byDistanceThenId(left: PeerCandidate, right: PeerCandidate): number {
  const l = left.distance ?? Number.POSITIVE_INFINITY;
  const r = right.distance ?? Number.POSITIVE_INFINITY;
  return l === r ? left.id.localeCompare(right.id) : l - r;
}

/**
 * The peers a question goes to: approved only, the best skill matches (at
 * most three, each above a minimum), or the two nearest when nothing matches.
 */
export function choosePeers(
  question: string,
  peers: PeerCandidate[],
): PeerCandidate[] {
  const approved = peers.filter((peer) => peer.status === "approved");
  const asked = words(question);
  const matched = approved
    .map((peer) => ({ peer, score: matchScore(asked, peer) }))
    .filter(({ score }) => score >= MIN_MATCH_SCORE)
    .sort(
      (left, right) =>
        right.score - left.score || byDistanceThenId(left.peer, right.peer),
    )
    .slice(0, MAX_ASKED_PEERS)
    .map(({ peer }) => peer);
  if (matched.length > 0) return matched;
  return approved
    .filter((peer) => peer.distance !== undefined)
    .sort(byDistanceThenId)
    .slice(0, NEAREST_PEERS);
}

type NetworkAnswerSchema = z.ZodObject<{
  agent: z.ZodString;
  brain: typeof sourceBrainSchema;
  answer: z.ZodString;
  sources: z.ZodArray<typeof SourceCitationSchema>;
}>;

export const networkAnswerSchema: NetworkAnswerSchema = z.object({
  agent: z.string(),
  brain: sourceBrainSchema,
  answer: z.string(),
  sources: z.array(SourceCitationSchema),
});

export type NetworkAnswer = z.output<typeof networkAnswerSchema>;

type NetworkUnansweredSchema = z.ZodObject<{
  agent: z.ZodString;
  brain: typeof sourceBrainSchema;
  reason: z.ZodString;
}>;

export const networkUnansweredSchema: NetworkUnansweredSchema = z.object({
  agent: z.string(),
  brain: sourceBrainSchema,
  reason: z.string(),
});

export type NetworkUnanswered = z.output<typeof networkUnansweredSchema>;

type NetworkAskResultSchema = z.ZodObject<{
  question: z.ZodString;
  asked: z.ZodArray<z.ZodString>;
  answers: z.ZodArray<NetworkAnswerSchema>;
  unanswered: z.ZodArray<NetworkUnansweredSchema>;
  sources: z.ZodArray<typeof SourceCitationSchema>;
}>;

/** What network_ask returns: who was asked, what each said, and the card's sources. */
export const networkAskResultSchema: NetworkAskResultSchema = z.object({
  question: z.string(),
  asked: z.array(z.string()),
  answers: z.array(networkAnswerSchema),
  unanswered: z.array(networkUnansweredSchema),
  sources: z.array(SourceCitationSchema),
});

export type NetworkAskResult = z.output<typeof networkAskResultSchema>;

/** What the ask channel returns for one peer. */
const peerReplySchema = z.object({
  response: z.string(),
  sources: z.array(SourceCitationSchema).default([]),
});

const MAX_EXCERPT = 280;

function excerpt(text: string): string {
  const folded = text.replace(/\s+/g, " ").trim();
  return folded.length > MAX_EXCERPT
    ? `${folded.slice(0, MAX_EXCERPT - 1).trimEnd()}…`
    : folded;
}

/** A peer's home: the site its A2A endpoint belongs to. */
export function peerHome(peer: Pick<PeerCandidate, "id" | "url">): string {
  try {
    return new URL(peer.url).origin;
  } catch {
    return `https://${peer.id}`;
  }
}

/** A peer as the brain its answer and sources are attributed to. */
export function peerBrain(
  peer: Pick<PeerCandidate, "id" | "name" | "url">,
): NetworkAnswer["brain"] {
  return { name: peer.name, url: peerHome(peer) };
}

/** The reply of one peer, as the transport returned it. */
export type PeerReply =
  | { success: true; data?: unknown }
  | { success: false; error?: string }
  | { noop: true };

/**
 * Fold the peers' replies into the tool's result. An answering peer is cited
 * as itself, then by what it cited, each source attributed to the peer unless
 * the peer attributed it elsewhere. A refusal, timeout or absent network
 * leaves the peer in `unanswered` with the reason.
 */
export function collectNetworkAnswers(
  question: string,
  replies: Array<{ peer: PeerCandidate; reply: PeerReply }>,
): NetworkAskResult {
  const answers: NetworkAnswer[] = [];
  const unanswered: NetworkUnanswered[] = [];
  for (const { peer, reply } of replies) {
    const brain = peerBrain(peer);
    const parsed =
      "success" in reply && reply.success
        ? peerReplySchema.safeParse(reply.data)
        : undefined;
    if (parsed?.success) {
      answers.push({
        agent: peer.id,
        brain,
        answer: parsed.data.response,
        sources: parsed.data.sources.map((source) => ({
          ...source,
          brain: source.brain ?? brain,
        })),
      });
      continue;
    }
    const reason =
      "success" in reply && !reply.success && reply.error
        ? reply.error
        : "network unavailable";
    unanswered.push({ agent: peer.id, brain, reason });
  }
  const sources: SourceCitation[] = answers.flatMap((answer) => [
    {
      id: `agent:${answer.agent}`,
      title: answer.brain.name,
      source: "agent",
      entityType: "agent",
      entityId: answer.agent,
      ...(answer.brain.url ? { url: answer.brain.url } : {}),
      excerpt: excerpt(answer.answer),
      brain: answer.brain,
      provenance: { toolName: "network_ask" },
    },
    ...answer.sources,
  ]);
  return {
    question,
    asked: replies.map(({ peer }) => peer.id),
    answers,
    unanswered,
    sources,
  };
}
