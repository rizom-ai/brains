import { describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { SystemServices } from "../../src/system/types";
import {
  DEFAULT_SEARCH_BUDGET,
  LOCAL_MODEL_SEARCH_BUDGET,
  searchBudgetFor,
} from "../../src/system/search-excerpt";

const searchReplySchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(z.object({ excerpt: z.string().optional() })),
  }),
});

const admin: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test" },
  userPermissionLevel: "admin",
};

/** A note whose body is far longer than any excerpt. */
const longNote: BaseEntity = {
  id: "long-note",
  entityType: "note",
  content: Array.from(
    { length: 40 },
    (_, index) => `Paragraph ${index} on new institutions and their networks.`,
  ).join("\n\n"),
  contentHash: "hash-long-note",
  visibility: "public",
  metadata: { title: "Long note" },
  created: "2026-05-01T00:00:00.000Z",
  updated: "2026-05-01T00:00:00.000Z",
};

async function search(
  overrides: Partial<SystemServices>,
  limit?: number,
): Promise<{ limits: Array<number | undefined>; excerpt: string }> {
  const services = createMockSystemServices(overrides);
  services.addEntities([longNote]);
  const limits: Array<number | undefined> = [];
  const searchEntities = services.entityService.search;
  services.entityService.search = (
    request: Parameters<typeof searchEntities>[0],
  ): ReturnType<typeof searchEntities> => {
    limits.push(request.options?.limit);
    return searchEntities(request);
  };
  const tool: Tool | undefined = createSystemTools(services).find(
    (candidate) => candidate.name === "system_search",
  );
  if (!tool) throw new Error("system_search not found");
  const raw = await tool.handler(
    {
      query: "new institutions",
      scope: { kind: "all" },
      ...(limit !== undefined && { limit }),
    },
    admin,
  );
  const { results } = searchReplySchema.parse(raw).data;
  return { limits, excerpt: results[0]?.excerpt ?? "" };
}

describe("the search budget", () => {
  const compact = { limit: 5, maxLimit: 5, excerptChars: 800 };

  it("returns fewer, shorter hits when the budget is compact", async () => {
    const { limits, excerpt } = await search({ searchBudget: compact }, 10);

    expect(limits).toEqual([5]);
    expect(excerpt.length).toBeGreaterThan(0);
    expect(excerpt.length).toBeLessThanOrEqual(compact.excerptChars);
  });

  it("keeps the model's limit and longer excerpts by default", async () => {
    const { limits, excerpt } = await search({}, 10);

    expect(limits).toEqual([10]);
    expect(excerpt.length).toBeGreaterThan(compact.excerptChars);
  });
});

describe("the budget a brain's text model gets", () => {
  it("is compact for a model on the local runtime and the default otherwise", () => {
    expect(searchBudgetFor("local:qwen3:14b")).toBe(LOCAL_MODEL_SEARCH_BUDGET);
    expect(searchBudgetFor("qwen3:14b")).toBe(LOCAL_MODEL_SEARCH_BUDGET);
    expect(searchBudgetFor("gpt-6-luna")).toBe(DEFAULT_SEARCH_BUDGET);
    expect(searchBudgetFor("claude-haiku-4-5")).toBe(DEFAULT_SEARCH_BUDGET);
  });
});
