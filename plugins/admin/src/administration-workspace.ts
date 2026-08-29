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
import { createAuditTabSource } from "./audit-workspace";
import {
  composeInvitationTabSections,
  createInvitationsTabSource,
} from "./invitations-workspace";
import {
  createPeerTabSource,
  selectPeerTabSections,
} from "./peer-tab-provider";
import {
  composePeopleTabSections,
  createPeopleTabSource,
} from "./people-workspace";
import {
  requireAuthService,
  type AdminWorkspaceSource,
} from "./workspace-format";

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
  source: string,
): AdministrationTabBlock[] {
  const sections: AdministrationTabBlock[] = [];
  for (const block of blocks) {
    if (block.type === "tabs") {
      throw new Error(`${source} tab cannot contribute nested tabs`);
    }
    sections.push(block);
  }
  return sections;
}

function inactiveBlocks(label: string): AdministrationTabBlock[] {
  return [
    {
      type: "text",
      text: `${label} loads when this tab is opened.`,
    },
  ];
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

function actionRoutes(
  sources: readonly AdminWorkspaceSource[],
): ReadonlyMap<string, ChildRegistration> {
  const routes = new Map<string, ChildRegistration>();
  for (const source of sources) {
    for (const actionId of source.actionIds) {
      if (routes.has(actionId)) {
        throw new Error(
          `Administration action "${actionId}" is declared by more than one source`,
        );
      }
      if (!source.registration.actionHandler) {
        throw new Error(
          `Administration source "${source.registration.label}" declares actions without a handler`,
        );
      }
      routes.set(actionId, source.registration);
    }
  }
  return routes;
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
  const peopleSource = createPeopleTabSource(context);
  const invitationsSource = createInvitationsTabSource(context);
  const peerSource = createPeerTabSource(context);
  const auditSource = createAuditTabSource(context);
  const routes = actionRoutes([
    peopleSource,
    invitationsSource,
    peerSource,
    auditSource,
  ]);
  const people = peopleSource.registration;
  const invitations = invitationsSource.registration;
  const peers = peerSource.registration;
  const audit = auditSource.registration;

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
      let headBlocks: AdministrationTabBlock[] = [];
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
        const peerSections = selectPeerTabSections(peerData.view.blocks);
        const peopleSections = composePeopleTabSections(
          tabBlocks(peopleData.view.blocks, "People"),
          {
            type: "notice",
            id: "people-peer-note",
            tone: "neutral",
            title: "External brain relationships",
            text: "A peer link records how a locally administered person relates to another brain. It does not grant or change local access.",
          },
          peerSections.people,
        );
        headBlocks = [peopleSections.totals];
        peopleBlocks = [...peopleSections.blocks];
      } else if (query.tab === "invitations") {
        const [invitationData, peerData] = await Promise.all([
          loadChild(
            invitations,
            actor,
            {
              ...(query.state ? { state: query.state } : {}),
              ...(query.offset !== undefined ? { offset: query.offset } : {}),
              ...(query.limit !== undefined ? { limit: query.limit } : {}),
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
        const peerSections = selectPeerTabSections(peerData.view.blocks);
        const invitationSections = composeInvitationTabSections(
          invitationData.view.blocks,
          peerSections.invitations,
        );
        headBlocks = [invitationSections.totals];
        invitationBlocks = [...invitationSections.blocks];
      } else {
        const auditData = await loadChild(
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
        auditBlocks = tabBlocks(auditData.view.blocks, "Audit");
      }

      return {
        view: {
          kicker: "Access administration",
          title: "Administration",
          description:
            "Manage local people, invitation delivery, external provenance, and security history.",
          status: {
            label: "Admin only",
            detail: "Access administration",
            tone: "neutral",
          },
          blocks: [
            ...headBlocks,
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
      const source = routes.get(actionId);
      if (!source)
        throw new Error(`Unknown Administration action: ${actionId}`);
      return runChildAction(source, request, actor, signal);
    },
    badgeProvider: async () =>
      administrationAttention(await requireAuthService().listAdminUsers()),
  });
  return result ? result.workspaceUrl : undefined;
}
