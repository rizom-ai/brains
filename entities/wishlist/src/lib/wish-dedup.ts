import type {
  EntityCreateContext,
  OwnedNearestOptions,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { WishEntity } from "../schemas/wish";

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
  ai: Pick<EntityCreateContext["ai"], "generateObject">,
  incoming: string,
  stored: string,
): Promise<boolean> {
  const { object } = await ai.generateObject(
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
  return object.same;
}

export interface WishSearchDeps {
  nearest(
    request: OwnedNearestOptions & { query: string },
  ): Promise<ReadonlyArray<{ entity: WishEntity; distance: number }>>;
  getEntity(request: {
    entityType: "wish";
    id: string;
  }): Promise<WishEntity | null>;
  maxDistance: number;
  ai: Pick<EntityCreateContext["ai"], "generateObject">;
}

/**
 * Find an existing wish that asks for what the new wish's markdown asks for:
 * shortlisted by embedding distance, confirmed by the same-wish check, with
 * an exact slug match as the fallback.
 */
export async function findExistingWish(
  deps: WishSearchDeps,
  input: { title: string; content: string },
): Promise<WishEntity | null> {
  const candidates = await deps.nearest({
    query: input.content,
    maxDistance: deps.maxDistance,
    visibility: "public",
    limit: 20,
  });
  for (const { entity, distance } of candidates) {
    if (
      entity.visibility === "public" &&
      distance <= deps.maxDistance &&
      (await isSameWish(deps.ai, input.content, entity.content))
    )
      return entity;
  }

  const slugMatch = await deps.getEntity({
    entityType: "wish",
    id: slugify(input.title),
  });
  return slugMatch?.visibility === "public" ? slugMatch : null;
}
