import type { EntityAccess } from "@brains/sdk/entities";
import type { LoggerContract } from "@brains/utils/logger";
import { agent as agentDefinition } from "../agent-entity";
import { networkPiece } from "../network-piece-entity";
interface NetworkPieceContext {
  readonly entities: EntityAccess;
  readonly logger: LoggerContract;
}
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import { stripMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";
import { networkPieceId } from "./network-piece-id";
import type { AgentEntity } from "../schemas/agent";
import {
  NETWORK_PIECE_COLLECTIONS,
  NETWORK_PIECE_ENTITY_TYPE,
  networkPieceKindSchema,
  networkPieceSchema,
  type NetworkPieceEntity,
  type NetworkPieceKind,
} from "../schemas/network-piece";
import {
  resolvePdsEndpoint,
  type AtprotoCardFetch,
} from "./atproto-card-events";

/**
 * Rizom indexes the connected brains' published pieces from their ATProto
 * repositories: for every approved agent with a repository, each projected
 * collection is listed and kept as `network-piece` entities keyed by brain
 * and record. Nothing runs on another brain: a repository is a public read.
 * An unchanged record is left alone, a withdrawn one is deleted, and a brain
 * whose repository cannot be reached keeps its last index until the next sync.
 */

const PAGE = 100;
/** Pages read per collection before a repository is judged to misbehave. */
const MAX_PAGES = 50;
const EXCERPT = 240;
/** A record's body kept as the piece's content: enough to search and cite by. */
const CONTENT = 24_000;
const DID = /^did:(?:plc|web):[A-Za-z0-9._:%-]+$/;

const listedRecordSchema = z.object({
  uri: z.string(),
  cid: z.string(),
  value: z.looseObject({
    title: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    body: z.string().optional(),
    url: z.string().optional(),
    canonicalUrl: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    publishedAt: z.string().optional(),
  }),
});
const listRecordsSchema = z.object({
  records: z.array(listedRecordSchema),
  cursor: z.string().optional(),
});
type ListedRecord = z.output<typeof listedRecordSchema>;

export interface NetworkPiecesSyncReport {
  brains: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  /** Brains whose repository could not be read this time; their pieces stay. */
  unreachable: string[];
}

/** Every record of one collection in a repository, page by page. */
async function listCollection(
  fetchFn: AtprotoCardFetch,
  pdsEndpoint: string,
  repo: string,
  collection: string,
  signal: AbortSignal,
): Promise<ListedRecord[]> {
  const page = async (
    cursor: string | undefined,
    sofar: ListedRecord[],
    pages: number,
  ): Promise<ListedRecord[]> => {
    if (pages >= MAX_PAGES)
      throw new Error(
        `listRecords ${collection} did not end in ${MAX_PAGES} pages`,
      );
    const url = new URL(`${pdsEndpoint}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", repo);
    url.searchParams.set("collection", collection);
    url.searchParams.set("limit", String(PAGE));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchFn(url.href, { signal });
    if (!response.ok)
      throw new Error(
        `listRecords ${collection} failed with HTTP ${response.status}`,
      );
    const listed = listRecordsSchema.parse(await response.json());
    const all = sofar.concat(listed.records);
    return listed.cursor && listed.records.length > 0
      ? page(listed.cursor, all, pages + 1)
      : all;
  };
  return page(undefined, [], 0);
}

/** A page address a reader may be sent to: https, and nothing else. */
function httpsOnly(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

/**
 * A brain's home: the directory holds its A2A endpoint, and a reader is sent
 * to the site that endpoint belongs to, never to the endpoint itself.
 */
function homeOf(agent: AgentEntity): string {
  return new URL(agent.metadata.url).origin;
}

/**
 * The opening lines in plain words: markdown stripped line by line so
 * blocks keep a space between them, whitespace folded, and a body that
 * opens by repeating its own title starts after it.
 */
function excerptOf(title: string, text: string): string {
  const words = text
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line).trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ");
  const opening = words.startsWith(title)
    ? words.slice(title.length).trim()
    : words;
  return opening.slice(0, EXCERPT);
}

/** The piece a record becomes, in its brain's words. */
function pieceOf(
  agent: AgentEntity,
  repoDid: string,
  kind: NetworkPieceKind,
  collection: string,
  record: ListedRecord,
  now: string,
): NetworkPieceEntity {
  const value = record.value;
  const named = value.title?.trim() ?? "";
  const title = named.length > 0 ? named : rkeyOf(record.uri);
  const text = [value.summary, value.description, value.body]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n");
  const home = homeOf(agent);
  // A record names its page when its brain projected one; otherwise the home.
  const origin =
    httpsOnly(value.canonicalUrl) ??
    (kind === "link" ? httpsOnly(value.url) : undefined) ??
    home;
  const excerpt = excerptOf(
    title,
    value.summary ?? value.description ?? value.body ?? "",
  );
  const recordedAt =
    value.publishedAt ?? value.updatedAt ?? value.createdAt ?? now;
  const content = `# ${title}\n\n${text.slice(0, CONTENT)}`.trimEnd();
  return networkPieceSchema.parse({
    id: networkPieceId(repoDid, collection, rkeyOf(record.uri)),
    entityType: NETWORK_PIECE_ENTITY_TYPE,
    content,
    contentHash: computeContentHash(content),
    created: recordedAt,
    updated: now,
    visibility: "public",
    metadata: {
      title,
      kind,
      status: "published",
      brain: {
        did: repoDid,
        name: agent.metadata.name,
        url: home,
      },
      origin,
      collection,
      rkey: rkeyOf(record.uri),
      cid: record.cid,
      recordedAt,
      excerpt,
    },
  });
}

/**
 * A brain discovered by its card has a home but may not yet have a repository
 * in the directory. Its home names its DID at the well-known address; once
 * learned, the directory keeps it.
 */
async function learnRepoDid(
  context: NetworkPieceContext,
  fetchFn: AtprotoCardFetch,
  agent: AgentEntity,
  signal: AbortSignal,
): Promise<string | undefined> {
  const response = await fetchFn(`${homeOf(agent)}/.well-known/atproto-did`, {
    signal,
  });
  if (!response.ok) return undefined;
  const did = (await response.text()).trim();
  if (!DID.test(did)) return undefined;
  await context.entities.update(agentDefinition, {
    ...agent,
    metadata: { ...agent.metadata, repoDid: did },
  });
  return did;
}

export async function syncNetworkPieces(
  context: NetworkPieceContext,
  fetchFn: AtprotoCardFetch,
  signal: AbortSignal,
  now: string = new Date().toISOString(),
): Promise<NetworkPiecesSyncReport> {
  const report: NetworkPiecesSyncReport = {
    brains: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    unreachable: [],
  };
  const agents = await context.entities.list(agentDefinition, {
    limit: 500,
    filter: { metadata: { status: "approved" } },
  });
  const kept = await context.entities.list(networkPiece, { limit: 10_000 });
  const keptById = new Map(kept.map((piece) => [piece.id, piece]));

  for (const agent of agents) {
    signal.throwIfAborted();
    const seen = new Set<string>();
    try {
      const repoDid =
        agent.metadata.repoDid ??
        (await learnRepoDid(context, fetchFn, agent, signal));
      if (!repoDid) continue;
      report.brains += 1;
      const pdsEndpoint = await resolvePdsEndpoint(repoDid, fetchFn, signal);
      for (const kind of networkPieceKindSchema.options) {
        const collection = NETWORK_PIECE_COLLECTIONS[kind];
        const records = await listCollection(
          fetchFn,
          pdsEndpoint,
          repoDid,
          collection,
          signal,
        );
        for (const record of records) {
          const piece = pieceOf(agent, repoDid, kind, collection, record, now);
          seen.add(piece.id);
          const existing = keptById.get(piece.id);
          if (!existing) {
            await context.entities.create(networkPiece, piece);
            report.created += 1;
          } else if (existing.metadata.cid === record.cid) {
            report.unchanged += 1;
          } else {
            await context.entities.update(networkPiece, {
              ...piece,
              created: existing.created,
            });
            report.updated += 1;
          }
        }
      }
      // Withdrawn from the repository: withdrawn from the answers.
      for (const piece of kept) {
        if (piece.metadata.brain.did !== repoDid || seen.has(piece.id)) {
          continue;
        }
        await context.entities.delete(networkPiece, piece.id);
        report.deleted += 1;
      }
    } catch (error) {
      // The repository answered badly or not at all: this brain's pieces stay
      // as they were, and the next sync tries again.
      context.logger.warn("Network pieces: a brain's repository was not read", {
        agent: agent.id,
        error: getErrorMessage(error),
      });
      report.unreachable.push(agent.id);
    }
  }
  return report;
}
