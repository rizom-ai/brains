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
import type { AgentEntity, AgentSkill, AgentStatus } from "../schemas/agent";

const agentAdapter = new AgentAdapter();

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

function readNestedString(
  record: Record<string, unknown>,
  key: string,
  nestedKey: string,
): string | undefined {
  const nested = readRecord(record, key);
  return nested ? readString(nested, nestedKey) : undefined;
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
  return readString(record, "siteUrl");
}

function readSkills(record: Record<string, unknown>): AgentSkill[] {
  const value = record["skills"];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const skill = item as Record<string, unknown>;
    const name = readString(skill, "name");
    const description = readString(skill, "description");
    if (!name || !description) return [];
    return [
      {
        name,
        description,
        tags: readStringArray(skill, "tags") ?? [],
      },
    ];
  });
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
  record: Record<string, unknown>;
}): AtprotoBrainDiscoveryEventPayload {
  const brainDid = readNestedString(input.record, "brain", "did");
  const anchorDid = readNestedString(input.record, "anchor", "did");
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
    throw new Error("ATProto brain card requires siteUrl");
  }

  const agentId = domainIdFromUrl(url);
  const existing = await context.entityService.getEntity<AgentEntity>({
    entityType: "agent",
    id: agentId,
  });
  const status: AgentStatus = existing?.metadata.status ?? "discovered";
  const brainDid = readNestedString(input.record, "brain", "did");
  const brainName = readNestedString(input.record, "brain", "name") ?? agentId;
  const brainPurpose = readNestedString(input.record, "brain", "purpose") ?? "";
  const anchorDid = readNestedString(input.record, "anchor", "did");
  const anchorName =
    readNestedString(input.record, "anchor", "name") ?? brainName;
  const anchorKind = readNestedString(input.record, "anchor", "kind");
  const skills = readSkills(input.record);
  const now = new Date().toISOString();
  const metadata = {
    ...(existing?.metadata ?? {}),
    name: existing?.metadata.name ?? anchorName,
    url,
    status,
    discoveredAt: existing?.metadata.discoveredAt ?? now,
    slug: slugifyUrl(url),
    repoDid: input.repoDid,
    ...(brainDid && { brainDid }),
    ...(anchorDid && { anchorDid }),
    cardUri: input.uri,
    cardCid: input.cid,
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
    name: anchorName,
    kind:
      anchorKind === "team" || anchorKind === "collective"
        ? anchorKind
        : "professional",
    brainName,
    url,
    ...(brainDid && { did: brainDid, brainDid }),
    ...(anchorDid && { anchorDid }),
    repoDid: input.repoDid,
    cardUri: input.uri,
    cardCid: input.cid,
    status,
    discoveredAt: now,
    about: brainPurpose,
    skills,
    notes: buildNotes({
      repoDid: input.repoDid,
      uri: input.uri,
      cid: input.cid,
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
