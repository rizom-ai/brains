import type { MessageBus } from "@brains/messaging-service";
import {
  NOTIFICATIONS_SEND,
  sendNotificationResultSchema,
  type SendNotificationInput,
  type SendNotificationResult,
} from "@brains/notification-contracts";
import type {
  RecurringCheckDelivery,
  RecurringAlert,
} from "@brains/recurring-checks";

export function createRecurringCheckDelivery(
  messageBus: MessageBus,
): RecurringCheckDelivery {
  return {
    deliver: async (alert: RecurringAlert): Promise<boolean> => {
      if (!messageBus.hasHandlers(NOTIFICATIONS_SEND)) return false;
      const response = await messageBus.send<
        SendNotificationInput,
        SendNotificationResult
      >({
        type: NOTIFICATIONS_SEND,
        payload: {
          title: alert.title,
          body: alert.body,
          ...(alert.html ? { html: alert.html } : {}),
        },
        sender: "shell.recurring-checks",
      });
      if (!("success" in response) || !response.success || !response.data) {
        throw new Error("Recurring alert delivery failed");
      }
      const result = sendNotificationResultSchema.safeParse(response.data);
      if (!result.success || result.data.status !== "sent") {
        throw new Error("Recurring alert delivery failed");
      }
      return true;
    },
  };
}
