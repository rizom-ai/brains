import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_DISCOVERED,
  atprotoBrainCardDiscoveredPayloadSchema,
  type AtprotoBrainCardRecord,
  type AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { slugifyUrl } from "@brains/utils/string-utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { FetchFn } from "./fetch-agent-card";
import type { AgentEntity, AgentSkill, AgentStatus } from "../schemas/agent";

const agentAdapter = new AgentAdapter();

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
): Promise<{ agent: AgentEntity; created: boolean }> {
  const { record } = input;
  const agentId = domainIdFromUrl(record.siteUrl);
  const existing = await context.entityService.getEntity<AgentEntity>({
    entityType: "agent",
    id: agentId,
  });
  const existingParsed = existing
    ? agentAdapter.parseEntity(existing)
    : undefined;

  const brainDid = record.brain.did;
  const anchorDid = record.anchor.did;
  const cardSkills = toAgentSkills(record);

  // Keep local relationship fields (approval/status, stored endpoint URL,
  // notes) while refreshing remote-owned identity and public capability
  // snapshot fields from the signed card.
  const status: AgentStatus = existing?.metadata.status ?? "discovered";
  const url = existing?.metadata.url ?? record.siteUrl;
  const slug = existing?.metadata.slug ?? slugifyUrl(url);
  const name = record.anchor.name;
  const kind = record.anchor.kind;
  const discoveredAt = existing?.metadata.discoveredAt ?? now;
  const cardObservedAt = record.updatedAt ?? record.createdAt;
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

  const metadata = {
    ...(existing?.metadata ?? {}),
    name,
    url,
    status,
    discoveredAt,
    slug,
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    ...(anchorDid && { anchorDid }),
    cardUri: input.uri,
    cardCid: input.cid,
    cardObservedAt,
    cardLastCheckedAt: now,
  };

  const content = agentAdapter.createAgentContent({
    name,
    kind,
    ...(existingParsed?.frontmatter.organization && {
      organization: existingParsed.frontmatter.organization,
    }),
    brainName: record.brain.name,
    url,
    ...(brainDid && { did: brainDid, brainDid }),
    ...(anchorDid && { anchorDid }),
    repoDid: input.repoDid,
    cardUri: input.uri,
    cardCid: input.cid,
    cardObservedAt,
    cardLastCheckedAt: now,
    ...(existingParsed?.frontmatter.a2aEndpoint && {
      a2aEndpoint: existingParsed.frontmatter.a2aEndpoint,
    }),
    status,
    discoveredAt,
    about,
    skills,
    notes,
  });

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

async function resolvePdsEndpoint(
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

  const document = (await response.json()) as {
    service?: Array<{ id?: string; serviceEndpoint?: string }>;
  };
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

  const data = (await response.json()) as {
    uri?: string;
    cid?: string;
    value?: unknown;
  };
  const parsed = atprotoBrainCardDiscoveredPayloadSchema.parse({
    repoDid: repo,
    uri: data.uri,
    cid: data.cid,
    record: data.value,
  });
  return parsed;
}

async function markAgentCardRefreshFailure(
  context: EntityPluginContext,
  agent: AgentEntity,
  error: unknown,
  now: string,
): Promise<void> {
  const parsed = agentAdapter.parseEntity(agent);
  const metadata = {
    ...agent.metadata,
    cardLastCheckedAt: now,
    cardLastError: getErrorMessage(error),
  };
  const content = agentAdapter.createAgentContent({
    name: parsed.frontmatter.name,
    kind: parsed.frontmatter.kind,
    ...(parsed.frontmatter.organization && {
      organization: parsed.frontmatter.organization,
    }),
    brainName: parsed.frontmatter.brainName,
    url: parsed.frontmatter.url,
    ...(parsed.frontmatter.did && { did: parsed.frontmatter.did }),
    ...(parsed.frontmatter.repoDid && { repoDid: parsed.frontmatter.repoDid }),
    ...(parsed.frontmatter.brainDid && {
      brainDid: parsed.frontmatter.brainDid,
    }),
    ...(parsed.frontmatter.anchorDid && {
      anchorDid: parsed.frontmatter.anchorDid,
    }),
    ...(parsed.frontmatter.cardUri && { cardUri: parsed.frontmatter.cardUri }),
    ...(parsed.frontmatter.cardCid && { cardCid: parsed.frontmatter.cardCid }),
    ...(parsed.frontmatter.cardObservedAt && {
      cardObservedAt: parsed.frontmatter.cardObservedAt,
    }),
    cardLastCheckedAt: now,
    cardLastError: getErrorMessage(error),
    ...(parsed.frontmatter.a2aEndpoint && {
      a2aEndpoint: parsed.frontmatter.a2aEndpoint,
    }),
    status: parsed.frontmatter.status,
    discoveredAt: parsed.frontmatter.discoveredAt,
    ...(parsed.frontmatter.introducedBy && {
      introducedBy: parsed.frontmatter.introducedBy,
    }),
    ...(parsed.frontmatter.hops !== undefined && {
      hops: parsed.frontmatter.hops,
    }),
    about: parsed.body.about,
    skills: parsed.body.skills,
    notes: parsed.body.notes,
  });

  await context.entityService.updateEntity({
    entity: {
      ...agent,
      metadata,
      content,
      updated: now,
    },
  });
}

export async function refreshKnownAgentCards(
  context: EntityPluginContext,
  fetchFn?: AtprotoCardFetch,
  signal?: AbortSignal,
  now: string = new Date().toISOString(),
): Promise<RefreshKnownAgentCardsResult> {
  const result: RefreshKnownAgentCardsResult = {
    checked: 0,
    refreshed: 0,
    unchanged: 0,
    failed: 0,
  };
  const agents = await context.entityService.listEntities<AgentEntity>({
    entityType: "agent",
  });
  const resolvedFetch = getFetch(fetchFn);

  for (const agent of agents) {
    const repoDid = agent.metadata.repoDid;
    const cardUri = agent.metadata.cardUri;
    if (!repoDid || !cardUri) continue;

    result.checked += 1;
    try {
      const snapshot = await fetchBrainCardSnapshot({
        repoDid,
        cardUri,
        fetchFn: resolvedFetch,
        ...(signal && { signal }),
      });
      if (snapshot.cid === agent.metadata.cardCid) {
        result.unchanged += 1;
        continue;
      }
      await upsertAgentFromCard(context, snapshot, now);
      result.refreshed += 1;
    } catch (error) {
      if (signal?.aborted) throw error;
      await markAgentCardRefreshFailure(context, agent, error, now);
      result.failed += 1;
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
}
