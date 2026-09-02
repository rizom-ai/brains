import {
  defineStudioWorkspace,
  z,
  type AnyWorkspaceActionDefinition,
  type StudioWorkspaceDefinition,
  type StudioWorkspaceView,
} from "@brains/sdk/services";
import { queryInteger } from "@brains/utils/query";
import { auditTabActions, createAuditTab } from "./audit-workspace";
import {
  composeInvitationTabSections,
  createInvitationsTab,
  invitationsTabActions,
} from "./invitations-workspace";
import {
  createPeerTab,
  peerTabActions,
  selectPeerTabSections,
} from "./peer-tab-provider";
import {
  composePeopleTabSections,
  createPeopleTab,
  peopleTabActions,
} from "./people-workspace";
import {
  tabBlocks,
  type AdminTabBlock,
  type AdminTabFactory,
} from "./workspace-format";

export const administrationQuerySchema: z.ZodType<{
  tab: "people" | "invitations" | "audit";
  selected?: string | undefined;
  state?: "pending" | "history" | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
  peerId?: string | undefined;
  displayName?: string | undefined;
  actorUserId?: string | undefined;
  action?: string | undefined;
}> = z.strictObject({
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

/**
 * What the workspace shows: the active tab's blocks, and inert placeholders
 * for the tabs nobody asked for. Only one tab loads per request — the others
 * would be four extra round trips to render text no one is looking at.
 */
interface AdministrationData {
  readonly tab: "people" | "invitations" | "audit";
  readonly attention: number;
  readonly headBlocks: readonly AdminTabBlock[];
  readonly peopleBlocks: readonly AdminTabBlock[];
  readonly invitationBlocks: readonly AdminTabBlock[];
  readonly auditBlocks: readonly AdminTabBlock[];
  readonly primaryAction?: StudioWorkspaceView<AnyWorkspaceActionDefinition>["primaryAction"];
}

function inactiveBlocks(label: string): AdminTabBlock[] {
  return [{ type: "text", text: `${label} loads when this tab is opened.` }];
}

const ADMINISTRATION_ACTIONS: readonly AnyWorkspaceActionDefinition[] = [
  ...peopleTabActions,
  ...invitationsTabActions,
  ...peerTabActions,
  ...auditTabActions,
];

/**
 * People, Invitations, Peers and Audit as one workspace.
 *
 * They were four registrations stitched together by hand, each loaded
 * through its own data provider and its actions routed by id. As tabs of one
 * declared workspace the stitching disappears: the tabs are loaders, their
 * actions are this workspace's actions, and `aliases` keeps every link that
 * pointed at the old ids working.
 */
export const administrationWorkspace: StudioWorkspaceDefinition<
  "administration",
  z.ZodType<AdministrationData>,
  typeof ADMINISTRATION_ACTIONS
> = defineStudioWorkspace({
  id: "administration",
  label: "Administration",
  priority: 10,
  permission: "admin",
  aliases: [
    { id: "people", query: { tab: "people" } },
    { id: "invitations", query: { tab: "invitations" } },
    { id: "peers", query: { tab: "people" } },
    { id: "audit", query: { tab: "audit" } },
  ],
  query: administrationQuerySchema,
  // The blocks are the operator view vocabulary, which the runtime validates
  // on the way out; re-describing them as a schema here would drift.
  data: z.custom<AdministrationData>(),
  actions: ADMINISTRATION_ACTIONS,
  badge: ({ data }) => data.attention,
  view: ({ data }) => ({
    kicker: "Access administration",
    title: "Administration",
    description:
      "Manage local people, invitation delivery, external provenance, and security history.",
    ...(data.primaryAction ? { primaryAction: data.primaryAction } : {}),
    blocks: [
      ...data.headBlocks,
      {
        type: "tabs",
        id: "administration-tabs",
        label: "Administration sections",
        defaultTab: data.tab,
        queryKey: "tab",
        tabs: [
          { id: "people", label: "People", blocks: data.peopleBlocks },
          {
            id: "invitations",
            label: "Invitations",
            blocks: data.invitationBlocks,
          },
          { id: "audit", label: "Audit", blocks: data.auditBlocks },
        ],
      },
    ],
  }),
});

function attentionOf(
  users: readonly {
    status: "active" | "invited" | "suspended";
    invitation?: { state: string } | undefined;
  }[],
): number {
  const suspended = users.filter((user) => user.status === "suspended").length;
  const pending = users.filter(
    (user) =>
      user.invitation !== undefined &&
      !["claimed", "expired", "cancelled"].includes(user.invitation.state),
  ).length;
  return suspended + pending;
}

export { attentionOf, inactiveBlocks };
export {
  createAuditTab,
  createInvitationsTab,
  createPeerTab,
  createPeopleTab,
  composeInvitationTabSections,
  composePeopleTabSections,
  selectPeerTabSections,
  tabBlocks,
};
export type { AdministrationData, AdminTabFactory };
