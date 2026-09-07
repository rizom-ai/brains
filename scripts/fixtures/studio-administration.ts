import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthServicePlugin,
  AuthRuntimeDatabase,
  AuthUserStore,
} from "@brains/auth-service";
import { createMockShell } from "@brains/test-utils";
import type { StudioWorkspaceActor } from "@brains/plugins";
import {
  captureAdminWorkspaces,
  workspaceByLabel,
  findAction,
  actionRequest,
} from "../../plugins/admin/test/studio-workspace-test-helpers";

/** Real provider compositions over disposable auth data, never the preview's databases. */
export async function createAdministrationFixture(now: number): Promise<{
  read: (query: Record<string, string>) => Promise<unknown>;
  badge: () => Promise<number>;
  dispose: () => Promise<void>;
}> {
  const directory = await mkdtemp(
    join(tmpdir(), "studio-administration-visual-"),
  );
  const shell = createMockShell({ domain: "brain.test" });
  shell.getProfile = (): ReturnType<typeof shell.getProfile> => ({
    name: "Rover collective",
    description: "Visual fixture Anchor",
  });
  shell.getChannelRegistry().registerDescriptor("visual", {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
    manualDelivery: true,
  });
  shell.getChannelRegistry().finalize();
  const auth = new AuthServicePlugin({
    storageDir: directory,
    issuer: "https://brain.test",
  });
  const originalNow = Date.now;
  // The visual runner already freezes browser time. Freeze its disposable service
  // clock too, so invitations do not expire between captures and dates are stable.
  Date.now = (): number => now;
  const dispose = async (): Promise<void> => {
    try {
      await auth.shutdown?.();
    } finally {
      Date.now = originalNow;
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    const seed = new AuthRuntimeDatabase({ storageDir: directory });
    await seed.start();
    try {
      await new AuthUserStore(seed.db).ensureFirstAdminUser({
        displayName: "Rover collective",
      });
    } finally {
      await seed.stop();
    }
    await auth.register(shell);
    const service = auth.getService();
    const anchor = (await service.listAdminUsers()).find(
      (user) => user.isAnchor,
    );
    if (!anchor)
      throw new Error("Fixture did not initialize its protected Anchor");
    const mira = await service.createUser({
      displayName: "Mira Reyes",
      role: "admin",
    });
    const alex = await service.createUser({
      displayName: "Alex Morgan",
      role: "trusted",
    });
    await service.attachIdentity(
      {
        userId: alex.userId,
        type: "email",
        subject: "alex@example.test",
        label: "alex@example.test",
      },
      { actorUserId: mira.userId },
    );
    const actor: StudioWorkspaceActor = {
      interfaceType: "studio",
      userId: mira.userId,
      actor: { kind: "user", userId: mira.userId },
      userPermissionLevel: "admin",
      visibilityScope: "restricted",
      isAnchor: false,
    };
    const workspace = workspaceByLabel(
      await captureAdminWorkspaces(shell),
      "Administration",
    );
    const invitationView = await workspace.dataProvider(actor, {
      tab: "invitations",
    });
    const create = findAction(invitationView, "Add a person");
    await workspace.actionHandler?.(
      actionRequest(create, {
        idempotencyKey: "visual-grace",
        displayName: "Grace Hopper",
        role: "trusted",
        deliveryType: "email",
        deliverySubject: "grace@example.test",
        deliveryLabel: "grace@example.test",
        deliveryMode: "manual",
      }),
      actor,
    );
    await service.recordAuditEvent({
      actorUserId: mira.userId,
      action: "auth.user.role_updated",
      targetType: "user",
      targetId: alex.userId,
    });
    return {
      read: (query) => workspace.dataProvider(actor, query),
      badge: async () => (await workspace.badgeProvider?.(actor)) ?? 0,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
