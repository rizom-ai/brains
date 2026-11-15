import { requestContract, type MessageBus } from "@brains/messaging-service";
import { notificationsSendContract } from "@brains/contracts";
import type {
  RecurringCheckDelivery,
  RecurringAlert,
} from "@brains/recurring-checks";

export function createRecurringCheckDelivery(
  messageBus: MessageBus,
): RecurringCheckDelivery {
  return {
    deliver: async (alert: RecurringAlert): Promise<boolean> => {
      const result = await requestContract(
        messageBus,
        notificationsSendContract,
        {
          title: alert.title,
          body: alert.body,
          ...(alert.html ? { html: alert.html } : {}),
          // A secret alert stays secret: the transport keeps its recipient
          // and subject out of its logs.
          ...(alert.sensitivity ? { sensitivity: alert.sensitivity } : {}),
        },
        "shell.recurring-checks",
      );
      if (result.status === "unavailable") return false;
      if (result.status === "failed" || result.data.status !== "sent") {
        throw new Error("Recurring alert delivery failed");
      }
      return true;
    },
  };
}
