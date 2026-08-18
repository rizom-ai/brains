import type { InboxSource } from "@brains/plugins";
import type { RecurringCheckService } from "@brains/recurring-checks";

const RECURRING_CHECKS_SOURCE_ID = "recurring-checks";
const RESOLVE_ACTION_ID = "resolve";

export function createRecurringCheckInboxSource(
  service: Pick<RecurringCheckService, "listOpenAlerts" | "resolveOpenAlert">,
): InboxSource {
  return {
    sourceId: RECURRING_CHECKS_SOURCE_ID,
    displayName: "Recurring checks",
    list: async () =>
      (await service.listOpenAlerts()).map((alert) => ({
        id: alert.id,
        title: truncate(alert.title, 160),
        summary: truncate(alert.body, 1_000),
        receivedAt: alert.observedAt,
        urgency: "high" as const,
        actions: [
          {
            id: RESOLVE_ACTION_ID,
            label: "Dismiss",
            confirm: true,
          },
        ],
      })),
    act: async (itemId, actionId, actor): Promise<void> => {
      if (actor.permissionLevel !== "admin") {
        throw new Error("Admin permission required");
      }
      if (actionId !== RESOLVE_ACTION_ID) {
        throw new Error("Invalid recurring-check inbox action");
      }
      await service.resolveOpenAlert(itemId);
    },
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
