import {
  inboxItemListSchema,
  type EntityInboxDeclaration,
  type EntityReactionContext,
  type InboxItem,
  type InboxItemDetail,
} from "@brains/sdk/entities";
import { createAgentContent, parseAgentEntity } from "./lib/agent-content";
import { AGENT_ENTITY_TYPE } from "./lib/constants";
import { agentEntitySchema, type AgentEntity } from "./schemas/agent";

const SIGHTING_LIMIT = 100;
const DETAIL_LIMIT = 50_000;
const CONNECT_ACTION_ID = "connect";
const DISMISS_ACTION_ID = "dismiss";

/**
 * Second-order agents — brains a peer's directory mentioned — as individual
 * items someone can act on.
 *
 * A sighting is not yet a contact: connecting to one is a decision, so each
 * arrives with its own approve and dismiss rather than as a rollup.
 */
export const agentSightingsInbox: EntityInboxDeclaration = {
  sourceId: "agent-sightings",
  displayName: "Agent sightings",

  list: async (context) => {
    const entities = await context.entities.listEntities<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
      options: {
        limit: SIGHTING_LIMIT,
        sortFields: [{ field: "created", direction: "desc" }],
      },
    });
    return inboxItemListSchema.parse(
      entities.flatMap((entity) => {
        const parsed = parseSighting(entity);
        return parsed ? [toInboxItem(entity, parsed)] : [];
      }),
    );
  },

  resolveDetail: async (context, itemId): Promise<InboxItemDetail> => {
    const entity = await requireSighting(context, itemId);
    const parsed = parseSighting(entity);
    if (!parsed) throw new Error("Agent sighting not found");
    const text = detailText(entity, parsed);
    return {
      kind: "plain",
      text: text.slice(0, DETAIL_LIMIT),
      truncated: text.length > DETAIL_LIMIT,
    };
  },

  act: async (context, itemId, actionId, actor) => {
    if (actionId !== CONNECT_ACTION_ID && actionId !== DISMISS_ACTION_ID) {
      throw new Error("Invalid agent sighting Inbox action");
    }
    // Connecting changes who the brain trusts, so it is checked against the
    // actor rather than against whoever registered the source — and against
    // admin specifically, not whatever the type's update policy allows.
    // Approving a contact is a decision about the network, not an edit.
    if (actor.permissionLevel !== "admin") {
      throw new Error("Agent sightings require admin permission");
    }
    context.permissions.assertEntityActionAllowed(AGENT_ENTITY_TYPE, "update", {
      userPermissionLevel: actor.permissionLevel,
    });

    const entity = await requireSighting(context, itemId);
    const parsed = parseSighting(entity);
    if (!parsed) throw new Error("Agent sighting not found");

    const status = actionId === CONNECT_ACTION_ID ? "approved" : "archived";
    await context.entities.update({
      ...entity,
      content: createAgentContent({
        ...parsed.frontmatter,
        ...parsed.body,
        status,
        // An approved agent is a contact in its own right; how it was
        // introduced stops being how it is described.
        ...(status === "approved"
          ? { introducedBy: undefined, hops: undefined }
          : {}),
      }),
      metadata: { ...entity.metadata, status },
    });
  },
};

async function requireSighting(
  context: AgentSightingContext,
  itemId: string,
): Promise<AgentEntity> {
  const entity = await context.entities.getEntity<AgentEntity>({
    entityType: AGENT_ENTITY_TYPE,
    id: itemId,
  });
  if (!entity) throw new Error("Agent sighting not found");
  return agentEntitySchema.parse(entity);
}

type AgentSightingContext = EntityReactionContext;

type ParsedSighting = ReturnType<typeof parseAgentEntity>;

function parseSighting(entity: AgentEntity): ParsedSighting | undefined {
  const parsed = parseAgentEntity(agentEntitySchema.parse(entity));
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
