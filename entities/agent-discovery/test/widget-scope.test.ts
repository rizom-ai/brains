import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { buildAgentNetworkWidgetData } from "../src/lib/agent-network-widget";
import { buildSkillsWidgetData } from "../src/lib/skill-dashboard";

// An unscoped read sees public entities only, and skills inherit their
// topics' visibility: the owner's dashboard reads at the caller's scope.
describe("agent discovery widgets read at the caller's scope", () => {
  function recordingContext(): {
    context: ReturnType<typeof createMockEntityPluginContext>;
    requests: Array<{ entityType: string }>;
  } {
    const requests: Array<{ entityType: string }> = [];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async (request) => {
        requests.push(request);
        return [];
      },
    });
    return { context, requests };
  }

  const scoped = expect.objectContaining({
    options: expect.objectContaining({
      filter: { visibilityScope: "restricted" },
    }),
  });

  it("agent network", async () => {
    const { context, requests } = recordingContext();
    await buildAgentNetworkWidgetData(context, "restricted");
    expect(requests).toEqual([scoped, scoped]);
  });

  it("skills", async () => {
    const { context, requests } = recordingContext();
    await buildSkillsWidgetData(context, "restricted");
    expect(requests).toEqual([scoped]);
  });
});
