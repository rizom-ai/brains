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

describe("Admin-owned Studio Peers workspace", () => {
  it("lists, links, and invites peers without retaining setup output", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    shell.getChannelRegistry().registerDescriptor("test", {
      type: "manual-test",
      displayName: "Manual test",
      subjectLabel: "Address",
      manualDelivery: true,
    });
    shell.getChannelRegistry().finalize();
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-admin-peers-"),
    });
    authPlugins.push(auth);
    await auth.register(shell);
    const service = auth.getService();
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

    const workspace = workspaceByLabel(
      await captureAdminWorkspaces(shell),
      "Peers",
    );
    expect(workspace).toMatchObject({
      id: "admin:peers",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      urlQuery: true,
    });
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const initial = await workspace.dataProvider(actor, {
      peerId: "did:web:grace.example",
      displayName: "Grace Hopper",
    });
    expect(findAction(initial, "Invite peer person")).toMatchObject({
      input: {
        peerId: "did:web:grace.example",
        displayName: "Grace Hopper",
      },
      form: { submitLabel: "Invite peer person" },
    });
    const link = findAction(initial, "Link peer to person");
    const prepared = await workspace.actionHandler?.(
      actionRequest(
        link,
        { peerId: "did:web:tess.example", userId: member.userId },
        { mode: "prepare" },
      ),
      actor,
    );
    const token = resultField(prepared, "token");
    if (typeof token !== "string") throw new Error("Expected link token");
    await workspace.actionHandler?.(
      actionRequest(
        link,
        { peerId: "did:web:tess.example", userId: member.userId },
        { mode: "execute", token },
      ),
      actor,
    );
    expect(JSON.stringify(await workspace.dataProvider(actor))).toContain(
      "did:web:tess.example",
    );

    const invite = findAction(initial, "Invite peer person");
    const invited = await workspace.actionHandler?.(
      actionRequest(invite, {
        peerId: "did:web:grace.example",
        displayName: "Grace Hopper",
        role: "trusted",
        deliveryType: "manual-test",
        deliverySubject: "grace@example.test",
        deliveryLabel: "Grace private address",
        deliveryMode: "manual",
      }),
      actor,
    );
    const setupUrl = resultField(invited, "setupUrl");
    if (typeof setupUrl !== "string") throw new Error("Expected setup URL");
    expect(setupUrl).toContain("token=");
    const refreshed = await workspace.dataProvider(actor);
    expect(JSON.stringify(refreshed)).toContain("did:web:grace.example");
    expect(JSON.stringify(refreshed)).not.toContain(setupUrl);

    const audit = await service.listAuditEvents();
    for (const action of [
      "auth.external_peer.linked",
      "auth.external_peer.invited",
    ]) {
      expect(audit.find((event) => event.action === action)?.actorUserId).toBe(
        admin.userId,
      );
    }
  });
});
