import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_DISCOVERED,
  atprotoBrainCardDiscoveredPayloadSchema,
  type AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { slugifyUrl } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentEntity, AgentStatus } from "../schemas/agent";

const agentAdapter = new AgentAdapter();

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

function chooseUrl(record: Record<string, unknown>): string | undefined {
  return readString(record, "siteUrl") ?? readString(record, "a2aEndpoint");
}

function domainIdFromUrl(url: string): string {
  return new URL(url).hostname;
}

function buildNotes(input: {
  repoDid: string;
  uri: string;
  cid: string;
  capabilities: string[] | undefined;
}): string {
  const lines = [
    `ATProto card: ${input.uri}`,
    `ATProto card CID: ${input.cid}`,
    `ATProto repo DID: ${input.repoDid}`,
  ];
  if (input.capabilities && input.capabilities.length > 0) {
    lines.push(
      "",
      "Capabilities:",
      ...input.capabilities.map((cap) => `- ${cap}`),
    );
  }
  return lines.join("\n");
}

function buildEventPayload(input: {
  agent: AgentEntity;
  repoDid: string;
  uri: string;
  cid: string;
  record: Record<string, unknown>;
}): AtprotoBrainDiscoveryEventPayload {
  const brainDid = readString(input.record, "brainDid");
  const a2aEndpoint = readString(input.record, "a2aEndpoint");
  const capabilities = readStringArray(input.record, "capabilities");
  return {
    agentId: input.agent.id,
    name: input.agent.metadata.name,
    url: input.agent.metadata.url,
    status: input.agent.metadata.status,
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    cardUri: input.uri,
    cardCid: input.cid,
    ...(a2aEndpoint && { a2aEndpoint }),
    ...(capabilities && { capabilities }),
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

async function upsertAgentFromCard(
  context: EntityPluginContext,
  input: {
    repoDid: string;
    uri: string;
    cid: string;
    record: Record<string, unknown>;
  },
): Promise<{ agent: AgentEntity; created: boolean }> {
  const url = chooseUrl(input.record);
  if (!url) {
    throw new Error("ATProto brain card requires siteUrl or a2aEndpoint");
  }

  const agentId = domainIdFromUrl(url);
  const existing = await context.entityService.getEntity<AgentEntity>({
    entityType: "agent",
    id: agentId,
  });
  const status: AgentStatus = existing?.metadata.status ?? "discovered";
  const brainDid = readString(input.record, "brainDid");
  const a2aEndpoint = readString(input.record, "a2aEndpoint");
  const capabilities = readStringArray(input.record, "capabilities");
  const now = new Date().toISOString();
  const metadata = {
    ...(existing?.metadata ?? {}),
    name:
      existing?.metadata.name ?? readString(input.record, "name") ?? agentId,
    url,
    status,
    discoveredAt: existing?.metadata.discoveredAt ?? now,
    slug: slugifyUrl(url),
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    cardUri: input.uri,
    cardCid: input.cid,
    ...(a2aEndpoint && { a2aEndpoint }),
    ...(capabilities && { capabilities }),
  };

  if (existing) {
    const updated: AgentEntity = {
      ...existing,
      metadata,
      updated: now,
    };
    await context.entityService.updateEntity({ entity: updated });
    return { agent: updated, created: false };
  }

  const content = agentAdapter.createAgentContent({
    name: readString(input.record, "name") ?? agentId,
    kind: "professional",
    brainName: readString(input.record, "name") ?? agentId,
    url,
    ...(brainDid && { did: brainDid, brainDid }),
    repoDid: input.repoDid,
    cardUri: input.uri,
    cardCid: input.cid,
    ...(a2aEndpoint && { a2aEndpoint }),
    ...(capabilities && { capabilities }),
    status,
    discoveredAt: now,
    about: readString(input.record, "description") ?? "",
    skills: [],
    notes: buildNotes({
      repoDid: input.repoDid,
      uri: input.uri,
      cid: input.cid,
      capabilities,
    }),
  });
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
