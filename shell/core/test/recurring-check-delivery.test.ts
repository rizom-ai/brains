import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { MessageBus } from "@brains/messaging-service";
import {
  NOTIFICATIONS_SEND,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/contracts";
import { createRecurringCheckDelivery } from "../src/initialization/recurring-check-delivery";

// The shared factory rather than a two-method stand-in: it implements the
// whole Logger and stays in step with it.
const logger = createSilentLogger();

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
