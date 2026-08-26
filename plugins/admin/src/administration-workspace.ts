import type {
  RuntimeStudioOperatorBlock,
  RuntimeStudioWorkspaceData,
  ServicePluginContext,
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { DECLARATIVE_STUDIO_WORKSPACE_RENDERER } from "@brains/plugins";
import { queryInteger } from "@brains/utils/query";
import { z } from "@brains/utils/zod";
import { createAuditTabRegistration } from "./audit-workspace";
import { createInvitationsTabRegistration } from "./invitations-workspace";
import { createPeerTabRegistration } from "./peer-tab-provider";
import { createPeopleTabRegistration } from "./people-workspace";
import { requireAuthService } from "./workspace-format";

const administrationQuerySchema = z.strictObject({
  tab: z.enum(["people", "invitations", "audit"]).default("people"),
  selected: z.string().trim().min(1).max(200).optional(),
  state: z.enum(["pending", "history"]).optional(),
  offset: z
    .preprocess(queryInteger, z.number().int().min(0).max(100_000))
    .optional(),
  limit: z
    .preprocess(queryInteger, z.number().int().min(1).max(100))
    .optional(),
  peerId: z.string().trim().max(2_000).optional(),
  displayName: z.string().trim().max(200).optional(),
  actorUserId: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(200).optional(),
});

type ChildRegistration = Omit<StudioWorkspaceRegistration, "pluginId">;
type AdministrationTabBlock = Exclude<
  RuntimeStudioOperatorBlock,
  { type: "tabs" }
>;

const PEOPLE_ACTIONS = new Set([
  "update-person-role",
  "update-person-status",
  "delete-person",
  "revoke-person-passkey",
  "start-person-passkey-registration",
  "revoke-person-sessions",
  "attach-person-identity",
  "detach-person-identity",
  "link-external-peer",
  "unlink-external-peer",
]);
const INVITATION_ACTIONS = new Set([
  "create-invitation",
  "resend-invitation",
  "cancel-invitation",
  "confirm-manual-delivery",
  "invite-external-peer-person",
]);

function requestActionId(request: unknown): string | undefined {
  if (request === null || typeof request !== "object") return undefined;
  const actionId = Reflect.get(request, "actionId");
  return typeof actionId === "string" ? actionId : undefined;
}

function isWorkspaceData(value: unknown): value is RuntimeStudioWorkspaceData {
  if (value === null || typeof value !== "object") return false;
  const view = Reflect.get(value, "view");
  if (view === null || typeof view !== "object") return false;
  return Array.isArray(Reflect.get(view, "blocks"));
}

function workspaceData(
  value: unknown,
  source: string,
): RuntimeStudioWorkspaceData {
  if (!isWorkspaceData(value)) {
    throw new Error(`${source} tab returned invalid workspace data`);
  }
  return value;
}

function tabBlocks(
  blocks: readonly RuntimeStudioOperatorBlock[],
): AdministrationTabBlock[] {
  return blocks.flatMap((block) => (block.type === "tabs" ? [] : [block]));
}

function inactiveBlocks(label: string): AdministrationTabBlock[] {
  return [
    {
      type: "text",
      text: `${label} loads when this tab is opened.`,
    },
  ];
}

function blockId(block: RuntimeStudioOperatorBlock): string | undefined {
  return block.id;
}

async function loadChild(
  child: ChildRegistration,
  actor: StudioWorkspaceActor,
  query: Record<string, string | number | undefined>,
  signal: AbortSignal | undefined,
): Promise<RuntimeStudioWorkspaceData> {
  return workspaceData(
    await child.dataProvider(actor, query, signal),
    child.label,
  );
}

async function runChildAction(
  child: ChildRegistration,
  request: unknown,
  actor: StudioWorkspaceActor,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (!child.actionHandler) {
    throw new Error(`${child.label} does not provide actions`);
  }
  return child.actionHandler(request, actor, signal);
}

function administrationAttention(
  users: readonly {
    status: "active" | "invited" | "suspended";
    invitation?: { state: string } | undefined;
  }[],
): number {
  const suspended = users.filter((user) => user.status === "suspended").length;
  const pendingInvitations = users.filter(
    (user) =>
      user.invitation !== undefined &&
      !["claimed", "expired", "cancelled"].includes(user.invitation.state),
  ).length;
  return suspended + pendingInvitations;
}

export async function registerAdministrationWorkspace(
  context: ServicePluginContext,
): Promise<string | undefined> {
  if (context.executionOnly || !context.studio.isAvailable()) return undefined;
  const people = createPeopleTabRegistration(context);
  const invitations = createInvitationsTabRegistration(context);
  const peers = createPeerTabRegistration(context);
  const audit = createAuditTabRegistration(context);

  const result = await context.studio.registerWorkspace({
    id: "admin:administration",
    label: "Administration",
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    priority: 10,
    permission: "admin",
    urlQuery: true,
    aliases: [
      { id: "admin:people", query: { tab: "people" } },
      { id: "admin:invitations", query: { tab: "invitations" } },
      { id: "admin:peers", query: { tab: "people" } },
      { id: "admin:audit", query: { tab: "audit" } },
    ],
    entityTypes: [],
    accessHandler: (actor) => people.accessHandler(actor),
    dataProvider: async (actor, rawQuery, signal) => {
      const query = administrationQuerySchema.parse(rawQuery ?? {});
      let active: RuntimeStudioWorkspaceData;
      let peopleBlocks = inactiveBlocks("People");
      let invitationBlocks = inactiveBlocks("Invitations");
      let auditBlocks = inactiveBlocks("Audit");

      if (query.tab === "people") {
        const [peopleData, peerData] = await Promise.all([
          loadChild(
            people,
            actor,
            { ...(query.selected ? { selected: query.selected } : {}) },
            signal,
          ),
          loadChild(
            peers,
            actor,
            {
              ...(query.peerId ? { peerId: query.peerId } : {}),
              ...(query.displayName ? { displayName: query.displayName } : {}),
            },
            signal,
          ),
        ]);
        active = peopleData;
        peopleBlocks = [
          ...tabBlocks(peopleData.view.blocks),
          {
            type: "notice",
            tone: "neutral",
            title: "External brain relationships",
            text: "A peer link records how a locally administered person relates to another brain. It does not grant or change local access.",
          },
          ...tabBlocks(peerData.view.blocks).filter((block) =>
            ["link-peer", "peers"].includes(blockId(block) ?? ""),
          ),
        ];
      } else if (query.tab === "invitations") {
        const [invitationData, peerData] = await Promise.all([
          loadChild(
            invitations,
            actor,
            {
              ...(query.state ? { state: query.state } : {}),
              ...(query.offset !== undefined ? { offset: query.offset } : {}),
              ...(query.limit !== undefined ? { limit: query.limit } : {}),
              ...(query.peerId ? { peerId: query.peerId } : {}),
              ...(query.displayName ? { displayName: query.displayName } : {}),
            },
            signal,
          ),
          loadChild(
            peers,
            actor,
            {
              ...(query.peerId ? { peerId: query.peerId } : {}),
              ...(query.displayName ? { displayName: query.displayName } : {}),
            },
            signal,
          ),
        ]);
        active = invitationData;
        invitationBlocks = [
          ...tabBlocks(invitationData.view.blocks),
          ...tabBlocks(peerData.view.blocks).filter(
            (block) => blockId(block) === "invite-peer",
          ),
        ];
      } else {
        active = await loadChild(
          audit,
          actor,
          {
            ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
            ...(query.action ? { action: query.action } : {}),
            ...(query.selected ? { selected: query.selected } : {}),
            ...(query.offset !== undefined ? { offset: query.offset } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
          },
          signal,
        );
        auditBlocks = tabBlocks(active.view.blocks);
      }

      return {
        view: {
          kicker: "Access administration",
          title: "Administration",
          description:
            "Manage local people, invitation delivery, external provenance, and security history.",
          ...(active.view.status ? { status: active.view.status } : {}),
          blocks: [
            {
              type: "tabs",
              id: "administration-tabs",
              label: "Administration sections",
              defaultTab: query.tab,
              queryKey: "tab",
              tabs: [
                { id: "people", label: "People", blocks: peopleBlocks },
                {
                  id: "invitations",
                  label: "Invitations",
                  blocks: invitationBlocks,
                },
                { id: "audit", label: "Audit", blocks: auditBlocks },
              ],
            },
          ],
        },
      } satisfies RuntimeStudioWorkspaceData;
    },
    actionHandler: async (request, actor, signal) => {
      const actionId = requestActionId(request);
      if (!actionId) throw new Error("Administration action id is required");
      if (PEOPLE_ACTIONS.has(actionId)) {
        const source = actionId === "link-external-peer" ? peers : people;
        return runChildAction(source, request, actor, signal);
      }
      if (INVITATION_ACTIONS.has(actionId)) {
        const source =
          actionId === "invite-external-peer-person" ? peers : invitations;
        return runChildAction(source, request, actor, signal);
      }
      throw new Error(`Unknown Administration action: ${actionId}`);
    },
    badgeProvider: async () =>
      administrationAttention(await requireAuthService().listAdminUsers()),
  });
  return result ? result.workspaceUrl : undefined;
}
