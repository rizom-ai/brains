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

describe("Admin-owned Studio Audit workspace", () => {
  it("admits only Admin actors and renders filtered URL-query detail", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-admin-audit-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const trusted = await service.createUser({
      displayName: "Tess Trusted",
      role: "trusted",
    });
    const event = await service.recordAuditEvent({
      actorUserId: admin.userId,
      action: "auth.user.role_updated",
      targetType: "user",
      targetId: trusted.userId,
      metadata: { secret: "must-not-render" },
    });
    const actor = actorFor(adminActor, admin);
    const deniedActor = actorFor(trustedActor, trusted);

    const workspace = workspaceByLabel(
      await captureAdminWorkspaces(shell),
      "Audit",
    );
    expect(workspace).toMatchObject({
      id: "admin:audit",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      urlQuery: true,
    });
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const data = await workspace.dataProvider(actor, {
      action: event.action,
      selected: event.id,
    });
    expect(data).toMatchObject({
      view: {
        title: "Audit",
        blocks: [
          { type: "query", pagination: { total: 1 } },
          {
            type: "detail",
            open: {
              forId: event.id,
              title: "Changed an account role",
            },
            master: {
              type: "table",
              rows: [
                {
                  id: event.id,
                  cells: {
                    actor: "Ada Admin",
                    action: "Changed an account role",
                    target: "Tess Trusted",
                  },
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(data)).not.toContain("must-not-render");

    const deepLink = await workspace.dataProvider(actor, {
      action: event.action,
      selected: event.id,
      offset: "100",
    });
    expect(deepLink).toMatchObject({
      view: {
        blocks: [
          {},
          {
            open: { forId: event.id },
            master: { rows: [] },
          },
        ],
      },
    });
  });
});
