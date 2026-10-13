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
  test("forwards complete replacements, including removal, without swallowing validation errors", () => {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    const context = createServicePluginContext(shell, "studio");
    const groupings = [
      { key: "areas", label: "Areas", field: "areas", types: ["note"] },
    ];
    const replace = spyOn(registry, "replaceGroupings").mockImplementation(
      () => {},
    );
    context.entities.replaceGroupings(groupings);
    context.entities.replaceGroupings([]);
    expect(replace).toHaveBeenNthCalledWith(1, groupings, undefined);
    expect(replace).toHaveBeenNthCalledWith(2, [], undefined);
    context.entities.replaceGroupings(groupings, { reprojectExisting: true });
    expect(replace).toHaveBeenNthCalledWith(3, groupings, {
      reprojectExisting: true,
    });
    replace.mockImplementation(() => {
      throw new Error("Invalid grouping");
    });
    expect(() => context.entities.replaceGroupings(groupings)).toThrow(
      "Invalid grouping",
    );
  });
  test("forwards source registration and refresh, including errors", async () => {
    const shell = createMockShell();
    const registry = shell.getEntityRegistry();
    const context = createServicePluginContext(shell, "studio");
    const register = spyOn(
      registry,
      "registerGroupingSource",
    ).mockImplementation(() => {});
    const refresh = spyOn(registry, "ensureGroupingsCurrent").mockResolvedValue(
      undefined,
    );
    const source = {
      entityType: "definitions",
      ensureCurrent: async (): Promise<void> => {},
    };
    context.entities.registerGroupingSource(source);
    await context.entities.ensureGroupingsCurrent();
    expect(register).toHaveBeenCalledWith(source);
    expect(refresh).toHaveBeenCalledTimes(1);
    refresh.mockRejectedValue(new Error("Read unavailable"));
    expect(
      await context.entities
        .ensureGroupingsCurrent()
        .catch((error: unknown) => error),
    ).toMatchObject({ message: "Read unavailable" });
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
