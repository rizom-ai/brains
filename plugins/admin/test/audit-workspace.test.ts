import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import {
  administrationTab,
  adminActor,
  captureAdminWorkspaces,
  trustedActor,
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

function findById(value: unknown, id: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (Reflect.get(value, "id") === id) return value;
  for (const child of Object.values(value)) {
    const result = findById(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("Administration Audit tab", () => {
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

    const workspace = administrationTab(
      await captureAdminWorkspaces(shell),
      "audit",
    );
    expect(workspace).toMatchObject({
      id: "admin:administration",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      permission: "admin",
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
        title: "Administration",
        blocks: [{ type: "tabs", defaultTab: "audit" }],
      },
    });
    expect(data).not.toHaveProperty("view.primaryAction");
    expect(findById(data, "audit-filters")).toMatchObject({
      type: "query",
      controls: [{ key: "actorUserId" }, { key: "action" }],
    });
    expect(findById(data, "audit-filters")).not.toHaveProperty("pagination");
    expect(findById(data, "audit-detail")).toMatchObject({
      type: "detail",
      open: {
        forId: event.id,
        title: "Role changed",
      },
      master: {
        type: "list",
        presentation: "standard",
        items: [
          {
            id: event.id,
            title: "Role changed",
            description: "Ada Admin → Tess Trusted",
            metadata: [new Date(event.createdAt).toISOString()],
            links: [
              {
                label: "Details",
                target: { kind: "detail", itemId: event.id },
              },
            ],
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
    expect(findById(deepLink, "audit-filters")).toMatchObject({
      pagination: { offset: 100, total: 1 },
    });
    expect(findById(deepLink, "audit-detail")).toMatchObject({
      open: { forId: event.id },
      master: { items: [] },
    });
    const identity = await service.recordAuditEvent({
      actorUserId: admin.userId,
      action: "auth.identity.attached",
      targetType: "identity",
      targetId: "identity-test",
      metadata: { userId: trusted.userId, secret: "must-not-render" },
    });
    const identityView = await workspace.dataProvider(actor, {
      action: identity.action,
      selected: identity.id,
    });
    expect(findById(identityView, "audit-detail")).toMatchObject({
      master: { items: [{ description: "Ada Admin → Tess Trusted" }] },
    });
    const inspection = JSON.stringify(identityView);
    expect(inspection).toContain("identity-test");
    expect(inspection).toContain("auth.identity.attached");
    expect(inspection).not.toContain("must-not-render");
  });
});
