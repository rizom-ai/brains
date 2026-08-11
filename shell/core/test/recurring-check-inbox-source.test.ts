import { describe, expect, it } from "bun:test";
import type { RecurringCheckOpenAlert } from "@brains/recurring-checks";
import { createRecurringCheckInboxSource } from "../src/initialization/recurring-check-inbox-source";

const openAlert: RecurringCheckOpenAlert = {
  id: "alert:check-hash:episode-hash",
  checkId: "monitoring:health-check",
  title: "Database health check failed",
  body: "The primary database did not answer the health check.",
  observedAt: "2026-08-11T06:00:00.000Z",
};

function createFixture(alerts: RecurringCheckOpenAlert[] = [openAlert]): {
  source: ReturnType<typeof createRecurringCheckInboxSource>;
  resolved: string[];
} {
  const resolved: string[] = [];
  const source = createRecurringCheckInboxSource({
    listOpenAlerts: async () => alerts,
    resolveOpenAlert: async (itemId) => {
      resolved.push(itemId);
    },
  });
  return { source, resolved };
}

describe("recurring-check Inbox source", () => {
  it("maps open failures to one high-urgency resolution item", async () => {
    const { source } = createFixture();

    expect(source.sourceId).toBe("recurring-checks");
    expect(source.displayName).toBe("Recurring checks");
    expect(await source.list()).toEqual([
      {
        id: openAlert.id,
        title: openAlert.title,
        summary: openAlert.body,
        receivedAt: openAlert.observedAt,
        urgency: "high",
        actions: [{ id: "resolve", label: "Resolve", confirm: true }],
      },
    ]);
  });

  it("lets only an Admin resolve an item through the declared action", async () => {
    const { source, resolved } = createFixture();

    const permissionError = await source
      .act(openAlert.id, "resolve", { permissionLevel: "trusted" })
      .catch((error: unknown) => error);
    const actionError = await source
      .act(openAlert.id, "dismiss", { permissionLevel: "admin" })
      .catch((error: unknown) => error);
    expect(permissionError).toEqual(new Error("Admin permission required"));
    expect(actionError).toEqual(
      new Error("Invalid recurring-check inbox action"),
    );
    expect(resolved).toEqual([]);

    await source.act(openAlert.id, "resolve", { permissionLevel: "admin" });
    expect(resolved).toEqual([openAlert.id]);
  });
});
