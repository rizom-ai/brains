import { describe, expect, it } from "bun:test";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type InboxActor,
  type InboxItem,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createUnifiedInboxPlugin } from "./install";

const admin: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "admin-user",
  actor: { kind: "user", userId: "admin-user" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const preparedConfirmationSchema = z.object({
  kind: z.literal("prepared-confirmation"),
  token: z.string().uuid(),
  summary: z.string(),
  expiresAt: z.string().datetime(),
});

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
  workspace: StudioWorkspaceRegistration;
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
  let workspace: StudioWorkspaceRegistration | undefined;
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      STUDIO_WORKSPACE_REGISTER_MESSAGE,
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
  const registry = shell.getInboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => (open ? [item] : []),
    resolveDetail: async (_itemId, actor) => {
      detailActors.push(actor);
      return {
        kind: "plain",
        text: "Original request\nwith bounded source detail.",
        truncated: true,
      };
    },
    act: async (_itemId, _actionId, actor) => {
      actors.push(actor);
      if (options?.failAction) throw new Error("private mailbox failure");
      open = false;
    },
  });
  const followUps = shell.getInboxFollowUpRegistry();
  followUps.registerKind("web-chat", {
    kind: "discuss-in-chat",
    label: "Discuss in chat",
    priority: 5,
    mode: "universal",
    permissionLevel: "trusted",
    applies: () => true,
    resolve: () => ({
      href: "/private/chat/path",
      state: { privateHandoff: "must-not-serialize" },
    }),
  });
  followUps.registerKind("studio", {
    kind: "open-entity",
    label: "Open source entity",
    priority: 10,
    mode: "universal",
    permissionLevel: "trusted",
    applies: ({ item: candidate }) => candidate.entityRef !== undefined,
    resolve: () => ({ href: "/private/entity/path" }),
  });
  followUps.registerKind("studio", {
    kind: "capture-as-note",
    label: "Capture as note",
    priority: 20,
    mode: "universal",
    permissionLevel: "trusted",
    applies: ({ item: candidate }) => candidate.entityRef !== undefined,
    resolve: () => ({ href: "/private/create/path" }),
  });
  followUps.finalize();
  registry.finalize();

  const plugin = createUnifiedInboxPlugin();
  await plugin.register(shell);
  await plugin.finalizeRegistration?.();
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

describe("unified inbox Studio registration", () => {
  it("registers an Admin workspace with bounded server filters and a badge", async () => {
    const fixture = await setup();

    expect(fixture.workspace).toMatchObject({
      id: "@brains/unified-inbox:unified-inbox:inbox",
      pluginId: "@brains/unified-inbox:unified-inbox",
      label: "Inbox",
      rendererName: "DeclarativeOperatorWorkspace",
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
    const workspace = await fixture.workspace.dataProvider(admin, {
      sourceId: "mail-items",
      urgency: "high",
      selected: "mail-items:mail-1",
      offset: "0",
      limit: "1",
    });
    expect(workspace).toMatchObject({ view: { title: "Inbox" } });
    const serialized = JSON.stringify(workspace);
    expect(serialized).toContain('"type":"query"');
    expect(serialized).toContain('"title":"Time-sensitive request"');
    expect(serialized).toContain('"entityType":"person"');
    expect(serialized).toContain('"capabilityId":"archive"');
    expect(serialized).toContain('"kind":"prepared"');
    expect(serialized).toContain('"kind":"detail"');
    expect(serialized).toContain('"type":"detail"');
    expect(serialized).toContain('"forId":"mail-items:mail-1"');
    expect(serialized).toContain('"type":"text"');
    expect(serialized).toContain(
      "Original request\\nwith bounded source detail.",
    );
    expect(serialized).toContain('"truncated":true');
    expect(serialized).toContain('"target":"inbox-discuss-in-chat"');
    expect(serialized).toContain('"sourceId":"mail-items"');
    expect(serialized).toContain('"itemId":"mail-1"');
    expect(serialized).toContain('"target":"inbox-open-entity"');
    expect(serialized).toContain('"target":"inbox-capture-note"');
    expect(serialized).toContain('"summary":"A content-safe routing summary."');
    expect(serialized).not.toContain("/access/people");
    expect(serialized).not.toContain("/private/");
    expect(serialized).not.toContain("must-not-serialize");
    expect(fixture.detailActors).toEqual([{ permissionLevel: "admin" }]);
    expect(await fixture.workspace.badgeProvider?.(admin)).toBe(1);

    expect(
      fixture.workspace.dataProvider(admin, {
        sourceId: "missing-source",
        urgency: "urgent",
        offset: "not-a-page",
        limit: "101",
        "facet.category": "orphaned",
      }),
    ).rejects.toThrow("invalid query state");
  });

  it("uses typed contact links without depending on an Admin URL", async () => {
    const fixture = await setup({ adminHref: false });
    // Follow-ups live in the reading pane, so a selection is what surfaces the
    // contact link; the collection itself stays scannable.
    const workspace = await fixture.workspace.dataProvider(admin, {
      selected: "mail-items:mail-1",
    });
    expect(JSON.stringify(workspace)).toContain('"entityType":"person"');
    expect(JSON.stringify(workspace)).not.toContain("/access/people");
  });

  it("keeps follow-ups out of the collection until an item is opened", async () => {
    const fixture = await setup();
    const closed = JSON.stringify(
      await fixture.workspace.dataProvider(admin, {}),
    );
    expect(closed).not.toContain('"entityType":"person"');
    expect(closed).not.toContain("inbox-detail-follow-ups");
    // The verbs that clear an item stay on the row: triage should not require
    // opening each item first.
    expect(closed).toContain('"capabilityId":"archive"');
  });

  it("server-gates confirmation and re-checks withdrawn actions", async () => {
    const fixture = await setup();
    if (!fixture.workspace.actionHandler)
      throw new Error("Missing action handler");
    const input = {
      sourceId: "mail-items",
      itemId: "mail-1",
      capability: {
        id: "archive",
        label: "Archive",
        confirmation: "prepared",
      },
    };
    const prepared = preparedConfirmationSchema.parse(
      await fixture.workspace.actionHandler(
        { actionId: "run-inbox-action", input, mode: "prepare" },
        admin,
      ),
    );
    expect(prepared.summary).toBe('Archive "Time-sensitive request"?');
    expect(fixture.actors).toEqual([]);

    fixture.withdraw();
    expect(
      fixture.workspace.actionHandler(
        {
          actionId: "run-inbox-action",
          input,
          confirmationToken: prepared.token,
        },
        admin,
      ),
    ).rejects.toThrow("invalid or stale");
    expect(fixture.actors).toEqual([]);
  });

  it("maps only the Studio permission and fixes source exceptions", async () => {
    const fixture = await setup({ failAction: true });
    if (!fixture.workspace.actionHandler)
      throw new Error("Missing action handler");

    const input = {
      sourceId: "mail-items",
      itemId: "mail-1",
      capability: {
        id: "archive",
        label: "Archive",
        confirmation: "prepared",
      },
    };
    const prepared = preparedConfirmationSchema.parse(
      await fixture.workspace.actionHandler(
        { actionId: "run-inbox-action", input, mode: "prepare" },
        admin,
      ),
    );
    expect(
      fixture.workspace.actionHandler(
        {
          actionId: "run-inbox-action",
          input,
          confirmationToken: prepared.token,
        },
        admin,
      ),
    ).rejects.toThrow('action "run-inbox-action" failed');
    expect(fixture.actors).toEqual([{ permissionLevel: "admin" }]);
    expect(
      fixture.workspace.actionHandler({ type: "private" }, admin),
    ).rejects.toThrow("invalid action request");
  });
});

describe("unified inbox source availability", () => {
  it("carries per-source urgency and availability on the source filter", async () => {
    const fixture = await setup();
    const workspace = await fixture.workspace.dataProvider(admin, {});
    const serialized = JSON.stringify(workspace);

    // The filter is where a source is chosen, so it carries what distinguishes
    // one: its open count, its urgent share, and whether it can be read at all.
    expect(serialized).toContain('"label":"Email Triage · 1 high"');

    // Source availability is no longer a block of its own: name and open count
    // duplicated the filter, and unavailability duplicated the error notice.
    expect(serialized).not.toContain('"id":"source-health"');
    expect(serialized).not.toContain("Source availability");
  });
});
