import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  adminActor,
  captureAdminWorkspaces,
  trustedActor,
  workspaceByLabel,
} from "./studio-workspace-test-helpers";

const authPlugins: AuthServicePlugin[] = [];

afterEach(async () => {
  for (const plugin of authPlugins.splice(0)) await plugin.shutdown?.();
});

function actorFor(
  base: StudioWorkspaceActor,
  user: { userId: string },
): StudioWorkspaceActor {
  return {
    ...base,
    userId: user.userId,
    actor: { kind: "user", userId: user.userId },
  };
}

/**
 * The shape these assertions read out of an opaque workspace view. Declared
 * as a schema so the blocks are checked on the way out rather than assumed.
 */
interface ViewBlockLike {
  readonly type?: string | undefined;
  readonly id?: string | undefined;
  readonly primary?: readonly ViewBlockLike[] | undefined;
  readonly aside?: readonly ViewBlockLike[] | undefined;
}

const viewBlockSchema: z.ZodType<ViewBlockLike> = z.lazy(() =>
  z.looseObject({
    type: z.string().optional(),
    id: z.string().optional(),
    primary: z.array(viewBlockSchema).optional(),
    aside: z.array(viewBlockSchema).optional(),
  }),
);

const viewBlockListSchema = z.array(viewBlockSchema);

function parseBlocks(value: unknown): ViewBlockLike[] {
  const parsed = viewBlockListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function viewBlocks(value: unknown): ViewBlockLike[] {
  if (value === null || typeof value !== "object") return [];
  const view = Reflect.get(value, "view");
  if (view === null || typeof view !== "object") return [];
  const blocks = Reflect.get(view, "blocks");
  return parseBlocks(blocks);
}

function peopleTabBlocks(value: unknown): ViewBlockLike[] {
  const tabs = viewBlocks(value).find((block) => block.type === "tabs");
  const entries = tabs ? Reflect.get(tabs, "tabs") : undefined;
  if (!Array.isArray(entries)) return [];
  const people = entries.find(
    (tab) => tab !== null && typeof tab === "object" && tab.id === "people",
  );
  const blocks = people ? Reflect.get(people, "blocks") : undefined;
  return parseBlocks(blocks);
}

function headBlockIds(value: unknown): string[] {
  return viewBlocks(value).flatMap((block) => (block.id ? [block.id] : []));
}

function blockIds(blocks: readonly ViewBlockLike[] | undefined): string[] {
  return (blocks ?? []).flatMap((block) => (block.id ? [block.id] : []));
}

function tabIds(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Reflect.get(value, "type") === "tabs") {
    const tabs = Reflect.get(value, "tabs");
    if (!Array.isArray(tabs)) return [];
    return tabs.flatMap((tab) => {
      if (tab === null || typeof tab !== "object") return [];
      const id = Reflect.get(tab, "id");
      return typeof id === "string" ? [id] : [];
    });
  }
  for (const child of Object.values(value)) {
    const found = tabIds(child);
    if (found.length > 0) return found;
  }
  return [];
}

describe("Admin-owned Studio Administration workspace", () => {
  it("loads only the selected tab and aggregates administration attention", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "manual-test",
      displayName: "Manual test",
      subjectLabel: "Address",
      manualDelivery: true,
    });
    shell.getChannelRegistry().finalize();
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-administration-workspace-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const suspended = await service.createUser({
      displayName: "Sam Suspended",
      role: "trusted",
    });
    await service.updateUserStatus(suspended.userId, "suspended", {
      actorUserId: admin.userId,
    });
    await service.createInvitation(
      {
        idempotencyKey: "administration-attention",
        displayName: "Ivy Invited",
        role: "trusted",
        delivery: {
          type: "manual-test",
          subject: "ivy@example.test",
          mode: "manual",
        },
      },
      { actorUserId: admin.userId },
    );

    const actor = actorFor(adminActor, admin);
    const deniedActor = actorFor(trustedActor, suspended);
    const originalListAdminUsers = service.listAdminUsers.bind(service);
    let rosterLoads = 0;
    service.listAdminUsers = async (): Promise<
      Awaited<ReturnType<typeof originalListAdminUsers>>
    > => {
      rosterLoads += 1;
      return originalListAdminUsers();
    };

    const workspace = workspaceByLabel(
      await captureAdminWorkspaces(shell),
      "Administration",
    );
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const audit = await workspace.dataProvider(actor, { tab: "audit" });
    expect(audit).toMatchObject({
      view: {
        title: "Administration",
        status: { label: "Admin only" },
        blocks: [{ type: "tabs", defaultTab: "audit" }],
      },
    });
    expect(tabIds(audit)).toEqual(["people", "invitations", "audit"]);
    expect(rosterLoads).toBe(0);

    const people = await workspace.dataProvider(actor, { tab: "people" });
    expect(people).toMatchObject({
      view: {
        title: "Administration",
        status: { label: "Admin only" },
        blocks: [
          { type: "stats", id: "people-summary" },
          { type: "tabs", defaultTab: "people" },
        ],
      },
    });
    expect(rosterLoads).toBeGreaterThan(0);
    expect(await workspace.badgeProvider?.(actor)).toBe(2);

    // People leads with the roster, then reads in the same main-plus-aside
    // grammar as Invitations: the peer roster owns the primary column while
    // standing facts and the peer actions sit beside it. Totals move to the
    // head instead of banding across the top of the table.
    const peopleTab = peopleTabBlocks(people);
    expect(blockIds(peopleTab)).toEqual(["people", "people-standing"]);
    const layout = peopleTab.find((block) => block.type === "columns");
    expect(blockIds(layout?.primary)).toEqual(["people-peers"]);
    expect(blockIds(layout?.aside)).toEqual([
      "brain-anchor",
      "people-peer-note",
      "link-peer",
    ]);
    expect(peopleTab.some((block) => block.type === "stats")).toBe(false);
    expect(headBlockIds(people)).toContain("people-summary");
  });
});
