import { describe, expect, it } from "bun:test";
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
  actions: [{ id: "archive", label: "Archive", confirm: true }],
};

async function setup(options?: {
  failAction?: boolean;
  adminHref?: string | false;
}): Promise<{
  workspace: CmsWorkspaceRegistration;
  actors: InboxActor[];
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
  const registry = new InboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => (open ? [item] : []),
    act: async (_itemId, _actionId, actor) => {
      actors.push(actor);
      if (options?.failAction) throw new Error("private mailbox failure");
      open = false;
    },
  });
  registry.finalize();
  const operator = new InboxOperatorService(
    registry,
    new InboxDataSource(registry),
  );
  const context = createServicePluginContext(shell, "unified-inbox");
  expect(await registerUnifiedInboxCmsWorkspace(context, operator)).toBe(
    "/studio/workspaces/inbox",
  );
  if (!workspace) throw new Error("Unified inbox workspace was not registered");
  return {
    workspace,
    actors,
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
        },
      ],
    });
    expect(
      inboxWorkspaceSnapshotSchema.safeParse({
        ...snapshot,
        entries: [{ ...snapshot.entries[0], contactHref: "https://evil.test" }],
      }).success,
    ).toBe(false);
    expect(await fixture.workspace.badgeProvider?.(admin)).toBe(1);
    expect(
      fixture.workspace.dataProvider(admin, { limit: "101" }),
    ).rejects.toThrow("Invalid unified inbox query");
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
