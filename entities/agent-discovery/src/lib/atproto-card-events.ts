import {
  ATPROTO_BRAIN_CARD_DISCOVERED,
  ATPROTO_BRAIN_CARD_REFRESHED,
  ATPROTO_BRAIN_DISCOVERED,
  atprotoBrainCardDiscoveredPayloadSchema,
  type AtprotoBrainCardRecord,
  type AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { slugifyUrl } from "@brains/utils/string-utils";
import { AgentAdapter } from "../adapters/agent-adapter";
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

async function upsertAgentFromCard(
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

  // Keep an existing entry's established identity (status, stored endpoint url,
  // name, kind); only fill those from the card for newly discovered brains.
  // Enrichment refreshes signed metadata plus the public skills/purpose, not
  // the agent's endpoint or approval state.
  const status: AgentStatus = existing?.metadata.status ?? "discovered";
  const url = existing?.metadata.url ?? record.siteUrl;
  const slug = existing?.metadata.slug ?? slugifyUrl(url);
  const name = existing?.metadata.name ?? record.anchor.name;
  const kind = existingParsed?.frontmatter.kind ?? record.anchor.kind;
  const discoveredAt = existing?.metadata.discoveredAt ?? now;
  const about = record.brain.purpose || existingParsed?.body.about || "";
  const skills =
    cardSkills.length > 0 ? cardSkills : (existingParsed?.body.skills ?? []);

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
    ...(existingParsed?.frontmatter.a2aEndpoint && {
      a2aEndpoint: existingParsed.frontmatter.a2aEndpoint,
    }),
    status,
    discoveredAt,
    about,
    skills,
    notes: buildNotes({
      repoDid: input.repoDid,
      uri: input.uri,
      cid: input.cid,
    }),
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
