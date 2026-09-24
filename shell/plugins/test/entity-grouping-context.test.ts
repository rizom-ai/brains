import { describe, expect, spyOn, test } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";

describe("groupings through the plugin context", () => {
  test("forwards registration and descriptors to the entity registry", () => {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    const grouping = {
      key: "clients",
      label: "Clients",
      field: "clients",
      types: ["note", "post"],
    };
    const register = spyOn(registry, "registerGrouping").mockImplementation(
      () => {},
    );
    spyOn(registry, "getGroupings").mockReturnValue([grouping]);
    const context = createServicePluginContext(shell, "studio");
    context.entities.registerGrouping(grouping);
    expect(register).toHaveBeenCalledWith(grouping);
    expect(context.entities.getGroupings()).toEqual([grouping]);
  });
  test("forwards both paginated reads without changing type admission or cancellation", async () => {
    const entityService = createMockEntityService({
      returns: {
        queryGroupingCatalog: {
          values: [{ value: "Acme", count: 3 }],
          total: 1,
        },
        queryGroupingMembers: { entities: [], total: 3 },
      },
    });
    const context = createServicePluginContext(
      createMockShell({ entityService }),
      "studio",
    );
    const request = {
      grouping: "clients",
      entityTypes: ["note"],
      visibilityScope: "shared",
      offset: 20,
      limit: 10,
      signal: new AbortController().signal,
    } as const;
    const catalog = await context.entityService.queryGroupingCatalog({
      ...request,
      entityTypes: [...request.entityTypes],
    });
    expect(entityService.queryGroupingCatalog).toHaveBeenCalledWith(request);
    expect(catalog).toEqual({
      values: [{ value: "Acme", count: 3 }],
      total: 1,
    });
    const members = await context.entityService.queryGroupingMembers({
      ...request,
      entityTypes: [...request.entityTypes],
      value: "Acme",
    });
    expect(entityService.queryGroupingMembers).toHaveBeenCalledWith({
      ...request,
      value: "Acme",
    });
    expect(members.total).toBe(3);
  });
});
