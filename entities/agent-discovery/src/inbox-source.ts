import {
  inboxItemListSchema,
  type InboxActor,
  type InboxItem,
  type InboxItemDetail,
  type InboxSource,
  type ServicePluginContext,
} from "@brains/plugins";
import { AgentAdapter } from "./adapters/agent-adapter";
import { AGENT_ENTITY_TYPE } from "./lib/constants";
import { agentEntitySchema, type AgentEntity } from "./schemas/agent";

const SIGHTING_LIMIT = 100;
const DETAIL_LIMIT = 50_000;
const CONNECT_ACTION_ID = "connect";
const DISMISS_ACTION_ID = "dismiss";

const agentAdapter = new AgentAdapter();

type AgentSightingContext = Pick<
  ServicePluginContext,
  "entityService" | "permissions"
>;

/** Projects second-order agents as individual, actionable Inbox items. */
export class AgentSightingsInboxSource implements InboxSource {
  readonly sourceId: string = "agent-sightings";
  readonly displayName: string = "Agent sightings";

  private readonly context: AgentSightingContext;

  constructor(context: AgentSightingContext) {
    this.context = context;
  }

  async list(): Promise<InboxItem[]> {
    const entities = await this.context.entityService.listEntities<AgentEntity>(
      {
        entityType: AGENT_ENTITY_TYPE,
        options: {
          limit: SIGHTING_LIMIT,
          sortFields: [{ field: "discoveredAt", direction: "desc" }],
          filter: { metadata: { status: "discovered" } },
        },
      },
    );

    return inboxItemListSchema.parse(
      entities.flatMap((entity) => {
        const parsed = parseSighting(entity);
        if (!parsed) return [];
        return [toInboxItem(entity, parsed)];
      }),
    );
  }

  async resolveDetail(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail> {
    assertAdmin(actor);
    signal.throwIfAborted();
    const entity = await this.getSighting(itemId);
    signal.throwIfAborted();
    const parsed = parseSighting(entity);
    if (!parsed) throw new Error("Agent sighting not found");
    const text = detailText(entity, parsed);
    return {
      kind: "plain",
      text: text.slice(0, DETAIL_LIMIT),
      truncated: text.length > DETAIL_LIMIT,
    };
  }

  async act(
    itemId: string,
    actionId: string,
    actor: InboxActor,
  ): Promise<void> {
    assertAdmin(actor);
    if (actionId !== CONNECT_ACTION_ID && actionId !== DISMISS_ACTION_ID) {
      throw new Error("Invalid agent sighting Inbox action");
    }
    this.context.permissions.assertEntityActionAllowed(
      AGENT_ENTITY_TYPE,
      "update",
      { userPermissionLevel: actor.permissionLevel },
    );

    const entity = await this.getSighting(itemId);
    const parsed = parseSighting(entity);
    if (!parsed) throw new Error("Agent sighting not found");
    const status = actionId === CONNECT_ACTION_ID ? "approved" : "archived";
    const content = agentAdapter.createAgentContent({
      ...parsed.frontmatter,
      ...parsed.body,
      status,
      ...(status === "approved"
        ? { introducedBy: undefined, hops: undefined }
        : {}),
    });
    await this.context.entityService.updateEntity({
      entity: {
        ...entity,
        content,
        metadata: { ...entity.metadata, status },
      },
    });
  }

  private async getSighting(itemId: string): Promise<AgentEntity> {
    const entity = await this.context.entityService.getEntity<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
      id: itemId,
    });
    if (!entity) throw new Error("Agent sighting not found");
    return agentEntitySchema.parse(entity);
  }
}

type ParsedSighting = ReturnType<AgentAdapter["parseEntity"]>;

function parseSighting(entity: AgentEntity): ParsedSighting | undefined {
  const parsed = agentAdapter.parseEntity(agentEntitySchema.parse(entity));
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

function assertAdmin(actor: InboxActor): void {
  if (actor.permissionLevel !== "admin") {
    throw new Error("Agent sightings require admin permission");
  }
}
