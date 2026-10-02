import type { EntityPluginContext } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { networkPieceId } from "../adapters/network-piece-adapter";
import { agentEntitySchema, type AgentEntity } from "../schemas/agent";
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
const EXCERPT = 240;

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
  ): Promise<ListedRecord[]> => {
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
      ? page(listed.cursor, all)
      : all;
  };
  return page(undefined, []);
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? uri;
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
  const origin =
    value.canonicalUrl ??
    (kind === "link" ? value.url : undefined) ??
    agent.metadata.url;
  const excerpt = (value.summary ?? value.description ?? value.body ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT);
  const recordedAt =
    value.publishedAt ?? value.updatedAt ?? value.createdAt ?? now;
  const content = `# ${title}\n\n${text}`.trimEnd();
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
        url: agent.metadata.url,
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

export async function syncNetworkPieces(
  context: EntityPluginContext,
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
  const agents = (
    await context.entityService.listEntities(
      {
        entityType: "agent",
        options: { limit: 500, filter: { metadata: { status: "approved" } } },
      },
      agentEntitySchema,
    )
  ).filter((agent) => Boolean(agent.metadata.repoDid));
  const kept = await context.entityService.listEntities(
    { entityType: NETWORK_PIECE_ENTITY_TYPE, options: { limit: 10_000 } },
    networkPieceSchema,
  );
  const keptById = new Map(kept.map((piece) => [piece.id, piece]));

  for (const agent of agents) {
    signal.throwIfAborted();
    const repoDid = agent.metadata.repoDid;
    if (!repoDid) continue;
    report.brains += 1;
    const seen = new Set<string>();
    try {
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
            await context.entityService.createEntity({ entity: piece });
            report.created += 1;
          } else if (existing.metadata.cid === record.cid) {
            report.unchanged += 1;
          } else {
            await context.entityService.updateEntity({
              entity: { ...piece, created: existing.created },
            });
            report.updated += 1;
          }
        }
      }
    } catch (error) {
      // The repository answered badly or not at all: this brain's pieces stay
      // as they were, and the next sync tries again.
      context.logger.warn("Network pieces: a brain's repository was not read", {
        agent: agent.id,
        error: getErrorMessage(error),
      });
      report.unreachable.push(agent.id);
      continue;
    }
    // Withdrawn from the repository: withdrawn from the answers.
    for (const piece of kept) {
      if (piece.metadata.brain.did !== repoDid || seen.has(piece.id)) continue;
      await context.entityService.deleteEntity({
        entityType: NETWORK_PIECE_ENTITY_TYPE,
        id: piece.id,
      });
      report.deleted += 1;
    }
  }
  return report;
}
