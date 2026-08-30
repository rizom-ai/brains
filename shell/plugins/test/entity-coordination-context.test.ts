import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "../src/service/context";
import { createMockEntityService, createMockShell } from "@brains/test-utils";

describe("service plugin context entity coordination", () => {
  it("binds the coordination capability to the plugin id as source", async () => {
    const entityService = createMockEntityService();
    const prepare = mock(async () => {});
    entityService.prepareDurableBulkMutation = prepare;
    const shell = createMockShell({ entityService });
    const context = createServicePluginContext(shell, "directory-sync");

    const batch = await context.entityCoordination.beginDurableBulkMutation({
      rootJobId: "root-1",
      expectedChildren: 2,
    });

    expect(prepare).toHaveBeenCalledWith({
      source: "directory-sync",
      operationId: "root-1",
      rootJobId: "root-1",
      expectedChildren: 2,
    });
    expect(batch.childRef("0:import")).toEqual({
      rootJobId: "root-1",
      childKey: "0:import",
      expectedChildren: 2,
    });
  });
});
