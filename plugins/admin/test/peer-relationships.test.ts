import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { createTempDataDir } from "@brains/plugins/test";
import { createMockShell } from "@brains/test-utils";
import { selectPeerTabSections } from "../src/peer-tab-provider";
import {
  actionRequest,
  administrationTab,
  adminActor,
  captureAdminWorkspaces,
  findAction,
  resultField,
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

describe("Administration peer relationships", () => {
  it("fails loudly when a required peer composition block disappears", () => {
    expect(() => selectPeerTabSections([])).toThrow(
      'Peer tab composition requires block "link-peer"',
    );
  });

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

    const registrations = await captureAdminWorkspaces(shell);
    const workspace = administrationTab(registrations, "people");
    const invitations = administrationTab(registrations, "invitations");
    expect(workspace).toMatchObject({
      id: "admin:administration",
      pluginId: "admin",
      rendererName: "DeclarativeOperatorWorkspace",
      permission: "admin",
      urlQuery: true,
    });
    expect(await workspace.accessHandler(actor)).toBe(true);
    expect(await workspace.accessHandler(deniedActor)).toBe(false);

    const initial = await workspace.dataProvider(actor, {
      peerId: "did:web:grace.example",
      displayName: "Grace Hopper",
    });
    const peerInvitation = await invitations.dataProvider(actor, {
      peerId: "did:web:grace.example",
      displayName: "Grace Hopper",
    });
    expect(findAction(peerInvitation, "Invite peer person")).toMatchObject({
      input: {
        peerId: "did:web:grace.example",
        displayName: "Grace Hopper",
      },
      form: {
        presentation: "disclosure",
        submitLabel: "Invite peer person",
      },
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

    const invite = findAction(peerInvitation, "Invite peer person");
    const invited = await invitations.actionHandler?.(
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
    const refreshed = await workspace.dataProvider(actor, {
      selected: member.userId,
    });
    expect(JSON.stringify(refreshed)).toContain("did:web:grace.example");
    expect(JSON.stringify(refreshed)).not.toContain(setupUrl);

    const unlink = findAction(refreshed, "Unlink peer");
    const unlinkPrepared = await workspace.actionHandler?.(
      actionRequest(unlink, undefined, { mode: "prepare" }),
      actor,
    );
    const unlinkToken = resultField(unlinkPrepared, "token");
    if (typeof unlinkToken !== "string")
      throw new Error("Expected unlink token");
    await workspace.actionHandler?.(
      actionRequest(unlink, undefined, {
        mode: "execute",
        token: unlinkToken,
      }),
      actor,
    );
    expect(JSON.stringify(await workspace.dataProvider(actor))).not.toContain(
      "did:web:tess.example",
    );

    const audit = await service.listAuditEvents();
    for (const action of [
      "auth.external_peer.linked",
      "auth.external_peer.invited",
      "auth.external_peer.unlinked",
    ]) {
      expect(audit.find((event) => event.action === action)?.actorUserId).toBe(
        admin.userId,
      );
    }
  });
});
