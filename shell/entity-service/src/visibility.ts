import { z } from "./main-zod";

const canonicalContentVisibilitySchema = z.enum([
  "public",
  "shared",
  "restricted",
]);

export type ContentVisibility = z.infer<
  typeof canonicalContentVisibilitySchema
>;
export type RawContentVisibility = ContentVisibility | "private";

export const contentVisibilitySchema = z
  .union([canonicalContentVisibilitySchema, z.literal("private")])
  .optional()
  .transform((value): ContentVisibility => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

export function normalizeContentVisibility(
  visibility: RawContentVisibility | undefined,
): ContentVisibility {
  return contentVisibilitySchema.parse(visibility);
}

const visibleContentVisibilitiesByScope: Record<
  ContentVisibility,
  ContentVisibility[]
> = {
  public: ["public"],
  shared: ["public", "shared"],
  restricted: ["public", "shared", "restricted"],
};

export function getVisibleContentVisibilities(
  scope: ContentVisibility,
): ContentVisibility[] {
  return visibleContentVisibilitiesByScope[scope];
}

export function isVisibleWithinScope(
  visibility: ContentVisibility | undefined,
  scope: ContentVisibility,
): boolean {
  return getVisibleContentVisibilities(scope).includes(visibility ?? "public");
}

/**
 * Map a caller's permission level to the content-visibility scope they may see.
 * public  → public         (only public content)
 * trusted → shared         (public + shared)
 * anchor  → restricted     (public + shared + restricted)
 *
 * Defaults to "public" when no permission level is provided, so missing
 * context fails closed.
 */
export function permissionToVisibilityScope(
  level: "anchor" | "trusted" | "public" | undefined,
): ContentVisibility {
  if (level === "anchor") return "restricted";
  if (level === "trusted") return "shared";
  return "public";
}

/**
 * Whether a caller at `level` is allowed to author or update an entity at
 * `visibility`. A user may only write content at a visibility they themselves
 * can read — otherwise they could ghost-write content into a higher trust
 * level than their permission, which is a write-side escalation vector.
 *
 *  public  → may write "public"
 *  trusted → may write "public" | "shared"
 *  anchor  → may write "public" | "shared" | "restricted"
 */
export function canWriteVisibility(
  level: "anchor" | "trusted" | "public" | undefined,
  visibility: ContentVisibility,
): boolean {
  return isVisibleWithinScope(visibility, permissionToVisibilityScope(level));
}
