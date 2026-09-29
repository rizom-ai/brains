import { describe, expect, it } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import { z } from "@brains/utils/zod";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { defineEntity } from "../src/public/entity-definition";

const definition = defineEntity({
  type: "visible-record",
  purpose: "Scoped reads",
  metadata: z.object({ title: z.string() }),
});
const scopes = ["public", "shared", "restricted"] as const;

describe("caller-bound entity reads", () => {
  for (const [capIndex, cap] of scopes.entries()) {
    for (const [requestedIndex, requested] of scopes.entries()) {
      it(`${cap} caps ${requested} across every read and preserves narrower requests`, async () => {
        const service = createMockEntityService();
        const reader = createJobEntityAccess(service, new Set(), "reader", cap);
        const expected = scopes[Math.min(capIndex, requestedIndex)];
        await reader.getEntity({
          entityType: definition.type,
          id: "one",
          visibilityScope: requested,
        });
        expect(service.getEntity).toHaveBeenLastCalledWith({
          entityType: definition.type,
          id: "one",
          visibilityScope: expected,
        });
        await reader.get(definition, "one");
        expect(service.getEntity).toHaveBeenLastCalledWith({
          entityType: definition.type,
          id: "one",
          visibilityScope: cap,
        });
        const options = {
          limit: 3,
          offset: 1,
          filter: { metadata: { title: "Title" }, visibilityScope: requested },
        };
        await reader.listEntities({ entityType: definition.type, options });
        expect(service.listEntities).toHaveBeenLastCalledWith({
          entityType: definition.type,
          options: {
            ...options,
            filter: { ...options.filter, visibilityScope: expected },
          },
        });
        await reader.count({
          entityType: definition.type,
          options: { filter: options.filter },
        });
        expect(service.countEntities).toHaveBeenLastCalledWith({
          entityType: definition.type,
          options: { filter: { ...options.filter, visibilityScope: expected } },
        });
        const searchOptions = {
          limit: 3,
          types: [definition.type],
          visibilityScope: requested,
        };
        await reader.search({ query: "needle", options: searchOptions });
        expect(service.search).toHaveBeenLastCalledWith({
          query: "needle",
          options: { ...searchOptions, visibilityScope: expected },
        });
        await reader.getEntityCounts(requested);
        expect(service.getEntityCounts).toHaveBeenLastCalledWith(expected);
        await reader.queryEntityHierarchy({
          entityType: definition.type,
          visibilityScope: requested,
        });
        expect(service.queryEntityHierarchy).toHaveBeenLastCalledWith({
          entityType: definition.type,
          visibilityScope: expected,
        });
        await reader.find(definition.type, "missing");
        expect(service.getEntity).toHaveBeenLastCalledWith({
          entityType: definition.type,
          id: "missing",
          visibilityScope: cap,
        });
        expect(service.listEntities).toHaveBeenLastCalledWith({
          entityType: definition.type,
          options: { limit: 200, filter: { visibilityScope: cap } },
        });
        expect(options.filter.visibilityScope).toBe(requested);
        expect(searchOptions.visibilityScope).toBe(requested);
      });
    }
    it(`${cap} is the default for bound reads`, async () => {
      const service = createMockEntityService();
      const reader = createJobEntityAccess(service, new Set(), "reader", cap);
      await reader.getEntity({ entityType: definition.type, id: "one" });
      expect(service.getEntity).toHaveBeenLastCalledWith({
        entityType: definition.type,
        id: "one",
        visibilityScope: cap,
      });
      await reader.listEntities({ entityType: definition.type });
      expect(service.listEntities).toHaveBeenLastCalledWith({
        entityType: definition.type,
        options: { filter: { visibilityScope: cap } },
      });
      await reader.search({ query: "needle" });
      expect(service.search).toHaveBeenLastCalledWith({
        query: "needle",
        options: { visibilityScope: cap },
      });
      await reader.getEntityCounts();
      expect(service.getEntityCounts).toHaveBeenLastCalledWith(cap);
    });
  }
  it("keeps brain-owned jobs unbound and preserves write ownership", async () => {
    const service = createMockEntityService();
    const reader = createJobEntityAccess(service, new Set(), "reader");
    await reader.get(definition, "one");
    expect(service.getEntity).toHaveBeenLastCalledWith({
      entityType: definition.type,
      id: "one",
      visibilityScope: "restricted",
    });
    await reader.search({
      query: "needle",
      options: { visibilityScope: "restricted" },
    });
    expect(service.search).toHaveBeenLastCalledWith({
      query: "needle",
      options: { visibilityScope: "restricted" },
    });
    await reader.getEntityCounts("restricted");
    expect(service.getEntityCounts).toHaveBeenLastCalledWith("restricted");
    expect(() =>
      reader.create({
        entityType: definition.type,
        content: "Not owned",
        metadata: {},
      }),
    ).toThrow("may only write");
    expect(service.createEntity).not.toHaveBeenCalled();
  });
});
