import type { EntityPluginContext } from "@brains/plugins";
import { findNearestEntity, type NearestEntityDeps } from "@brains/plugins";
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
  ai: Pick<EntityPluginContext["ai"], "generateObject">,
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

export interface WishSearchDeps extends NearestEntityDeps<WishEntity> {
  maxDistance: number;
  ai: Pick<EntityPluginContext["ai"], "generateObject">;
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
  const nearest = await findNearestEntity(deps, {
    query: input.content,
    entityType: "wish",
    maxDistance: deps.maxDistance,
    visibility: "public",
    confirm: (candidate) =>
      isSameWish(deps.ai, input.content, candidate.content),
  });
  if (nearest) return nearest;

  return deps.getEntity({
    entityType: "wish",
    id: slugify(input.title),
  });
}
