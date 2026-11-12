import { parseMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import type { ServiceEntityReads } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";

interface ProfileSchema<T> {
  parse(data: unknown): T;
}

/**
 * The read the singleton needs: a first-party service's entity reads, or a
 * site data source's entity service, which offers the same read.
 */
export type AnchorProfileReader = Pick<ServiceEntityReads, "listEntities">;

/** Fetch the singleton anchor-profile markdown. */
export async function fetchAnchorProfile(
  entityService: AnchorProfileReader,
): Promise<string> {
  const entities = await entityService.listEntities({
    entityType: "anchor-profile",
    options: { limit: 1 },
  });
  const entity = entities[0];
  if (!entity) {
    throw new Error("Profile not found — create an anchor-profile entity");
  }
  return entity.content;
}

/** Fetch and parse the singleton with a plugin-owned profile schema. */
export async function fetchAnchorProfileData<T extends object>(
  entityService: AnchorProfileReader,
  schema: ProfileSchema<T>,
): Promise<T> {
  const markdown = await fetchAnchorProfile(entityService);
  const { metadata, content } = parseMarkdownWithFrontmatter(
    markdown,
    z.record(z.string(), z.unknown()),
  );
  return schema.parse(content ? { ...metadata, story: content } : metadata);
}
