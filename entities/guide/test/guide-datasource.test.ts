import { beforeEach, describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { GuideDataSource, guideWithDataSchema } from "../src";
import { getTemplates } from "../src/lib/register-templates";
import { guideMarkdown } from "./fixtures";

const listSchema = z.object({ guides: z.array(guideWithDataSchema) });
const detailSchema = z.object({
  guide: guideWithDataSchema,
  otherGuides: z.array(guideWithDataSchema),
});

function guide(slug: string, order: number): BaseEntity {
  return {
    id: slug,
    entityType: "guide",
    content: guideMarkdown(slug, order),
    contentHash: `hash-${slug}`,
    created: "2026-10-29T00:00:00.000Z",
    updated: "2026-10-29T00:00:00.000Z",
    visibility: "public",
    metadata: {
      title: `Moving in as ${slug}`,
      slug,
      order,
      persona: `The ${slug}`,
      for: `You are a ${slug}.`,
      recipe: null,
      material: [],
    },
  };
}

describe("GuideDataSource", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  let datasource: GuideDataSource;

  beforeEach(() => {
    shell = createMockShell();
    context = { entityService: shell.getEntityService() };
    datasource = new GuideDataSource(createMockLogger());
    shell.addEntities([
      guide("team", 40),
      guide("writer", 10),
      guide("researcher", 20),
    ]);
  });

  it("is the guides entity data source", () => {
    expect(datasource.id).toBe("guides:entities");
  });

  it("lists the guides in their order", async () => {
    const result = await datasource.fetch(
      { entityType: "guide" },
      listSchema,
      context,
    );

    expect(result.guides.map((item) => item.metadata.slug)).toEqual([
      "writer",
      "researcher",
      "team",
    ]);
  });

  it("returns a guide with its body and the other guides, in order", async () => {
    const result = await datasource.fetch(
      { entityType: "guide", query: { id: "researcher" } },
      detailSchema,
      context,
    );

    expect(result.guide.metadata.title).toBe("Moving in as researcher");
    expect(result.guide.frontmatter.persona).toBe("The researcher");
    expect(result.guide.body).toBe("## Start\n\nText for researcher.");
    expect(result.otherGuides.map((item) => item.metadata.slug)).toEqual([
      "writer",
      "team",
    ]);
  });

  it.each([
    ["guide-list", {}],
    ["guide-detail", { id: "writer" }],
  ])("fits the %s template schema", async (name, query) => {
    const template = getTemplates()[name];
    if (!template) throw new Error(`missing ${name} template`);

    const result = await datasource.fetch(
      { entityType: "guide", query },
      template.schema,
      context,
    );

    expect(result).toBeDefined();
  });
});
