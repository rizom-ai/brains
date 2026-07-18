import { describe, expect, it } from "bun:test";
import { EMAIL_SEND, type SendEmailPayload } from "@brains/email-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import {
  NOTIFICATIONS_SEND,
  NotificationsPlugin,
  type SendNotificationResult,
} from "../src";

describe("NotificationsPlugin", () => {
  it("routes email notifications to the generic email channel", async () => {
    const harness = createPluginHarness<NotificationsPlugin>();
    const sent: SendEmailPayload[] = [];

    harness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return { success: true, data: { status: "sent", id: "email_123" } };
      },
    );

    await harness.installPlugin(new NotificationsPlugin());

    const result = await harness.sendMessage<unknown, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      {
        recipient: { type: "email", address: "user@example.com" },
        title: "Set up your Rover",
        body: "Open the secret setup link.",
        sensitivity: "secret",
      },
    );

    expect(result).toEqual({ status: "sent", deliveryId: "email_123" });
    expect(sent).toEqual([
      {
        to: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the secret setup link.",
        sensitivity: "secret",
      },
    ]);
  });

  it("uses the configured default recipient when the message omits one", async () => {
    const harness = createPluginHarness<NotificationsPlugin>();
    const sent: SendEmailPayload[] = [];
    harness.subscribe<SendEmailPayload, { status: "sent" }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return { success: true, data: { status: "sent" } };
      },
    );
    await harness.installPlugin(
      new NotificationsPlugin({
        defaultRecipient: { type: "email", address: "operator@example.com" },
      }),
    );

    const result = await harness.sendMessage<unknown, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      { title: "New sightings", body: "Two agents sighted." },
    );

    expect(result).toEqual({ status: "sent" });
    expect(sent[0]?.to).toBe("operator@example.com");
  });

  it("does not dedupe repeated notifications", async () => {
    const harness = createPluginHarness<NotificationsPlugin>();
    const sent: SendEmailPayload[] = [];

    harness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return {
          success: true,
          data: { status: "sent", id: `email_${sent.length}` },
        };
      },
    );

    await harness.installPlugin(new NotificationsPlugin());

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
  });
});
