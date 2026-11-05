import { describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type {
  BaseEntity,
  ContentVisibility,
  EntityTypeConfig,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const searchReplySchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(z.object({ entity: z.object({ id: z.string() }) })),
    belowThreshold: z
      .object({
        minScore: z.number(),
        weakerMatches: z.number(),
        bestScore: z.number(),
        hint: z.string(),
      })
      .optional(),
  }),
});

function entity(
  id: string,
  visibility: ContentVisibility,
  searchScore: number,
): BaseEntity {
  return {
    id,
    entityType: "note",
    content: `body of ${id}`,
    contentHash: `hash-${id}`,
    visibility,
    metadata: { title: id, searchScore },
    created: "2026-05-01T00:00:00.000Z",
    updated: "2026-05-01T00:00:00.000Z",
  };
}

function context(
  level: NonNullable<ToolContext["userPermissionLevel"]>,
): ToolContext {
  return {
    interfaceType: "test",
    actor: { kind: "user", userId: "test" },
    userPermissionLevel: level,
  };
}

async function search(
  entities: BaseEntity[],
  level: NonNullable<ToolContext["userPermissionLevel"]> = "admin",
): Promise<z.output<typeof searchReplySchema>["data"]> {
  const services = createMockSystemServices();
  services.addEntities(entities);
  const tool: Tool | undefined = createSystemTools(services).find(
    (candidate) => candidate.name === "system_search",
  );
  if (!tool) throw new Error("system_search not found");
  const raw = await tool.handler(
    { query: "what do I write about", scope: { kind: "all" } },
    context(level),
  );
  return searchReplySchema.parse(raw).data;
}

describe("system_search below the score threshold", () => {
  it("says weaker matches exist when none reach the threshold", async () => {
    const data = await search([
      entity("governance-essay", "public", 0.42),
      entity("software-notes", "public", 0.31),
    ]);

    expect(data.results).toEqual([]);
    expect(data.belowThreshold).toMatchObject({
      minScore: 0.5,
      weakerMatches: 2,
      bestScore: 0.42,
    });
    expect(data.belowThreshold?.hint).toContain("minScore");
    expect(data.belowThreshold?.hint).toContain("before concluding");
  });

  it("stays a plain empty result when nothing matches at all", async () => {
    const data = await search([]);

    expect(data).toEqual({ results: [] });
  });

  it("counts only weaker matches the caller may see", async () => {
    const data = await search(
      [
        entity("private-essay", "restricted", 0.45),
        entity("public-note", "public", 0.33),
      ],
      "public",
    );

    expect(data.belowThreshold).toMatchObject({
      weakerMatches: 1,
      bestScore: 0.33,
    });
  });

  it("adds nothing when results reach the threshold", async () => {
    const data = await search([entity("strong", "public", 0.8)]);

    expect(data.results.map((result) => result.entity.id)).toEqual(["strong"]);
    expect(data.belowThreshold).toBeUndefined();
  });
});

describe("system_search on a type the index leaves out", () => {
  function siteInfo(id: string, visibility: ContentVisibility): BaseEntity {
    return {
      ...entity(id, visibility, 0),
      entityType: "site-info",
      content: `---\ntitle: Team Brain\n---\nCapture what the team knows (${id}).`,
      metadata: { title: "Team Brain" },
    };
  }

  async function searchSiteInfo(
    level: NonNullable<ToolContext["userPermissionLevel"]>,
  ): Promise<unknown> {
    const services = createMockSystemServices();
    services.addEntities([
      siteInfo("site-info", "public"),
      siteInfo("private-site-info", "restricted"),
    ]);
    services.entityRegistry.getEntityTypeConfig = (
      type: string,
    ): EntityTypeConfig => (type === "site-info" ? { embeddable: false } : {});
    const tool = createSystemTools(services).find(
      (candidate) => candidate.name === "system_search",
    );
    if (!tool) throw new Error("system_search not found");
    return tool.handler(
      {
        query: "homepage promise",
        scope: { kind: "type", entityType: "site-info" },
      },
      context(level),
    );
  }

  // Search cannot rank a type without embeddings; its entries, read in the
  // same call, save the agent a listing and a read.
  it("returns the type's entries, unranked, instead of a silent empty result", async () => {
    expect(await searchSiteInfo("public")).toEqual({
      success: true,
      data: {
        results: [
          {
            entity: expect.objectContaining({
              id: "site-info",
              entityType: "site-info",
              content:
                "---\ntitle: Team Brain\n---\nCapture what the team knows (site-info).",
            }),
          },
        ],
        notSearchable: {
          entityType: "site-info",
          hint: "site-info is not in the search index, so the results are its entries, unranked.",
        },
      },
    });
  });

  it("returns only the entries the caller may see", async () => {
    const reply = searchReplySchema.parse(await searchSiteInfo("admin"));
    expect(reply.data.results.map((result) => result.entity.id).sort()).toEqual(
      ["private-site-info", "site-info"],
    );
  });
});
