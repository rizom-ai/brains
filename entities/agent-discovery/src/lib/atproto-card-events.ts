import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_CARD_UNAVAILABLE,
  ATPROTO_BRAIN_DISCOVERED,
  atprotoBrainCardDiscoveredPayloadSchema,
  atprotoBrainCardUnavailablePayloadSchema,
  type AtprotoBrainCardRecord,
  type AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import type { EntityPluginContext, IRuntimeStateStore } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import {
  createSafePublicFetch,
  type ResolveHostname,
} from "@brains/utils/safe-public-fetch";
import { slugifyUrl } from "@brains/utils/string-utils";

import { z } from "@brains/utils/zod";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { FetchFn } from "./fetch-agent-card";
import {
  agentEntitySchema,
  type AgentEntity,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";

const agentAdapter = new AgentAdapter();
const CARD_UNAVAILABLE_FAILURE_THRESHOLD = 3;

export const CARD_REFRESH_STATE_NAMESPACE = "agent-discovery.card-refresh";

/** The refresh loop's record for one agent. Nothing else reads it, so it stays out of the entity. */
export const cardRefreshStateSchema: z.ZodObject<{
  cid: z.ZodOptional<z.ZodString>;
  lastError: z.ZodOptional<z.ZodString>;
  failureCount: z.ZodOptional<z.ZodNumber>;
  unavailableAt: z.ZodOptional<z.ZodString>;
  staleAfter: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** The card snapshot last applied to the agent. */
  cid: z.string().optional(),
  lastError: z.string().optional(),
  failureCount: z.number().int().nonnegative().optional(),
  unavailableAt: z.string().optional(),
  /** When a never-approved unavailable candidate may be archived. */
  staleAfter: z.string().optional(),
});

export type CardRefreshState = z.output<typeof cardRefreshStateSchema>;

type CardRefreshStore = IRuntimeStateStore<CardRefreshState>;

function cardRefreshStore(context: EntityPluginContext): CardRefreshStore {
  return context.runtimeState.scoped({
    namespace: CARD_REFRESH_STATE_NAMESPACE,
    schema: cardRefreshStateSchema,
  });
}

/**
 * An agent's refresh record. An agent an earlier release tracked in its own
 * card fields starts from those, so failure counts and stale deadlines carry over.
 */
async function readRefreshState(
  store: CardRefreshStore,
  agent: AgentEntity,
): Promise<CardRefreshState> {
  const recorded = await store.get(agent.id);
  if (recorded) return recorded;
  const stored = agent.metadata;
  const seeded: CardRefreshState = {
    ...(stored.cardCid && { cid: stored.cardCid }),
    ...(stored.cardLastError && { lastError: stored.cardLastError }),
    ...(stored.cardFailureCount !== undefined && {
      failureCount: stored.cardFailureCount,
    }),
    ...(stored.cardUnavailableAt && {
      unavailableAt: stored.cardUnavailableAt,
    }),
    ...(stored.cardStaleAfter && { staleAfter: stored.cardStaleAfter }),
  };
  await store.set(agent.id, seeded);
  return seeded;
}
const pdsRecordResponseSchema = z.looseObject({
  uri: z.string().min(1),
  cid: z.string().min(1),
  value: z.unknown(),
});

/** The slice of a PLC directory document this module reads. */
const plcDocumentSchema = z.looseObject({
  service: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        serviceEndpoint: z.string().optional(),
      }),
    )
    .optional(),
});

function toAgentSkills(record: AtprotoBrainCardRecord): AgentSkill[] {
  return record.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    tags: skill.tags ?? [],
  }));
}

function domainIdFromUrl(url: string): string {
  return new URL(url).hostname;
}

function buildNotes(input: {
  repoDid: string;
  uri: string;
  cid: string;
}): string {
  return [
    `ATProto card: ${input.uri}`,
    `ATProto card CID: ${input.cid}`,
    `ATProto repo DID: ${input.repoDid}`,
  ].join("\n");
}

function buildEventPayload(input: {
  agent: AgentEntity;
  repoDid: string;
  uri: string;
  cid: string;
  record: AtprotoBrainCardRecord;
}): AtprotoBrainDiscoveryEventPayload {
  const brainDid = input.record.brain.did;
  const anchorDid = input.record.anchor.did;
  return {
    agentId: input.agent.id,
    name: input.agent.metadata.name,
    url: input.agent.metadata.url,
    status: input.agent.metadata.status,
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    ...(anchorDid && { anchorDid }),
    cardUri: input.uri,
    cardCid: input.cid,
  };
}

async function emitDiscoveryEvent(
  context: EntityPluginContext,
  type: typeof ATPROTO_BRAIN_DISCOVERED | typeof ATPROTO_BRAIN_CARD_REFRESHED,
  payload: AtprotoBrainDiscoveryEventPayload,
): Promise<void> {
  await context.messaging.send({
    type,
    payload,
    broadcast: true,
  });
}

export async function upsertAgentFromCard(
  context: EntityPluginContext,
  input: {
    repoDid: string;
    uri: string;
    cid: string;
    record: AtprotoBrainCardRecord;
  },
  now: string = new Date().toISOString(),
): Promise<{ agent: AgentEntity; created: boolean; conflict?: boolean }> {
  const { record } = input;
  const siteUrl = record.siteUrl;
  if (!siteUrl) {
    throw new Error(
      "Federation-only brain cards cannot be projected as callable agents",
    );
  }
  const agentId = domainIdFromUrl(siteUrl);
  const existing = await context.entityService.getEntity(
    {
      entityType: "agent",
      id: agentId,
    },
    agentEntitySchema,
  );
  if (
    existing?.metadata.repoDid &&
    existing.metadata.repoDid !== input.repoDid
  ) {
    await context.messaging.send({
      type: ATPROTO_BRAIN_CARD_CONFLICT,
      payload: {
        domain: agentId,
        existingRepoDid: existing.metadata.repoDid,
        candidateRepoDid: input.repoDid,
        observedAt: now,
        reason: "A different repo DID claimed an existing agent domain",
      },
      broadcast: true,
    });
    return { agent: existing, created: false, conflict: true };
  }

  const existingParsed = existing
    ? agentAdapter.parseEntity(existing)
    : undefined;

  const brainDid = record.brain.did;
  const cardSkills = toAgentSkills(record);

  // Keep local relationship fields (approval/status, stored endpoint URL,
  // notes) while refreshing remote-owned identity and public capability
  // snapshot fields from the signed card.
  const status: AgentStatus = existing?.metadata.status ?? "discovered";
  const url = existing?.metadata.url ?? siteUrl;
  const slug = existing?.metadata.slug ?? slugifyUrl(url);
  const name = record.anchor.name;
  const kind = record.anchor.category;
  const discoveredAt = existing?.metadata.discoveredAt ?? now;
  const about =
    record.brain.purpose.length > 0
      ? record.brain.purpose
      : (existingParsed?.body.about ?? "");
  const skills =
    cardSkills.length > 0 ? cardSkills : (existingParsed?.body.skills ?? []);
  const notes =
    existingParsed?.body.notes ??
    buildNotes({
      repoDid: input.repoDid,
      uri: input.uri,
      cid: input.cid,
    });

  // Card refresh state lives in the refresh record, not on the agent.
  const preservedMetadata = { ...(existing?.metadata ?? {}) };
  delete preservedMetadata.cardCid;
  delete preservedMetadata.cardLastError;
  delete preservedMetadata.cardFailureCount;
  delete preservedMetadata.cardUnavailableAt;
  delete preservedMetadata.cardStaleAfter;
  const metadata = {
    ...preservedMetadata,
    name,
    url,
    status,
    discoveredAt,
    slug,
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    cardUri: input.uri,
  };

  const content = agentAdapter.createAgentContent({
    name,
    kind,
    ...(existingParsed?.frontmatter.organization && {
      organization: existingParsed.frontmatter.organization,
    }),
    brainName: record.brain.name,
    url,
    ...(brainDid && { brainDid }),
    repoDid: input.repoDid,
    cardUri: input.uri,
    status,
    discoveredAt,
    about,
    skills,
    notes,
  });

  // Applying a snapshot clears any failure the refresh record held.
  await cardRefreshStore(context).set(agentId, { cid: input.cid });

  if (existing) {
    const updated: AgentEntity = {
      ...existing,
      content,
      metadata,
      updated: now,
    };
    await context.entityService.updateEntity({ entity: updated });
    return { agent: updated, created: false };
  }

  const agent: AgentEntity = {
    id: agentId,
    entityType: "agent",
    content,
    metadata,
    contentHash: "",
    visibility: "public",
    created: now,
    updated: now,
  };
  await context.entityService.createEntity({ entity: agent });
  return { agent, created: true };
}

async function markAgentCardUnavailable(
  store: CardRefreshStore,
  agent: AgentEntity,
  input: {
    observedAt: string;
    reason: "deleted" | "refresh-failed";
    staleAfter?: string | undefined;
    error?: string | undefined;
  },
): Promise<void> {
  const state = await readRefreshState(store, agent);
  const error =
    input.error ??
    (input.reason === "deleted"
      ? "ATProto brain card was deleted"
      : "ATProto brain card refresh failed");
  // An event without a stale deadline keeps the one already recorded.
  const staleAfter = input.staleAfter ?? state.staleAfter;
  await store.set(agent.id, {
    ...state,
    lastError: error,
    failureCount: state.failureCount ?? 0,
    unavailableAt: input.observedAt,
    ...(staleAfter && { staleAfter }),
  });
}

export interface RefreshKnownAgentCardsResult {
  checked: number;
  refreshed: number;
  unchanged: number;
  failed: number;
}

export type AtprotoCardFetch = FetchFn;

function getFetch(fetchFn?: AtprotoCardFetch): AtprotoCardFetch {
  return fetchFn ?? fetch;
}

function getRepoDidFromCardUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\//);
  return match?.[1] ?? null;
}

export async function resolvePdsEndpoint(
  repoDid: string,
  fetchFn: AtprotoCardFetch,
  signal?: AbortSignal,
): Promise<string> {
  if (!repoDid.startsWith("did:plc:")) {
    throw new Error(`Cannot resolve PDS for unsupported repo DID ${repoDid}`);
  }

  const response = await fetchFn(
    `https://plc.directory/${repoDid}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) {
    throw new Error(`PLC lookup failed with HTTP ${response.status}`);
  }

  const document = plcDocumentSchema.parse(await response.json());
  const endpoint = document.service?.find(
    (service) => service.id === "#atproto_pds",
  )?.serviceEndpoint;
  if (!endpoint) {
    throw new Error(`PLC document for ${repoDid} has no #atproto_pds service`);
  }
  return endpoint.replace(/\/$/, "");
}

async function fetchBrainCardSnapshot(input: {
  repoDid: string;
  cardUri: string;
  fetchFn: AtprotoCardFetch;
  signal?: AbortSignal;
}): Promise<{
  repoDid: string;
  uri: string;
  cid: string;
  record: AtprotoBrainCardRecord;
}> {
  const repo = getRepoDidFromCardUri(input.cardUri) ?? input.repoDid;
  const pdsEndpoint = await resolvePdsEndpoint(
    repo,
    input.fetchFn,
    input.signal,
  );
  const url = new URL(`${pdsEndpoint}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", repo);
  url.searchParams.set("collection", "ai.rizom.brain.card");
  url.searchParams.set("rkey", "self");

  const response = await input.fetchFn(
    url,
    input.signal ? { signal: input.signal } : undefined,
  );
  if (!response.ok) {
    throw new Error(`Brain card fetch failed with HTTP ${response.status}`);
  }

  const data = pdsRecordResponseSchema.parse(await response.json());
  const parsed = atprotoBrainCardDiscoveredPayloadSchema.parse({
    repoDid: repo,
    uri: data.uri,
    cid: data.cid,
    record: data.value,
  });
  return parsed;
}

async function markAgentCardRefreshFailure(
  store: CardRefreshStore,
  agent: AgentEntity,
  state: CardRefreshState,
  error: unknown,
  now: string,
): Promise<void> {
  const failureCount = (state.failureCount ?? 0) + 1;
  const unavailableAt =
    failureCount >= CARD_UNAVAILABLE_FAILURE_THRESHOLD
      ? (state.unavailableAt ?? now)
      : state.unavailableAt;
  await store.set(agent.id, {
    ...state,
    lastError: getErrorMessage(error),
    failureCount,
    ...(unavailableAt && { unavailableAt }),
  });
}

async function archiveExpiredStaleCandidate(
  context: EntityPluginContext,
  agent: AgentEntity,
  now: string,
): Promise<void> {
  const parsed = agentAdapter.parseEntity(agent);
  const content = agentAdapter.rewriteAgentContent(parsed, {
    status: "archived",
  });
  await context.entityService.updateEntity({
    entity: {
      ...agent,
      content,
      metadata: { ...agent.metadata, status: "archived" },
      updated: now,
    },
  });
}

export async function refreshKnownAgentCards(
  context: EntityPluginContext,
  fetchFn?: AtprotoCardFetch,
  signal?: AbortSignal,
  now: string = new Date().toISOString(),
  resolveHostname?: ResolveHostname,
): Promise<RefreshKnownAgentCardsResult> {
  const result: RefreshKnownAgentCardsResult = {
    checked: 0,
    refreshed: 0,
    unchanged: 0,
    failed: 0,
  };
  const agents = await context.entityService.listEntities(
    {
      entityType: "agent",
    },
    agentEntitySchema,
  );
  const rawFetch = getFetch(fetchFn);
  const resolvedFetch = createSafePublicFetch({
    fetchFn: rawFetch,
    ...(resolveHostname && { resolveHostname }),
    timeoutMs: 10_000,
    maxResponseBytes: 256 * 1024,
    maxRedirects: 3,
  });
  const store = cardRefreshStore(context);

  for (const agent of agents) {
    const repoDid = agent.metadata.repoDid;
    const cardUri = agent.metadata.cardUri;
    if (!repoDid || !cardUri) continue;

    result.checked += 1;
    const state = await readRefreshState(store, agent);
    try {
      const snapshot = await fetchBrainCardSnapshot({
        repoDid,
        cardUri,
        fetchFn: resolvedFetch,
        ...(signal && { signal }),
      });
      if (snapshot.cid === state.cid) {
        if (
          state.lastError ||
          state.failureCount !== undefined ||
          state.unavailableAt
        ) {
          await upsertAgentFromCard(context, snapshot, now);
          result.refreshed += 1;
        } else {
          result.unchanged += 1;
        }
        continue;
      }
      await upsertAgentFromCard(context, snapshot, now);
      result.refreshed += 1;
    } catch (error) {
      if (signal?.aborted) throw error;
      await markAgentCardRefreshFailure(store, agent, state, error, now);
      result.failed += 1;
    }
  }

  const nowMs = Date.parse(now);
  for (const agent of agents) {
    const { staleAfter } = await readRefreshState(store, agent);
    if (
      agent.metadata.status === "discovered" &&
      staleAfter !== undefined &&
      Date.parse(staleAfter) <= nowMs
    ) {
      await archiveExpiredStaleCandidate(context, agent, now);
    }
  }

  return result;
}

export function registerAtprotoBrainCardHandlers(
  context: EntityPluginContext,
): void {
  context.messaging.subscribe(
    ATPROTO_BRAIN_CARD_DISCOVERED,
    async (message) => {
      const parsed = atprotoBrainCardDiscoveredPayloadSchema.parse(
        message.payload,
      );
      const result = await upsertAgentFromCard(context, parsed);
      if (result.conflict) return { success: true };
      const eventPayload = buildEventPayload({
        agent: result.agent,
        repoDid: parsed.repoDid,
        uri: parsed.uri,
        cid: parsed.cid,
        record: parsed.record,
      });
      await emitDiscoveryEvent(
        context,
        result.created
          ? ATPROTO_BRAIN_DISCOVERED
          : ATPROTO_BRAIN_CARD_REFRESHED,
        eventPayload,
      );
      return { success: true, data: eventPayload };
    },
  );

  context.messaging.subscribe(
    ATPROTO_BRAIN_CARD_UNAVAILABLE,
    async (message) => {
      const parsed = atprotoBrainCardUnavailablePayloadSchema.parse(
        message.payload,
      );
      const agents = await context.entityService.listEntities(
        {
          entityType: "agent",
        },
        agentEntitySchema,
      );
      const matching = agents.filter(
        (agent) => agent.metadata.repoDid === parsed.repoDid,
      );
      const store = cardRefreshStore(context);
      for (const agent of matching) {
        await markAgentCardUnavailable(store, agent, parsed);
      }
      return { success: true, data: { updated: matching.length } };
    },
  );
}
