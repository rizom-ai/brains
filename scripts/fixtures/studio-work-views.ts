import { createMockShell } from "@brains/plugins/test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  createServicePluginContext,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import {
  StudioOverviewRegistry,
  createStudioOverviewWorkspace,
} from "../../plugins/studio/src/overview-workspace";
import {
  InboxDataSource,
  InboxOperatorService,
  registerUnifiedInboxStudioWorkspace,
} from "../../plugins/unified-inbox/src";

import type { StudioStudyState } from "./studio-study-state";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Seed source inputs; the production providers own all view composition. */
/** Activity is recorded at fixed offsets from `now`, the harness clock. */
export async function createWorkViewFixtures(
  state?: StudioStudyState,
  now: number = Date.now(),
): Promise<{
  overview: () => Promise<unknown>;
  overviewBadge: () => Promise<number>;
  inbox: (query: Record<string, string>) => Promise<unknown>;
}> {
  const shell = createMockShell({ domain: "brain.test" });
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "visual-admin",
    actor: { kind: "user", userId: "visual-admin" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  let clock = now;
  const registry = new StudioOverviewRegistry({ now: (): number => clock });
  registry.register({
    id: "publishing",
    pluginId: "content-pipeline",
    title: "Publishing",
    group: "publishing",
    rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    visibility: "admin",
    section: "primary",
    priority: 10,
    dataProvider: async () => ({
      view: {
        blocks: [
          {
            type: "stats",
            items: [{ label: "Queued", value: state === "empty" ? 0 : 1 }],
          },
          {
            type: "links",
            items: [
              {
                label: "Open publishing →",
                target: { kind: "launch", launch: { target: "publishing" } },
              },
            ],
          },
        ],
      },
      digest: {
        attention: state === "empty" ? 0 : 1,
        items:
          state === "empty"
            ? []
            : [
                {
                  label: "Awaiting review",
                  value: "One draft needs review.",
                  tone: "warn",
                },
              ],
      },
    }),
  });
  if (state !== "empty" && state !== "restart") {
    clock = now - 7 * HOUR;
    await registry.recordEntity("created", {
      entityType: "post",
      entityId: "notes-on-stewardship",
    });
    clock = now - 5 * HOUR;
    registry.recordJob({
      id: "directory-sync",
      type: "job",
      status: "completed",
      message: "Pulled 14 changes from git.",
      jobDetails: { jobType: "directory-sync", priority: 0, retryCount: 0 },
    });
    clock = now - 12 * MINUTE;
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "quiet-infrastructure",
    });
    clock = now;
    registry.recordJob({
      id: "preview-build",
      type: "job",
      status: "failed",
      message:
        "Preview render failed. Inspect the retained build diagnostics before retrying.",
      jobDetails: { jobType: "site-build", priority: 0, retryCount: 0 },
    });
  }
  const overview = createStudioOverviewWorkspace({
    context: createServicePluginContext(shell, "studio"),
    registry,
    now: (): number => now,
  });
  const inboxSources = shell.getInboxRegistry();
  const closed = new Set<string>();
  inboxSources.registerSource("email", {
    sourceId: "email",
    displayName: "Email",
    list: async () => {
      if (state === "outage")
        throw new Error("Fixture email source unavailable");
      if (state === "empty") return [];
      return [
        {
          id: "field-notes",
          title: "Could we share your field notes?",
          summary: "Grace Hopper asked to reuse your notes.",
          receivedAt: "2026-07-11T09:15:00.000Z",
          urgency: "high" as const,
          actions: [{ id: "done", label: "Done" }],
        },
        {
          id: "next-gathering",
          title: "A question about the next gathering",
          summary: "Alex Morgan asked about the September dates.",
          receivedAt: "2026-07-11T09:02:00.000Z",
          urgency: "normal" as const,
          actions: [{ id: "done", label: "Done" }],
        },
        {
          id: "quiet-infrastructure",
          title: "Feedback on Quiet infrastructure",
          summary: "Sam Rivera shared comments on the draft.",
          receivedAt: "2026-07-11T08:40:00.000Z",
          urgency: "normal" as const,
          actions: [{ id: "done", label: "Done" }],
        },
      ].filter((item) => !closed.has(item.id));
    },
    resolveDetail: async () => ({
      kind: "plain",
      text: "Original source text\n\nRetained for reading before deciding what to do next.",
      truncated: false,
    }),
    act: async (id) => {
      closed.add(id);
    },
  });
  inboxSources.finalize();
  shell.getInboxFollowUpRegistry().finalize();
  let inbox: StudioWorkspaceRegistration | undefined;
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      STUDIO_WORKSPACE_REGISTER_MESSAGE,
      async (message) => {
        inbox = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/studio/workspaces/unified-inbox%3Ainbox" },
        };
      },
    );
  await registerUnifiedInboxStudioWorkspace(
    createServicePluginContext(shell, "unified-inbox"),
    new InboxOperatorService(
      inboxSources,
      new InboxDataSource(inboxSources),
      shell.getInboxFollowUpRegistry(),
    ),
  );
  const workspace = inbox;
  if (!workspace) throw new Error("Inbox fixture did not register");
  return {
    overview: () => overview.dataProvider(actor, {}),
    overviewBadge: async () => (await overview.badgeProvider?.(actor)) ?? 0,
    inbox: (query) => workspace.dataProvider(actor, query),
  };
}
