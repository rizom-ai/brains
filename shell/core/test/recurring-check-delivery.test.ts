import { describe, expect, it } from "bun:test";
import { MessageBus } from "@brains/messaging-service";
import {
  NOTIFICATIONS_SEND,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/notification-contracts";
import type { Logger } from "@brains/utils/logger";
import { createRecurringCheckDelivery } from "../src/initialization/recurring-check-delivery";

const logger = {
  child: (): Logger => logger,
  debug: (): void => {},
} as unknown as Logger;

const alert = {
  dedupeKey: "database-down",
  title: "Database health check failed",
  body: "The primary database did not answer the health check.",
};

describe("recurring-check notification delivery", () => {
  it("reports an unavailable channel without failing the check", async () => {
    const delivery = createRecurringCheckDelivery(
      MessageBus.createFresh(logger),
    );

    expect(await delivery.deliver(alert)).toBe(false);
  });

  it("preserves the existing notification payload when a channel is present", async () => {
    const messageBus = MessageBus.createFresh(logger);
    let payload: SendNotificationInput | undefined;
    messageBus.subscribe<SendNotificationInput, SendNotificationResult>(
      NOTIFICATIONS_SEND,
      (message) => {
        payload = message.payload;
        return { success: true, data: { status: "sent" } };
      },
    );
    const delivery = createRecurringCheckDelivery(messageBus);

    expect(await delivery.deliver(alert)).toBe(true);
    expect(payload).toEqual({
      title: alert.title,
      body: alert.body,
    });
  });
});
