import {
  parseMarkdownWithFrontmatter,
  type ICoreEntityService,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

interface ProfileSchema<T> {
  parse(data: unknown): T;
}

/** Fetch the singleton anchor-profile markdown. */
export async function fetchAnchorProfile(
  entityService: ICoreEntityService,
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
export async function fetchAnchorProfileData<T extends Record<string, unknown>>(
  entityService: ICoreEntityService,
  schema: ProfileSchema<T>,
): Promise<T> {
  const markdown = await fetchAnchorProfile(entityService);
  const { metadata, content } = parseMarkdownWithFrontmatter(
    markdown,
    z.record(z.string(), z.unknown()),
  );
  return schema.parse(content ? { ...metadata, story: content } : metadata);
}
