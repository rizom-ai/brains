import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
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
        blocks: [{ type: "tabs", defaultTab: "audit" }],
      },
    });
    expect(tabIds(audit)).toEqual(["people", "invitations", "audit"]);
    expect(rosterLoads).toBe(0);

    const people = await workspace.dataProvider(actor, { tab: "people" });
    expect(people).toMatchObject({
      view: {
        title: "Administration",
        blocks: [{ type: "tabs", defaultTab: "people" }],
      },
    });
    expect(rosterLoads).toBeGreaterThan(0);
    expect(await workspace.badgeProvider?.(actor)).toBe(2);
  });
});
