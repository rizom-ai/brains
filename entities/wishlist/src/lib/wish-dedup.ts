import type { EntityRuntime } from "@brains/sdk/internal/entity-runtime";
import { z, type EntityOf, type EntityReader } from "@brains/sdk/entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { slugify } from "@brains/utils/string-utils";
import { wish } from "../wish";

/**
 * Cosine distance between wish markdowns within which they may ask for the
 * same thing. Measured rewordings of one wish sit at 0.19–0.23, a related but
 * different wish at 0.36+. Distance only shortlists; the same-wish check
 * decides, since embeddings barely register opposite requests.
 */
export const SAME_WISH_DISTANCE = 0.3;

/** Opening line of the same-wish check prompt. */
export const SAME_WISH_CHECK = "Do these two wishes ask for the same thing?";

const sameWishVerdictSchema = z.object({
  same: z
    .boolean()
    .describe("True only when delivering one would fulfil the other."),
});

/** One short AI call: would delivering one wish fulfil the other? */
export async function isSameWish(
  ai: Pick<EntityRuntime, "generateObject">,
  incoming: string,
  stored: string,
): Promise<boolean> {
  const { same } = await ai.generateObject(
    [
      SAME_WISH_CHECK,
      "Answer yes when both ask for the same capability, even if wording, timing or detail differ (weekly vs every Monday, calendar sync vs Google Calendar integration).",
      "Opposite or different capabilities are different wishes, even when worded almost alike: send emails vs stop sending emails, add vs remove.",
      "",
      "New wish:",
      incoming,
      "",
      "Existing wish:",
      stored,
    ].join("\n"),
    sameWishVerdictSchema,
  );
  return same;
}

export type Wish = EntityOf<typeof wish>;

export interface WishSearchDeps {
  /** Wishes nearest a query within a distance, closest first. */
  nearest(
    query: string,
    maxDistance: number,
  ): Promise<Array<{ entity: Wish; distance: number }>>;
  /** A wish by id. */
  getEntity(id: string): Promise<Wish | null>;
  readonly maxDistance: number;
  readonly ai: Pick<EntityRuntime, "generateObject">;
}

/** The search deps a call's runtime and reads give, for the wish type. */
export function wishSearch(
  runtime: Pick<EntityRuntime, "nearest" | "generateObject">,
  entities: EntityReader,
  maxDistance: number,
): WishSearchDeps {
  return {
    nearest: (query, distance) =>
      runtime.nearest(wish, query, { maxDistance: distance }),
    getEntity: (id) => entities.get(wish, id),
    maxDistance,
    ai: runtime,
  };
}

/**
 * Find an existing public wish that asks for what the new wish's markdown
 * asks for: shortlisted by embedding distance, confirmed by the same-wish
 * check, closest first, with an exact slug match as the fallback.
 */
export async function findExistingWish(
  deps: WishSearchDeps,
  input: { title: string; content: string },
): Promise<Wish | null> {
  const candidates = (
    await deps.nearest(input.content, deps.maxDistance)
  ).flatMap(({ entity }) => (entity.visibility === "public" ? [entity] : []));
  const firstConfirmed = async (index: number): Promise<Wish | undefined> => {
    const candidate = candidates[index];
    if (!candidate) return undefined;
    return (await isSameWish(deps.ai, input.content, wishDocument(candidate)))
      ? candidate
      : firstConfirmed(index + 1);
  };
  const nearest = await firstConfirmed(0);
  if (nearest) return nearest;

  const bySlug = await deps.getEntity(slugify(input.title));
  return bySlug?.visibility === "public" ? bySlug : null;
}

/** A wish's markdown as it is stored and embedded: frontmatter and body. */
export function wishDocument(entry: Wish): string {
  const { title, status, priority, requested, declinedReason } = entry.metadata;
  return wishMarkdown(
    { title, status, priority, requested, declinedReason },
    entry.content,
  );
}

/** Frontmatter over a body, as the wish's file holds it. */
export function wishMarkdown(
  frontmatter: Readonly<Record<string, unknown>>,
  body: string,
): string {
  const fields = Object.fromEntries(
    Object.entries(frontmatter).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
  return Object.keys(fields).length > 0 ? generateMarkdown(fields, body) : body;
}
