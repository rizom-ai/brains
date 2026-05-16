import { describe, expect, it } from "bun:test";
import { EMAIL_SEND, type SendEmailPayload } from "@brains/email-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import {
  OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL,
  OperatorNotificationsPlugin,
  type SendTransactionalNotificationResult,
} from "../src";

describe("OperatorNotificationsPlugin", () => {
  it("forwards email notifications to the generic email channel", async () => {
    const harness = createPluginHarness<OperatorNotificationsPlugin>();
    const sent: SendEmailPayload[] = [];

    harness.subscribe<SendEmailPayload, { status: "sent"; id: string }>(
      EMAIL_SEND,
      async (message) => {
        sent.push(message.payload);
        return { success: true, data: { status: "sent", id: "email_123" } };
      },
    );

    await harness.installPlugin(new OperatorNotificationsPlugin());

    const result = await harness.sendMessage<
      unknown,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, {
      contacts: [{ type: "email", address: "user@example.com" }],
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      dedupeKey: "setup:user",
    });

    expect(result).toEqual({ status: "sent", deliveryId: "email_123" });
    expect(sent).toEqual([
      {
        to: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the secret setup link.",
      },
    ]);
  });

  it("dedupes notifications with the same dedupe key", async () => {
    const harness = createPluginHarness<OperatorNotificationsPlugin>();
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

    await harness.installPlugin(new OperatorNotificationsPlugin());

    const payload = {
      contacts: [{ type: "email", address: "user@example.com" }],
      title: "Set up your Rover",
      body: "Open the secret setup link.",
      sensitivity: "secret",
      dedupeKey: "setup:user",
    };

    const first = await harness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);
    const second = await harness.sendMessage<
      typeof payload,
      SendTransactionalNotificationResult
    >(OPERATOR_NOTIFICATIONS_SEND_TRANSACTIONAL, payload);

    expect(first).toEqual({ status: "sent", deliveryId: "email_1" });
    expect(second).toEqual({ status: "duplicate" });
    expect(sent).toHaveLength(1);
  });
});
