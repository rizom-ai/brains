import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import {
  actionRequest,
  adminActor,
  captureAdminWorkspaces,
  findAction,
  resultField,
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

describe("Admin-owned Studio People workspace", () => {
  it("owns roster detail and attributed access administration through the shared registration contract", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "manual-test",
      displayName: "Manual test",
      subjectLabel: "Address",
      manualDelivery: true,
    });
    shell.getChannelRegistry().finalize();
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-admin-people-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
    await service.initialize();
    const admin = await service.createUser({
      displayName: "Ada Admin",
      role: "admin",
    });
    const member = await service.createUser({
      displayName: "Tess Trusted",
      role: "trusted",
    });
    const actor = actorFor(adminActor, admin);
    const deniedActor = actorFor(trustedActor, member);
    const identity = await service.attachIdentity(
      {
        userId: member.userId,
        type: "manual-test",
        subject: "tess@example.test",
        label: "Tess private address",
        verifiedAt: Date.now(),
        source: { kind: "admin" },
      },
      { actorUserId: admin.userId },
    );

    const registrations = await captureAdminWorkspaces(shell);
    const workspace = workspaceByLabel(registrations, "People");
    expect(workspace).toMatchObject({
      id: "admin:people",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      urlQuery: true,
    });
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const initial = await workspace.dataProvider(actor, {
      selected: member.userId,
    });
    expect(initial).toMatchObject({
      view: {
        title: "People",
        blocks: [
          { type: "stats" },
          {},
          {
            type: "detail",
            open: { forId: member.userId, title: "Tess Trusted" },
          },
        ],
      },
    });
    expect(JSON.stringify(initial)).toContain("Brain Anchor");
    expect(JSON.stringify(initial)).toContain("Tess private address");
    expect(findAction(initial, "Revoke all sessions")).toBeDefined();
    const self = await workspace.dataProvider(actor, {
      selected: admin.userId,
    });
    expect(JSON.stringify(self)).toContain(
      "Manage your own credentials and sessions",
    );
    expect(findAction(self, "Revoke all sessions")).toBeUndefined();

    const changeRole = findAction(initial, "Change role");
    expect(changeRole).toMatchObject({
      actionId: "update-person-role",
      form: { submitLabel: "Change role" },
    });
    const prepared = await workspace.actionHandler?.(
      actionRequest(
        changeRole,
        { userId: member.userId, role: "public" },
        { mode: "prepare" },
      ),
      actor,
    );
    const token = resultField(prepared, "token");
    if (typeof token !== "string") throw new Error("Expected role token");
    await workspace.actionHandler?.(
      actionRequest(
        changeRole,
        { userId: member.userId, role: "public" },
        { mode: "execute", token },
      ),
      actor,
    );
    expect(
      (await service.listAdminUsers()).find(
        (candidate) => candidate.userId === member.userId,
      )?.role,
    ).toBe("public");

    const afterRole = await workspace.dataProvider(actor, {
      selected: member.userId,
    });
    const setup = findAction(afterRole, "Create setup link");
    const setupResponse = await workspace.actionHandler?.(
      actionRequest(setup),
      actor,
    );
    const setupUrl = resultField(setupResponse, "setupUrl");
    if (typeof setupUrl !== "string") throw new Error("Expected setup URL");
    expect(setupUrl).toContain("token=");
    expect(
      JSON.stringify(
        await workspace.dataProvider(actor, { selected: member.userId }),
      ),
    ).not.toContain(setupUrl);

    const detach = findAction(afterRole, "Detach channel");
    expect(detach).toBeDefined();
    const detachPrepared = await workspace.actionHandler?.(
      actionRequest(
        detach,
        {
          userId: member.userId,
          identityId: identity.id,
        },
        { mode: "prepare" },
      ),
      actor,
    );
    const detachToken = resultField(detachPrepared, "token");
    if (typeof detachToken !== "string") {
      throw new Error("Expected detach token");
    }
    await workspace.actionHandler?.(
      actionRequest(
        detach,
        { userId: member.userId, identityId: identity.id },
        { mode: "execute", token: detachToken },
      ),
      actor,
    );
    const attach = findAction(afterRole, "Attach channel");
    await workspace.actionHandler?.(
      actionRequest(attach, {
        userId: member.userId,
        type: "manual-test",
        subject: "tess-new@example.test",
        label: "Tess replacement address",
      }),
      actor,
    );

    const suspend = findAction(afterRole, "Suspend person");
    const suspendPrepared = await workspace.actionHandler?.(
      actionRequest(
        suspend,
        { userId: member.userId, status: "suspended" },
        { mode: "prepare" },
      ),
      actor,
    );
    const suspendToken = resultField(suspendPrepared, "token");
    if (typeof suspendToken !== "string") {
      throw new Error("Expected suspension token");
    }
    await workspace.actionHandler?.(
      actionRequest(
        suspend,
        { userId: member.userId, status: "suspended" },
        { mode: "execute", token: suspendToken },
      ),
      actor,
    );
    const suspended = await workspace.dataProvider(actor, {
      selected: member.userId,
    });
    expect(findAction(suspended, "Reactivate person")).toBeDefined();
    expect(findAction(suspended, "Delete person")).toBeDefined();
    expect(findAction(suspended, "Change role")).toBeUndefined();

    const audit = await service.listAuditEvents();
    for (const action of [
      "auth.user.role_updated",
      "auth.passkey.registration_started",
      "auth.identity.detached",
      "auth.identity.attached",
      "auth.user.status_updated",
    ]) {
      expect(audit.find((event) => event.action === action)?.actorUserId).toBe(
        admin.userId,
      );
    }
  });
});
