import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
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
  harness: ReturnType<typeof createPluginHarness>;
} {
  const resolved: string[] = [];
  const source = createRecurringCheckInboxSource({
    listOpenAlerts: async () => alerts,
    resolveOpenAlert: async (itemId) => {
      resolved.push(itemId);
    },
  });
  const harness = createPluginHarness();
  const registry = harness.getMockShell().getInboxRegistry();
  registry.registerSource("recurring-checks", source);
  registry.finalize();
  const installed = registry.getSource(source.sourceId);
  if (!installed) throw new Error("Missing recurring check source");
  return { source: installed, resolved, harness };
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
        actions: [{ id: "resolve", label: "Dismiss", confirm: true }],
      },
    ]);
  });

  it("lets only an Admin resolve an item through the declared action", async () => {
    const { source, resolved, harness } = createFixture();

    const permissionError = await harness
      .withCaller(
        (caller) =>
          source.act(
            openAlert.id,
            "resolve",
            { permissionLevel: "trusted" },
            caller,
          ),
        { permission: "trusted" },
      )
      .catch((error: unknown) => error);
    const actionError = await harness
      .withCaller((caller) =>
        source.act(
          openAlert.id,
          "dismiss",
          { permissionLevel: "admin" },
          caller,
        ),
      )
      .catch((error: unknown) => error);
    expect(permissionError).toEqual(new Error("Admin permission required"));
    expect(actionError).toEqual(
      new Error("Invalid recurring-check inbox action"),
    );
    expect(resolved).toEqual([]);

    await harness.withCaller((caller) =>
      source.act(openAlert.id, "resolve", { permissionLevel: "admin" }, caller),
    );
    expect(resolved).toEqual([openAlert.id]);
  });
});
