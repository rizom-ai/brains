import type { SourceCitation } from "@brains/contracts";
import { entitySourceCitation, type EntityLinks } from "@brains/ai-service";
import {
  permissionToVisibilityScope,
  type IEntityService,
} from "@brains/entity-service";

/** Candidates searched; many are types the site does not cite. */
const SEARCH_LIMIT = 20;
/** The embedding search's own floor for a relevant match. */
const MIN_SCORE = 0.5;
/** How far below the closest page a source may score and still count. */
const SCORE_BAND = 0.06;
const MAX_SOURCES = 5;

export interface GuestAnswerSourcesDeps extends EntityLinks {
  entityService: Pick<IEntityService, "search">;
}

/**
 * A visitor's answer's sources: the published pieces of work the site cites
 * whose embeddings sit closest to the answer, however the answer found its
 * way to them. Only pieces scoring near the closest one count.
 */
export function createGuestAnswerSources(
  deps: GuestAnswerSourcesDeps,
): (request: { answer: string }) => Promise<SourceCitation[]> {
  return async ({ answer }) => {
    const results = await deps.entityService.search({
      query: answer,
      options: {
        limit: SEARCH_LIMIT,
        minScore: MIN_SCORE,
        visibilityScope: permissionToVisibilityScope("public"),
        publishedOnly: true,
      },
    });
    const citable = results.filter((result) =>
      deps.isCitable(result.entity.entityType),
    );
    const closest = Math.max(...citable.map((result) => result.score));
    return citable
      .filter((result) => result.score >= closest - SCORE_BAND)
      .slice(0, MAX_SOURCES)
      .map(({ entity }) => entitySourceCitation(entity, deps));
  };
}
