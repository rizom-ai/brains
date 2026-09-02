import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  administrationQuerySchema,
  administrationWorkspace,
  attentionOf,
  createAuditTab,
  createInvitationsTab,
  createPeerTab,
  createPeopleTab,
  composeInvitationTabSections,
  composePeopleTabSections,
  inactiveBlocks,
  selectPeerTabSections,
  tabBlocks,
  type AdministrationData,
} from "./administration-workspace";
import {
  invitationsOverviewTab,
  invitationsOverviewWidget,
} from "./invitations-overview";

const adminConfigSchema: z.ZodType<
  Record<string, never>,
  Record<string, never>
> = z.strictObject({});

/**
 * Administration, as one workspace with four tabs.
 *
 * The tabs used to be four separate Studio registrations that this package
 * loaded and stitched by hand — a data provider per child, actions routed by
 * id, and a hand-rolled check that no child smuggled in nested tabs. As one
 * declared workspace the stitching is gone: each tab is a loader, their
 * actions are the workspace's actions, and `aliases` keeps the links that
 * pointed at the old ids working.
 */
const adminPackage: ServicePackageDefinition<typeof adminConfigSchema> =
  defineServicePlugin({
    id: "admin",
    config: adminConfigSchema,
    // Every surface here administers auth; resolving it once is honest
    // about that, and a brain without auth-service cannot show them at all.
    setup: ({ auth }) => ({ auth: auth.getAdministration() }),

    dashboardWidgets: (context) =>
      context.state.auth
        ? [
            invitationsOverviewWidget.bind(
              context,
              invitationsOverviewTab(context.state.auth),
            ),
          ]
        : [],

    studioWorkspaces: (bindingContext) => {
      const authService = bindingContext.state.auth;
      // A brain without auth-service has nobody to administer.
      if (!authService) return [];
      const people = createPeopleTab(authService)(bindingContext);
      const invitations = createInvitationsTab(authService)(bindingContext);
      const peers = createPeerTab(authService)(bindingContext);
      const audit = createAuditTab(authService);

      return [
        administrationWorkspace.bind(bindingContext, {
          actions: [
            ...people.actions,
            ...invitations.actions,
            ...peers.actions,
            ...audit.actions,
          ],
          load: async ({
            query,
            caller,
            signal,
          }): Promise<AdministrationData> => {
            const parsed = query.get(administrationQuerySchema);
            const tab = parsed.tab;
            const base = {
              tab,
              // Filled from the roster the People and Invitations tabs load
              // anyway. The Audit tab reads no roster, and paying for one
              // just to number a badge is a read nobody asked for.
              attention: 0,
              headBlocks: [],
              peopleBlocks: inactiveBlocks("People"),
              invitationBlocks: inactiveBlocks("Invitations"),
              auditBlocks: inactiveBlocks("Audit"),
            } satisfies AdministrationData;

            if (tab === "people") {
              const [peopleView, peerView] = await Promise.all([
                people.load({ query: parsed, caller, signal }),
                peers.load({ query: parsed, caller, signal }),
              ]);
              const peerSections = selectPeerTabSections(peerView.blocks);
              const attention = attentionOf(await authService.listAdminUsers());
              const sections = composePeopleTabSections(
                tabBlocks(peopleView.blocks, "People"),
                {
                  type: "notice",
                  id: "people-peer-note",
                  tone: "neutral",
                  title: "External brain relationships",
                  text: "A peer link records how a locally administered person relates to another brain. It does not grant or change local access.",
                },
                peerSections.people,
              );
              return {
                ...base,
                attention,
                headBlocks: [sections.totals],
                peopleBlocks: [...sections.blocks],
              };
            }

            if (tab === "invitations") {
              const [invitationView, peerView] = await Promise.all([
                invitations.load({ query: parsed, caller, signal }),
                peers.load({ query: parsed, caller, signal }),
              ]);
              const peerSections = selectPeerTabSections(peerView.blocks);
              const sections = composeInvitationTabSections(
                invitationView.blocks,
                peerSections.invitations,
              );
              return {
                ...base,
                headBlocks: [sections.totals],
                invitationBlocks: [...sections.blocks],
                ...(invitationView.primaryAction
                  ? { primaryAction: invitationView.primaryAction }
                  : {}),
              };
            }

            const auditView = await audit.load({
              query: parsed,
              caller,
              signal,
            });
            return {
              ...base,
              auditBlocks: tabBlocks(auditView.blocks, "Audit"),
            };
          },
        }),
      ];
    },
  });

export default adminPackage;
