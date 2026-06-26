import { beforeEach, describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { toolResponseSchema } from "@brains/mcp-service";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const baseEntityResponseSchema = z.looseObject({
  id: z.string(),
  entityType: z.string(),
});

const searchDataSchema = z.object({
  results: z.array(
    z.object({
      entity: baseEntityResponseSchema,
    }),
  ),
});

const listDataSchema = z.object({
  entities: z.array(baseEntityResponseSchema),
});

const getDataSchema = z.object({
  entity: baseEntityResponseSchema,
});

interface Parser<T> {
  parse(input: unknown): T;
}

function expectSuccess<T>(raw: unknown, schema: Parser<T>): T {
  const response = toolResponseSchema.parse(raw);
  if (!("success" in response) || !response.success) {
    throw new Error(
      `Expected success response, got: ${JSON.stringify(response)}`,
    );
  }
  return schema.parse(response.data);
}

function expectError(raw: unknown): string {
  const response = toolResponseSchema.parse(raw);
  if (!("success" in response) || response.success) {
    throw new Error(
      `Expected error response, got: ${JSON.stringify(response)}`,
    );
  }
  return response.error;
}

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

  async function runSearch(
    scope: ToolContext["userPermissionLevel"],
  ): Promise<string[]> {
    const raw = await getTool("system_search").handler(
      { query: "body" },
      baseContext(scope),
    );
    const data = expectSuccess(raw, searchDataSchema);
    return data.results.map((r) => r.entity.id).sort();
  }

  async function runList(
    scope: ToolContext["userPermissionLevel"],
    status?: string,
  ): Promise<string[]> {
    const raw = await getTool("system_list").handler(
      { entityType: "doc", ...(status ? { status } : {}) },
      baseContext(scope),
    );
    const data = expectSuccess(raw, listDataSchema);
    return data.entities.map((e) => e.id).sort();
  }

  async function runGet(
    id: string,
    scope: ToolContext["userPermissionLevel"],
  ): Promise<unknown> {
    return getTool("system_get").handler(
      { entityType: "doc", id },
      baseContext(scope),
    );
  }

  describe("system_search", () => {
    it("limits public callers to public entities", async () => {
      expect(await runSearch("public")).toEqual(["doc-public"]);
    });

    it("limits trusted callers to public + shared, excluding restricted", async () => {
      expect(await runSearch("trusted")).toEqual(["doc-public", "doc-shared"]);
    });

    it("returns all visibility levels for anchor callers", async () => {
      expect(await runSearch("anchor")).toEqual([
        "doc-public",
        "doc-restricted",
        "doc-shared",
      ]);
    });

    it("defaults to public scope when caller permission is missing", async () => {
      expect(await runSearch(undefined)).toEqual(["doc-public"]);
    });
  });

  describe("system_list", () => {
    it("limits public callers to public entities", async () => {
      expect(await runList("public")).toEqual(["doc-public"]);
    });

    it("limits trusted callers to public + shared", async () => {
      expect(await runList("trusted")).toEqual(["doc-public", "doc-shared"]);
    });

    it("returns all visibility levels for anchor callers", async () => {
      expect(await runList("anchor")).toEqual([
        "doc-public",
        "doc-restricted",
        "doc-shared",
      ]);
    });

    it("treats status any as no status filter", async () => {
      expect(await runList("anchor", "any")).toEqual([
        "doc-public",
        "doc-restricted",
        "doc-shared",
      ]);
    });
  });

  describe("system_get", () => {
    it("refuses to return a restricted entity to a public caller", async () => {
      const error = expectError(await runGet("doc-restricted", "public"));
      expect(error).toMatch(/not found|denied|restricted/i);
    });

    it("refuses to return a restricted entity to a trusted caller", async () => {
      expectError(await runGet("doc-restricted", "trusted"));
    });

    it("returns a shared entity to a trusted caller", async () => {
      const data = expectSuccess(
        await runGet("doc-shared", "trusted"),
        getDataSchema,
      );
      expect(data.entity.id).toBe("doc-shared");
    });

    it("refuses to return a shared entity to a public caller", async () => {
      expectError(await runGet("doc-shared", "public"));
    });

    it("returns a restricted entity to an anchor caller", async () => {
      const data = expectSuccess(
        await runGet("doc-restricted", "anchor"),
        getDataSchema,
      );
      expect(data.entity.id).toBe("doc-restricted");
    });
  });
});
