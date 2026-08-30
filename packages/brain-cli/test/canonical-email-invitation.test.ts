import { afterEach, describe, expect, it, mock } from "bun:test";
import { AuthService } from "@brains/auth-service";
import { emailInterface } from "@brains/email";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("canonical Email invitation delivery", () => {
  it("dispatches an automatic invitation through the Email interface provider", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "resend_invitation_1" }), {
          status: 200,
        }),
    );
    const harness = createPluginHarness();
    // Email declares itself now, so the runtime builds it from the definition
    // rather than the test calling a constructor.
    const metadata = { name: "@brains/email", version: "0.0.0-test" };
    const definition = emailInterface({ fetchImpl });
    bindPluginPackageMetadata(definition, metadata);
    const [emailPlugin] = instantiatePluginPackageDefinition(
      definition,
      {
        transport: "resend",
        apiKey: "resend-key",
        from: "Brain <setup@example.com>",
      },
      metadata,
    );
    if (!emailPlugin) throw new Error("Email interface was not created");
    await harness.installPlugin(emailPlugin);
    await harness.finalizeRegistration();
    const registry = harness.getMockShell().getChannelRegistry();
    const storageDir = await mkdtemp(join(tmpdir(), "canonical-email-invite-"));
    tempDirs.push(storageDir);
    const auth = new AuthService({
      storageDir,
      issuer: "http://localhost:8080",
      getChannelDescriptor: (channelType): ChannelDescriptor | undefined =>
        registry.getDescriptor(channelType),
      listChannelDescriptors: (): ChannelDescriptor[] =>
        registry.listDescriptors(),
      getInvitationDeliveryProvider: (
        channelType,
      ): ChannelDeliveryProvider | undefined =>
        registry.getDeliveryProvider(channelType),
      isChannelTypeRegistered: (channelType): boolean =>
        Boolean(registry.getDescriptor(channelType)),
      autoStartInvitationDeliveryRecovery: false,
    });

    try {
      const admin = await auth.createUser({
        displayName: "Rover Owner",
        role: "admin",
      });
      const created = await auth.createInvitation(
        {
          idempotencyKey: "canonical-email-interface-invitation",
          displayName: "Invited Member",
          role: "trusted",
          delivery: {
            type: "email",
            subject: "member@example.com",
            mode: "automatic",
          },
        },
        { actorUserId: admin.userId },
      );

      expect(created.invitation).toMatchObject({ state: "sent" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const request = fetchImpl.mock.calls[0]?.[1];
      expect(request?.headers).toMatchObject({
        Authorization: "Bearer resend-key",
        "Content-Type": "application/json",
      });
      expect(String(request?.body)).toContain('"to":"member@example.com"');
      expect(String(request?.body)).toContain("/setup?token=setup_");
    } finally {
      await auth.close();
      harness.reset();
    }
  });
});
