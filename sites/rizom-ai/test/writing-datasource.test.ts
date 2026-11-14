import { describe, expect, test } from "bun:test";
import type { DataSource } from "@brains/entity-service";
import type { PluginTestHarness } from "@brains/plugins/test";
import { writingSchema } from "../src/writing";
import { installedSite, siteSource } from "./installed-site";

/** The archive, read as a production build reads it. */
async function writing(
  harness: PluginTestHarness,
): Promise<ReturnType<typeof writingSchema.parse>> {
  const data = await siteSource(harness, "rizom:writing").fetch?.(
    {},
    writingSchema,
    {
      publishedOnly: true,
      entityService: harness.getEntityService(),
    },
  );
  if (!data) throw new Error("The source answered nothing");
  return data;
}
const entity = (
  entityType: string,
  slug: string,
  extra: Record<string, unknown>,
): Record<string, unknown> => ({
  id: slug,
  entityType,
  content: "body",
  created: "2026-01-01T00:00:00.000Z",
  metadata: { title: slug, slug },
  ...extra,
});

/** A list datasource that records the query it was asked. */
function listSource(
  id: string,
  publicId: string,
  key: string,
  items: unknown[],
  asked: unknown[],
): DataSource & { publicId: string } {
  return {
    id,
    publicId,
    name: id,
    description: id,
    async fetch<T>(
      query: unknown,
      schema: { parse(value: unknown): T },
    ): Promise<T> {
      asked.push(query);
      return schema.parse({ [key]: items, pagination: null });
    },
  };
}

describe("the Writing archive's data", () => {
  test("reads the essays and the presentations through their own datasources", async () => {
    const asked: unknown[] = [];
    const data = await writing(
      installedSite([
        listSource(
          "blog:entities",
          "@brains/blog:entities",
          "posts",
          [entity("post", "play", { frontmatter: { excerpt: "Play." } })],
          asked,
        ),
        listSource(
          "decks:entities",
          "@brains/decks:entities",
          "decks",
          [entity("deck", "core", { frontmatter: { title: "Core" } })],
          asked,
        ),
      ]),
    );
    expect(asked).toEqual([
      { entityType: "post", query: { limit: 100 } },
      { entityType: "deck", query: { limit: 100 } },
    ]);
    expect(data.posts.map((post) => post.id)).toEqual(["play"]);
    expect(data.decks.map((deck) => deck.id)).toEqual(["core"]);
    // The entity fields survive, so the site builder can link each piece.
    expect(data.decks[0]).toMatchObject({
      entityType: "deck",
      content: "body",
      metadata: { slug: "core" },
    });
  });

  test("is an empty archive when neither plugin is loaded", async () => {
    const data = await writing(installedSite());
    expect(data).toEqual({ posts: [], decks: [] });
  });
});
