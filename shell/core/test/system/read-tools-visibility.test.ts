import { beforeEach, describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const makeEntity = (id: string, visibility: ContentVisibility): BaseEntity => ({
  id,
  entityType: "doc",
  content: `body of ${id}`,
  contentHash: `hash-${id}`,
  visibility,
  metadata: { title: id },
  created: "2026-05-01T00:00:00.000Z",
  updated: "2026-05-01T00:00:00.000Z",
});

const baseContext = (
  userPermissionLevel?: ToolContext["userPermissionLevel"],
): ToolContext => ({
  interfaceType: "test",
  userId: "test",
  ...(userPermissionLevel && { userPermissionLevel }),
});

describe("read tools enforce caller visibility scope", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      makeEntity("doc-public", "public"),
      makeEntity("doc-shared", "shared"),
      makeEntity("doc-restricted", "restricted"),
    ]);
    tools = createSystemTools(services);
  });

  const getTool = (name: string): Tool => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`${name} not found`);
    return tool;
  };

  describe("system_search", () => {
    it("limits public callers to public entities", async () => {
      const result = (await getTool("system_search").handler(
        { query: "body" },
        baseContext("public"),
      )) as { success: true; data: { results: { entity: BaseEntity }[] } };

      expect(result.success).toBe(true);
      const ids = result.data.results.map((r) => r.entity.id).sort();
      expect(ids).toEqual(["doc-public"]);
    });

    it("limits trusted callers to public + shared, excluding restricted", async () => {
      const result = (await getTool("system_search").handler(
        { query: "body" },
        baseContext("trusted"),
      )) as { success: true; data: { results: { entity: BaseEntity }[] } };

      const ids = result.data.results.map((r) => r.entity.id).sort();
      expect(ids).toEqual(["doc-public", "doc-shared"]);
    });

    it("returns all visibility levels for anchor callers", async () => {
      const result = (await getTool("system_search").handler(
        { query: "body" },
        baseContext("anchor"),
      )) as { success: true; data: { results: { entity: BaseEntity }[] } };

      const ids = result.data.results.map((r) => r.entity.id).sort();
      expect(ids).toEqual(["doc-public", "doc-restricted", "doc-shared"]);
    });

    it("defaults to public scope when caller permission is missing", async () => {
      const result = (await getTool("system_search").handler(
        { query: "body" },
        baseContext(),
      )) as { success: true; data: { results: { entity: BaseEntity }[] } };

      const ids = result.data.results.map((r) => r.entity.id).sort();
      expect(ids).toEqual(["doc-public"]);
    });
  });

  describe("system_list", () => {
    it("limits public callers to public entities", async () => {
      const result = (await getTool("system_list").handler(
        { entityType: "doc" },
        baseContext("public"),
      )) as { success: true; data: { entities: BaseEntity[] } };

      const ids = result.data.entities.map((e) => e.id).sort();
      expect(ids).toEqual(["doc-public"]);
    });

    it("limits trusted callers to public + shared", async () => {
      const result = (await getTool("system_list").handler(
        { entityType: "doc" },
        baseContext("trusted"),
      )) as { success: true; data: { entities: BaseEntity[] } };

      const ids = result.data.entities.map((e) => e.id).sort();
      expect(ids).toEqual(["doc-public", "doc-shared"]);
    });

    it("returns all visibility levels for anchor callers", async () => {
      const result = (await getTool("system_list").handler(
        { entityType: "doc" },
        baseContext("anchor"),
      )) as { success: true; data: { entities: BaseEntity[] } };

      const ids = result.data.entities.map((e) => e.id).sort();
      expect(ids).toEqual(["doc-public", "doc-restricted", "doc-shared"]);
    });
  });

  describe("system_get", () => {
    it("refuses to return a restricted entity to a public caller", async () => {
      const result = (await getTool("system_get").handler(
        { entityType: "doc", id: "doc-restricted" },
        baseContext("public"),
      )) as { success: false; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found|denied|restricted/i);
    });

    it("refuses to return a restricted entity to a trusted caller", async () => {
      const result = (await getTool("system_get").handler(
        { entityType: "doc", id: "doc-restricted" },
        baseContext("trusted"),
      )) as { success: false; error: string };

      expect(result.success).toBe(false);
    });

    it("returns a shared entity to a trusted caller", async () => {
      const result = (await getTool("system_get").handler(
        { entityType: "doc", id: "doc-shared" },
        baseContext("trusted"),
      )) as { success: true; data: { entity: BaseEntity } };

      expect(result.success).toBe(true);
      expect(result.data.entity.id).toBe("doc-shared");
    });

    it("refuses to return a shared entity to a public caller", async () => {
      const result = (await getTool("system_get").handler(
        { entityType: "doc", id: "doc-shared" },
        baseContext("public"),
      )) as { success: false; error: string };

      expect(result.success).toBe(false);
    });

    it("returns a restricted entity to an anchor caller", async () => {
      const result = (await getTool("system_get").handler(
        { entityType: "doc", id: "doc-restricted" },
        baseContext("anchor"),
      )) as { success: true; data: { entity: BaseEntity } };

      expect(result.success).toBe(true);
      expect(result.data.entity.id).toBe("doc-restricted");
    });
  });
});
