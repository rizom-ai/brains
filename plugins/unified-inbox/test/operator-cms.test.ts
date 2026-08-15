import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  InboxRegistry,
  createServicePluginContext,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type InboxActor,
  type InboxItem,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  InboxDataSource,
  InboxOperatorService,
  inboxWorkspaceSnapshotSchema,
  registerUnifiedInboxCmsWorkspace,
} from "../src";

const admin: CmsWorkspaceActor = {
  interfaceType: "cms",
  userId: "admin-user",
  actor: { kind: "user", userId: "admin-user" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const item: InboxItem = {
  id: "mail-1",
  title: "Time-sensitive request",
  summary: "A content-safe routing summary.",
  contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam/id" },
  receivedAt: "2026-08-08T09:00:00.000Z",
  urgency: "high",
  entityRef: { entityType: "mail-item", entityId: "mail-1" },
  followUps: [
    {
      kind: "draft-reply",
      context: { mailItemId: "private-context-mail-1" },
    },
  ],
  actions: [{ id: "archive", label: "Archive", confirm: true }],
};

async function setup(options?: {
  failAction?: boolean;
  adminHref?: string | false;
}): Promise<{
  workspace: CmsWorkspaceRegistration;
  actors: InboxActor[];
  detailActors: InboxActor[];
  withdraw(): void;
}> {
  const shell = createMockShell({ domain: "brain.test" });
  if (options?.adminHref !== false) {
    shell.registerInteraction({
      id: "admin",
      label: "Admin",
      description: "Manage people and access.",
      href: options?.adminHref ?? "/access/people?view=members",
      kind: "admin",
      pluginId: "admin",
      priority: 50,
      visibility: "admin",
    });
  }
  let workspace: CmsWorkspaceRegistration | undefined;
  shell
    .getMessageBus()
    .subscribe<CmsWorkspaceRegistration, { workspaceUrl: string }>(
      CMS_WORKSPACE_REGISTER_MESSAGE,
      async (message) => {
        workspace = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/studio/workspaces/inbox" },
        };
      },
    );
  let open = true;
  const actors: InboxActor[] = [];
  const detailActors: InboxActor[] = [];
  const registry = new InboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => (open ? [item] : []),
    resolveDetail: async (_itemId, actor, signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      detailActors.push(actor);
      return {
        kind: "plain",
        text: "Original private message",
        truncated: false,
      };
    },
    act: async (_itemId, _actionId, actor) => {
      actors.push(actor);
      if (options?.failAction) throw new Error("private mailbox failure");
      open = false;
    },
  });
  registry.finalize();
  const followUps = shell.getInboxFollowUpRegistry();
  followUps.registerKind("chat", {
    kind: "discuss-in-chat",
    label: "Discuss in chat",
    priority: 10,
    mode: "universal",
    permissionLevel: "trusted",
    applies: ({ item: candidate }) => candidate.entityRef !== undefined,
    resolve: () => ({ href: "/talk" }),
  });
  followUps.registerKind("drafting", {
    kind: "draft-reply",
    label: "Draft reply",
    priority: 900,
    mode: "declared",
    permissionLevel: "admin",
    contextSchema: z.strictObject({
      mailItemId: z.literal("private-context-mail-1"),
    }),
    applies: () => true,
    resolve: () => ({ href: "/draft" }),
  });
  followUps.finalize();
  const operator = new InboxOperatorService(
    registry,
    new InboxDataSource(registry),
    followUps,
  );
  const context = createServicePluginContext(shell, "unified-inbox");
  expect(await registerUnifiedInboxCmsWorkspace(context, operator)).toBe(
    "/studio/workspaces/inbox",
  );
  if (!workspace) throw new Error("Unified inbox workspace was not registered");
  return {
    workspace,
    actors,
    detailActors,
    withdraw: (): void => {
      open = false;
    },
  };
}

describe("unified inbox CMS registration", () => {
  it("registers an Admin workspace with bounded server filters and a badge", async () => {
    const fixture = await setup();

    expect(fixture.workspace).toMatchObject({
      id: "inbox",
      pluginId: "unified-inbox",
      label: "Inbox",
      rendererName: "UnifiedInboxWorkspace",
      priority: 20,
      urlQuery: true,
    });
    expect(
      await fixture.workspace.accessHandler({
        ...admin,
        userPermissionLevel: "trusted",
        visibilityScope: "shared",
      }),
    ).toBe(false);
    const snapshot = inboxWorkspaceSnapshotSchema.parse(
      await fixture.workspace.dataProvider(admin, {
        sourceId: "mail-items",
        urgency: "high",
        offset: "0",
        limit: "1",
      }),
    );
    expect(snapshot).toMatchObject({
      summary: { open: 1, high: 1 },
      total: 1,
      offset: 0,
      limit: 1,
      entries: [
        {
          item: {
            id: "mail-1",
            contact: {
              label: "Sam Rivera · acme.io",
              personId: "prsn_sam/id",
            },
          },
          contactHref: "/access/people?view=members&person=prsn_sam%2Fid",
          followUps: [
            {
              kind: "draft-reply",
              label: "Draft reply",
              href: "/draft",
            },
            {
              kind: "discuss-in-chat",
              label: "Discuss in chat",
              href: "/talk",
            },
          ],
        },
      ],
    });
    expect(
      inboxWorkspaceSnapshotSchema.safeParse({
        ...snapshot,
        entries: [{ ...snapshot.entries[0], contactHref: "https://evil.test" }],
      }).success,
    ).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("private-context-mail-1");
    expect(snapshot.entries[0]?.item).not.toHaveProperty("followUps");
    expect(await fixture.workspace.badgeProvider?.(admin)).toBe(1);

    const canonicalized = inboxWorkspaceSnapshotSchema.parse(
      await fixture.workspace.dataProvider(admin, {
        sourceId: "missing-source",
        urgency: "urgent",
        offset: "not-a-page",
        limit: "101",
        "facet.category": "orphaned",
      }),
    );
    expect(canonicalized).toMatchObject({
      total: 1,
      offset: 0,
      limit: 50,
      entries: [{ item: { id: "mail-1" } }],
    });
  });

  it("leaves resolved contacts unlinked when Admin is not registered", async () => {
    const fixture = await setup({ adminHref: false });
    const snapshot = inboxWorkspaceSnapshotSchema.parse(
      await fixture.workspace.dataProvider(admin, {}),
    );

    expect(snapshot.entries[0]?.item.contact).toEqual({
      label: "Sam Rivera · acme.io",
      personId: "prsn_sam/id",
    });
    expect(snapshot.entries[0]).not.toHaveProperty("contactHref");
  });

  it("loads private detail through an Admin-only no-store workspace action", async () => {
    const fixture = await setup();
    if (!fixture.workspace.actionHandler) {
      throw new Error("Missing action handler");
    }

    expect(
      await fixture.workspace.actionHandler(
        { type: "detail", sourceId: "mail-items", itemId: "mail-1" },
        admin,
        new AbortController().signal,
      ),
    ).toEqual({
      kind: "detail",
      detail: {
        kind: "plain",
        text: "Original private message",
        truncated: false,
      },
    });
    expect(fixture.detailActors).toEqual([{ permissionLevel: "admin" }]);

    fixture.withdraw();
    expect(
      await fixture.workspace.actionHandler(
        { type: "detail", sourceId: "mail-items", itemId: "mail-1" },
        admin,
      ),
    ).toEqual({
      kind: "detail-unavailable",
      error: "Original content is unavailable",
    });
    expect(fixture.detailActors).toHaveLength(1);
  });

  it("server-gates confirmation and re-checks withdrawn actions", async () => {
    const fixture = await setup();
    if (!fixture.workspace.actionHandler)
      throw new Error("Missing action handler");
    const action = {
      sourceId: "mail-items",
      itemId: "mail-1",
      actionId: "archive",
    };

    expect(await fixture.workspace.actionHandler(action, admin)).toEqual({
      kind: "confirmation",
      summary: 'Archive "Time-sensitive request"?',
    });
    expect(fixture.actors).toEqual([]);

    fixture.withdraw();
    expect(
      await fixture.workspace.actionHandler(
        { ...action, confirmed: true },
        admin,
      ),
    ).toEqual({ kind: "error", error: "Inbox action failed" });
    expect(fixture.actors).toEqual([]);
  });

  it("maps only the CMS permission and fixes source exceptions", async () => {
    const fixture = await setup({ failAction: true });
    if (!fixture.workspace.actionHandler)
      throw new Error("Missing action handler");

    const result = await fixture.workspace.actionHandler(
      {
        sourceId: "mail-items",
        itemId: "mail-1",
        actionId: "archive",
        confirmed: true,
      },
      admin,
    );

    expect(result).toEqual({ kind: "error", error: "Inbox action failed" });
    expect(fixture.actors).toEqual([{ permissionLevel: "admin" }]);
    expect(JSON.stringify(result)).not.toContain("private mailbox failure");
    expect(
      await fixture.workspace.actionHandler({ type: "private" }, admin),
    ).toEqual({ kind: "error", error: "Invalid inbox action" });
  });
});
