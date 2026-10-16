import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import { WhitepaperDataSource } from "../src/datasources/whitepaper-datasource";
import { createNewInstitutionsWhitepaper } from "./fixtures/whitepaper-entities";
import {
  enrichedWhitepaperSchema,
  templateWhitepaperSchema,
} from "../src/schemas/whitepaper";

const listSchema = z.object({
  whitepapers: z.array(enrichedWhitepaperSchema),
  pagination: z.unknown().nullable(),
  baseUrl: z.string().optional(),
});

const detailSchema = z.object({
  whitepaper: templateWhitepaperSchema,
  prevWhitepaper: templateWhitepaperSchema.nullable(),
  nextWhitepaper: templateWhitepaperSchema.nullable(),
});

describe("WhitepaperDataSource", () => {
  it("returns whitepapers for list pages", async () => {
    const datasource = new WhitepaperDataSource(
      createSilentLogger("whitepaper-datasource-test"),
    );

    const result = await datasource.fetch({}, listSchema, {
      entityService: {
        listEntities: async () => [createNewInstitutionsWhitepaper()],
        countEntities: async () => 1,
      },
    } as never);

    expect(result.whitepapers).toHaveLength(1);
    expect(result.whitepapers[0]?.frontmatter.title).toContain(
      "New Institutions",
    );
    expect(result.whitepapers[0]?.body).toContain("## Executive Summary");
  });

  it("returns a whitepaper detail page by slug", async () => {
    const datasource = new WhitepaperDataSource(
      createSilentLogger("whitepaper-datasource-test"),
    );

    const result = await datasource.fetch(
      { query: { id: "new-institutions" } },
      detailSchema,
      {
        entityService: {
          listEntities: async () => [createNewInstitutionsWhitepaper()],
          countEntities: async () => 1,
        },
      } as never,
    );

    expect(result.whitepaper.metadata.slug).toBe("new-institutions");
    expect(result.prevWhitepaper).toBeNull();
    expect(result.nextWhitepaper).toBeNull();
  });
});
