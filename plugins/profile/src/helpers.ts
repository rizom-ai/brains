import { parseMarkdownWithFrontmatter } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";

interface ProfileSchema<T> {
  parse(data: unknown): T;
}

/**
 * What fetching the anchor profile actually needs: one listing call.
 *
 * Structural rather than the whole entity service, so a site datasource and
 * a job handler — which are handed different readers — can both call it.
 */
export interface AnchorProfileReader {
  listEntities(request: {
    entityType: string;
    options?: { limit?: number };
  }): Promise<Array<{ content: string }>>;
}

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
