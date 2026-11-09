import { describe, expect, it } from "bun:test";
import {
  notificationsSendContract,
  sendNotificationSchema,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "@brains/plugins";
import notificationsPackage from "../src";
import { notificationsPlugin } from "./notifications-plugin";

/**
 * Registers an email transport the way a message interface would, so the
 * plugin resolves it by channel type rather than through a transport-specific
 * message channel.
 */
function installEmailProvider(
  harness: ReturnType<typeof createPluginHarness>,
  send: (input: ChannelDeliveryInput) => Promise<ChannelDeliveryResult>,
): ChannelDeliveryInput[] {
  const sent: ChannelDeliveryInput[] = [];
  const registry = harness.getMockShell().getChannelRegistry();
  // The registry rejects a provider with no descriptor, so register the pair
  // exactly as a message interface does.
  registry.registerDescriptor("email-transport", {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
  });
  registry.registerDeliveryProvider("email-transport", {
    channelType: "email",
    isAvailable: async () => true,
    send: async (input) => {
      sent.push(input);
      return send(input);
    },
  });
  return sent;
}

describe("notifications", () => {
  it("default-exports its service package definition", () => {
    expect(notificationsPackage).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "notifications",
    });
  });

  it("registers under the plugin id its class had, with no tools or resources", async () => {
    const harness = createPluginHarness();
    const plugin = notificationsPlugin();
    const capabilities = await harness.installPlugin(plugin);

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "notifications",
      "service",
      "@brains/notifications",
    ]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
  });

  it("stays channel-agnostic and registers no channel metadata", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    expect(
      harness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([]);
    expect(
      harness.getMockShell().getChannelRegistry().getDeliveryProvider("email"),
    ).toBeUndefined();
  });

  it("delivers through the transport registered for the recipient's channel", async () => {
    const harness = createPluginHarness();
    const sent = installEmailProvider(harness, async () => ({
      status: "sent",
      providerDeliveryId: "email_123",
    }));

    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    const result = await harness.sendMessage(notificationsSendContract.name, {
      recipient: { type: "email", address: "user@example.com" },
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      idempotencyKey: "invitation_attempt_1",
    });

    expect(result).toEqual({ status: "sent", deliveryId: "email_123" });
    expect(sent).toEqual([
      {
        recipient: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the secret setup link.",
        sensitivity: "secret",
        idempotencyKey: "invitation_attempt_1",
      },
    ]);
  });

  it("passes where an answer goes to the transport", async () => {
    const harness = createPluginHarness();
    const sent = installEmailProvider(harness, async () => ({
      status: "sent",
    }));
    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    expect(
      await harness.sendMessage(notificationsSendContract.name, {
        recipient: { type: "email", address: "owner@example.com" },
        title: "New contact request",
        body: "Name: Ada",
        sensitivity: "secret",
        idempotencyKey: "contact-notification:1",
        replyTo: "ada@example.com",
      }),
    ).toEqual({ status: "sent" });
    expect(sent[0]?.replyTo).toBe("ada@example.com");
    expect(
      sendNotificationSchema.safeParse({
        title: "x",
        body: "y",
        replyTo: "ada@example.com\r\nBcc: other@example.com",
      }).success,
    ).toBe(false);
  });

  it("keeps internal delivery available to execution-only workers", async () => {
    const harness = createPluginHarness();
    const sent = installEmailProvider(harness, async () => ({
      status: "sent",
    }));
    await notificationsPlugin({
      defaultRecipient: { type: "email", address: "operator@example.com" },
    }).register(harness.getMockShell(), { executionOnly: true });
    harness.getMockShell().getChannelRegistry().finalize();
    const result = await harness.sendMessage(notificationsSendContract.name, {
      title: "Contact request",
      body: "Open the authenticated Inbox.",
      sensitivity: "secret",
      idempotencyKey: "contact-notification:test",
    });
    expect(result).toEqual({ status: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.idempotencyKey).toBe("contact-notification:test");
  });

  it("uses the configured default recipient when the message omits one", async () => {
    const harness = createPluginHarness();
    const sent = installEmailProvider(harness, async () => ({
      status: "sent",
    }));

    await harness.installPlugin(
      notificationsPlugin({
        defaultRecipient: { type: "email", address: "operator@example.com" },
      }),
    );
    await harness.finalizeRegistration();

    const result = await harness.sendMessage(notificationsSendContract.name, {
      title: "New sightings",
      body: "Two agents sighted.",
    });

    expect(result).toEqual({ status: "sent" });
    expect(sent[0]?.recipient).toBe("operator@example.com");
  });

  it("gives each notification its own idempotency key when none is supplied", async () => {
    const harness = createPluginHarness();
    let delivery = 0;
    const sent = installEmailProvider(harness, async () => {
      delivery += 1;
      return { status: "sent", providerDeliveryId: `email_${delivery}` };
    });

    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    const payload = {
      recipient: { type: "email", address: "user@example.com" },
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
    };

    const first = await harness.sendMessage(
      notificationsSendContract.name,
      payload,
    );
    const second = await harness.sendMessage(
      notificationsSendContract.name,
      payload,
    );

    expect(first).toEqual({ status: "sent", deliveryId: "email_1" });
    expect(second).toEqual({ status: "sent", deliveryId: "email_2" });
    expect(sent).toHaveLength(2);
    // Distinct keys, so a provider that dedupes still sends both.
    expect(sent[0]?.idempotencyKey).not.toBe(sent[1]?.idempotencyKey);
  });

  it("answers a failed delivery with its transport's code, never the message", async () => {
    const harness = createPluginHarness();
    installEmailProvider(harness, async () => ({
      status: "failed",
      failureCode: "resend_validation_error",
    }));
    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: notificationsSendContract.name,
        payload: {
          recipient: { type: "email", address: "user@example.com" },
          title: "New contact request",
          body: "A contact request is saved.",
          sensitivity: "secret",
        },
        sender: "contact",
      });

    expect(response).toEqual({
      success: true,
      data: {
        status: "failed",
        failure: "delivery-failed",
        transportCode: "resend_validation_error",
      },
    });
  });

  it("answers that no transport is available for the recipient", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: notificationsSendContract.name,
        payload: {
          recipient: { type: "email", address: "user@example.com" },
          title: "Set up your Rover",
          body: "Open the secret setup link.",
        },
        sender: "contact",
      });

    expect(response).toEqual({
      success: true,
      data: { status: "failed", failure: "transport-missing" },
    });
  });
});

describe("unset recipient env interpolation", () => {
  // An unset SETUP_EMAIL_TO drops `address` from brain.yaml during env
  // interpolation, while deploy tooling may pass it as an empty string. Either
  // way the plugin boots with no default recipient.
  for (const [label, defaultRecipient] of [
    ["an empty address", { type: "email", address: "" }],
    ["no address", { type: "email" }],
  ] as const) {
    it(`boots without a default recipient given ${label}`, async () => {
      const harness = createPluginHarness();
      const sent = installEmailProvider(harness, async () => ({
        status: "sent",
      }));
      await harness.installPlugin(notificationsPlugin({ defaultRecipient }));
      await harness.finalizeRegistration();

      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: notificationsSendContract.name,
          payload: { title: "Contact request", body: "Open the Inbox." },
          sender: "contact",
        });

      expect(response).toEqual({
        success: true,
        data: { status: "failed", failure: "recipient-missing" },
      });
      expect(sent).toEqual([]);
    });
  }
});
