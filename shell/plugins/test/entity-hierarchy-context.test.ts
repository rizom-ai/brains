import { describe, expect, spyOn, test } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";

describe("Studio's existing entity-service client surface", () => {
  test("requires an injected query implementation rather than fabricating an empty hierarchy", async () => {
    const context = createServicePluginContext(createMockShell(), "studio");
    const outcome = await context.entityService
      .queryEntityHierarchy({
        entityType: "book-section",
      })
      .catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toMatchObject({
      message: expect.stringContaining(
        "inject an entity service for hierarchy queries",
      ),
    });
  });
  test("forwards structured hierarchy requests and returns folder projections unchanged", async () => {
    const entityService = createMockEntityService({
      returns: {
        queryEntityHierarchy: {
          prefix: ["book-1"],
          folders: [
            { path: ["book-1", "part-1"], name: "part-1", descendantCount: 3 },
          ],
          entities: [],
          offset: 20,
          totalEntities: 0,
        },
      },
    });
    const query = spyOn(entityService, "queryEntityHierarchy");
    const context = createServicePluginContext(
      createMockShell({ entityService }),
      "studio",
    );
    const request = {
      entityType: "book-section",
      prefix: ["book-1"],
      visibilityScope: "shared",
      offset: 20,
      limit: 10,
    } as const;
    const page = await context.entityService.queryEntityHierarchy(request);
    expect(query).toHaveBeenCalledWith(request);
    expect(page.prefix).toEqual(["book-1"]);
    expect(page.folders).toEqual([
      { path: ["book-1", "part-1"], name: "part-1", descendantCount: 3 },
    ]);
    expect(page.offset).toBe(20);
  });
});
