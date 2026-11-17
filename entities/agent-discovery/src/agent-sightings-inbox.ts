import type {
  EntityDefinition,
  EntityInboxDeclaration,
} from "@brains/sdk/entities";
import type { InboxItem } from "@brains/sdk/internal/service-runtime";
import {
  parseAgentEntity,
  rewriteAgentContent,
  type ParsedAgent,
} from "./lib/agent-content";
import { AGENT_ENTITY_TYPE } from "./lib/constants";
import {
  agentEntitySchema,
  type AgentEntity,
  type agentMetadataSchema,
} from "./schemas/agent";

type AgentDefinition = EntityDefinition<
  typeof AGENT_ENTITY_TYPE,
  typeof agentMetadataSchema
>;

const SIGHTING_LIMIT = 100;
const DETAIL_LIMIT = 50_000;
const CONNECT_ACTION_ID = "connect";
const DISMISS_ACTION_ID = "dismiss";

/** A record that is a sighting: discovered, and introduced by a peer. */
function sightingOf(
  record: unknown,
): { entity: AgentEntity; parsed: ParsedSighting } | undefined {
  const entity = agentEntitySchema.parse(record);
  const parsed = parseSighting(entity);
  return parsed ? { entity, parsed } : undefined;
}

/**
 * Agents a saved peer introduced, as individual Inbox items: connect to one,
 * or dismiss it. The Inbox opens and acts as the operator, at their
 * visibility.
 */
export const agentSightingsInbox: EntityInboxDeclaration<AgentDefinition> = {
  sourceId: "agent-sightings",
  displayName: "Agent sightings",
  list: async ({ records }) =>
    (await records.list())
      .flatMap((record) => {
        const sighting = sightingOf(record);
        return sighting ? [sighting] : [];
      })
      .sort((a, b) =>
        b.parsed.frontmatter.discoveredAt.localeCompare(
          a.parsed.frontmatter.discoveredAt,
        ),
      )
      .slice(0, SIGHTING_LIMIT)
      .map(({ entity, parsed }) => toInboxItem(entity, parsed)),
  resolveDetail: async (itemId, { records, signal }) => {
    signal.throwIfAborted();
    const sighting = sightingOf(await records.get(itemId));
    signal.throwIfAborted();
    if (!sighting) throw new Error("Agent sighting not found");
    const text = detailText(sighting.entity, sighting.parsed);
    return {
      kind: "plain",
      text: text.slice(0, DETAIL_LIMIT),
      truncated: text.length > DETAIL_LIMIT,
    };
  },
  act: async (itemId, actionId, { records, edits }) => {
    if (actionId !== CONNECT_ACTION_ID && actionId !== DISMISS_ACTION_ID) {
      throw new Error("Invalid agent sighting Inbox action");
    }
    const record = await records.get(itemId);
    const sighting = record ? sightingOf(record) : undefined;
    if (!record || !sighting) throw new Error("Agent sighting not found");
    const status = actionId === CONNECT_ACTION_ID ? "approved" : "archived";
    await edits.update(record, {
      content: rewriteAgentContent(sighting.parsed, {
        status,
        ...(status === "approved"
          ? { introducedBy: undefined, hops: undefined }
          : {}),
      }),
      metadata: { ...record.metadata, status },
    });
  },
};

type ParsedSighting = ParsedAgent;

function parseSighting(entity: AgentEntity): ParsedSighting | undefined {
  const parsed = parseAgentEntity(entity);
  return parsed.frontmatter.status === "discovered" &&
    (parsed.frontmatter.introducedBy?.length ?? 0) > 0
    ? parsed
    : undefined;
}

function toInboxItem(entity: AgentEntity, parsed: ParsedSighting): InboxItem {
  const name = normalizeText(parsed.frontmatter.name);
  const domain = normalizeText(entity.id);
  const title = truncate(name === domain ? name : `${name} · ${domain}`, 160);
  return {
    id: entity.id,
    title,
    summary: summaryText(parsed),
    receivedAt: parsed.frontmatter.discoveredAt,
    urgency: "normal",
    entityRef: { entityType: AGENT_ENTITY_TYPE, entityId: entity.id },
    actions: [
      { id: CONNECT_ACTION_ID, label: "Connect", confirm: true },
      { id: DISMISS_ACTION_ID, label: "Dismiss", confirm: true },
    ],
  };
}

function summaryText(parsed: ParsedSighting): string {
  const introducers = parsed.frontmatter.introducedBy ?? [];
  const provenance = `Introduced by ${formatList(introducers.map(normalizeText))}.`;
  const about = normalizeText(parsed.body.about);
  const skillNames = parsed.body.skills
    .map((skill) => normalizeText(skill.name))
    .filter(Boolean)
    .slice(0, 4);
  const skills =
    skillNames.length > 0 ? ` Declared skills: ${formatList(skillNames)}.` : "";
  return truncate(`${provenance}${about ? ` ${about}` : ""}${skills}`, 1_000);
}

function detailText(entity: AgentEntity, parsed: ParsedSighting): string {
  const lines = [
    `Agent: ${normalizeText(parsed.frontmatter.name)}`,
    `Domain: ${normalizeText(entity.id)}`,
    `Introduced by: ${formatList((parsed.frontmatter.introducedBy ?? []).map(normalizeText))}`,
  ];
  const about = normalizeText(parsed.body.about);
  if (about) lines.push(`About: ${about}`);
  if (parsed.body.skills.length > 0) {
    lines.push(
      "Skills:",
      ...parsed.body.skills.map((skill) => {
        const description = normalizeText(skill.description);
        return `- ${normalizeText(skill.name)}${description ? `: ${description}` : ""}`;
      }),
    );
  }
  return lines.join("\n");
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "an approved peer";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}
