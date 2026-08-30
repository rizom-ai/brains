import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "@brains/plugins";
import { NOTIFICATIONS_SEND, type SendNotificationResult } from "../src";
import { notificationsPlugin } from "./helpers/install";

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

describe("notifications service", () => {
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

    const result = await harness.sendMessage<unknown, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      {
        recipient: { type: "email", address: "user@example.com" },
        title: "Set up your Rover",
        body: "Open the secret setup link.",
        sensitivity: "secret",
        idempotencyKey: "invitation_attempt_1",
      },
    );

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

    const result = await harness.sendMessage<unknown, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      { title: "New sightings", body: "Two agents sighted." },
    );

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

    const first = await harness.sendMessage<
      typeof payload,
      SendNotificationResult
    >(NOTIFICATIONS_SEND, payload);
    const second = await harness.sendMessage<
      typeof payload,
      SendNotificationResult
    >(NOTIFICATIONS_SEND, payload);

    expect(first).toEqual({ status: "sent", deliveryId: "email_1" });
    expect(second).toEqual({ status: "sent", deliveryId: "email_2" });
    expect(sent).toHaveLength(2);
    // Distinct keys, so a provider that dedupes still sends both.
    expect(sent[0]?.idempotencyKey).not.toBe(sent[1]?.idempotencyKey);
  });

  it("reports failure when no transport is registered for the recipient", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(notificationsPlugin());
    await harness.finalizeRegistration();

    const response = await harness.sendMessage<unknown, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      {
        recipient: { type: "email", address: "user@example.com" },
        title: "Set up your Rover",
        body: "Open the secret setup link.",
      },
    );

    expect(response).toBeUndefined();
  });
});

describe("empty recipient env interpolation", () => {
  // Unset SETUP_EMAIL_TO interpolates to an empty address in brain.yaml; the
  // plugin must boot without a default recipient rather than being skipped.
  it("boots with an empty default recipient address", () => {
    expect(() =>
      notificationsPlugin({
        defaultRecipient: { type: "email", address: "" },
      }),
    ).not.toThrow();
  });
});
