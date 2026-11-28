import { describe, expect, spyOn, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { studioEntryContext } from "../src/entry-context";
import { studioContextOn } from "./studio-plugins";

// Chat beside an open entry reads it through Studio, as the asker may.
const schema = z.object({
  title: z.string(),
  excerpt: z.string().optional(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().datetime().optional(),
});
class Adapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Entry context fixture",
      schema: baseEntitySchema,
      frontmatterSchema: schema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

const post: BaseEntity = {
  id: "commons",
  entityType: "post",
  content:
    "---\ntitle: The Commons\nstatus: draft\n---\nA commons starts here.",
  contentHash: "hash",
  created: "2026-11-01T00:00:00.000Z",
  updated: "2026-11-02T00:00:00.000Z",
  visibility: "shared",
  metadata: { title: "The Commons" },
};

async function context(stored: BaseEntity | null): Promise<{
  studio: Awaited<ReturnType<typeof studioContextOn>>;
  read: ReturnType<typeof spyOn>;
}> {
  const shell = createMockShell();
  shell
    .getEntityRegistry()
    .registerEntityType("post", baseEntitySchema, new Adapter());
  spyOn(
    shell.getEntityRegistry(),
    "getEffectiveFrontmatterSchema",
  ).mockReturnValue(schema);
  const base = await studioContextOn(shell);
  const read = spyOn(base.entityService, "getEntityRaw");
  read.mockResolvedValueOnce(stored);
  return { studio: base, read };
}

describe("an entry as Chat beside it reads it", () => {
  test("carries its title, document and the text fields an answer may fill", async () => {
    const { studio, read } = await context(post);
    const answer = await studioEntryContext(studio, {
      entityType: "post",
      entityId: "commons",
      visibilityScope: "shared",
    });
    expect(read).toHaveBeenCalledWith({
      entityType: "post",
      id: "commons",
      visibilityScope: "shared",
      source: true,
    });
    expect(answer).toEqual({
      title: "The Commons",
      typeLabel: "post",
      markdown: post.content,
      fields: [
        { name: "title", label: "Title" },
        { name: "excerpt", label: "Excerpt" },
        { name: "body", label: "Body" },
      ],
    });
  });

  test("is nothing to an asker who cannot read it, or for an unknown type", async () => {
    const { studio, read } = await context(null);
    expect(
      await studioEntryContext(studio, {
        entityType: "post",
        entityId: "commons",
        visibilityScope: "public",
      }),
    ).toBeNull();
    expect(
      await studioEntryContext(studio, {
        entityType: "secret",
        entityId: "commons",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
    // The type is unknown, so nothing is read for it.
    expect(read).toHaveBeenCalledTimes(1);
  });
});
