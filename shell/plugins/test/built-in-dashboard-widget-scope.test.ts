import { describe, expect, it } from "bun:test";
import type { ContentVisibility } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import { createMockEntityPluginContext } from "../src/test/mock-entity-plugin-context";
import { defineDashboardWidget } from "../src/operator/operator-definition-contract";
import { registerBuiltInDashboardWidget } from "../src/operator/dashboard-widget-runtime";

const widget = defineDashboardWidget({
  id: "scoped",
  title: "Scoped",
  group: "knowledge",
  placement: "secondary",
  priority: 10,
  permission: "public",
  data: z.object({ count: z.number() }),
  digest: ({ data }) => ({
    items: [{ label: "Count", value: String(data.count) }],
  }),
  view: ({ data }) => ({
    blocks: [{ type: "stats", items: [{ label: "Count", value: data.count }] }],
  }),
});

// A built-in widget reads entities itself; without the caller's scope an
// unscoped read sees public entities only, so the owner's dashboard would
// show nothing of their restricted memory.
describe("built-in dashboard widget scope", () => {
  it("hands load the visibility scope of the caller", async () => {
    const context = createMockEntityPluginContext();
    // The dashboard counts as available once something answers registrations.
    context.messaging.subscribe(
      DASHBOARD_CHANNELS.registerWidget,
      async () => ({
        success: true,
      }),
    );
    const scopes: ContentVisibility[] = [];
    await registerBuiltInDashboardWidget({
      context,
      definition: widget,
      load: ({ visibilityScope }) => {
        scopes.push(visibilityScope);
        return { count: 0 };
      },
    });
    const [registerCall] = context.dashboard.registerWidget.mock.calls;
    const registered = registerCall?.[0];
    if (!registered) throw new Error("Widget was not registered");

    await registered.dataProvider({
      caller: {
        actor: { id: "owner" },
        permission: "admin",
        isAnchor: true,
      },
      signal: new AbortController().signal,
    });
    await registered.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });

    expect(scopes).toEqual(["restricted", "public"]);
  });
});
