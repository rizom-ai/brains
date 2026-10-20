import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import { buildTopWishesWidgetData } from "../src/index";

// An unscoped read sees public wishes only; the owner's dashboard reads at the
// scope the dashboard derives from its caller.
describe("buildTopWishesWidgetData", () => {
  it("reads wishes at the scope it is given", async () => {
    const requests: Array<{ entityType: string }> = [];
    const context = createMockEntityPluginContext({
      listEntitiesImpl: async (request) => {
        requests.push(request);
        return [];
      },
    });

    expect(await buildTopWishesWidgetData(context, "restricted")).toEqual({
      items: [],
    });
    expect(requests).toEqual([
      expect.objectContaining({
        entityType: "wish",
        options: expect.objectContaining({
          filter: { visibilityScope: "restricted" },
        }),
      }),
    ]);
  });
});
