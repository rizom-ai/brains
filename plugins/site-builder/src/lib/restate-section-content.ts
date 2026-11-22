import type { StoredContentRestateAnswer } from "@brains/contracts";
import type { RouteDefinition } from "@brains/site-composition";
import { getErrorMessage } from "@brains/utils/error";

type RestatedEntity = StoredContentRestateAnswer["restated"][number];

/** What restating the sections' saved copy reads, lays out and writes. */
export interface RestateSectionContentDeps {
  /** Every route the site builder serves. */
  routes(): RouteDefinition[];
  /** A section's saved copy, `route:section`; none when it has none. */
  savedBody(id: string): Promise<string | null>;
  /** The copy as the section's template writes it now. */
  layOut(template: string, body: string): string;
  /** Store the copy quietly; the row restated, or none when unchanged. */
  restate(id: string, body: string): Promise<RestatedEntity | null>;
  warn(message: string, context: Record<string, unknown>): void;
}

/**
 * Bring every section's saved copy to the layout its template writes now
 * (docs/plans/one-stored-form.md), quietly: a site-content body is passed
 * through by its codec and laid out by the section's template, so the
 * rewrite on start cannot reach it. A copy the template cannot read is left
 * as it is and reported.
 */
export async function restateSectionContent(
  deps: RestateSectionContentDeps,
): Promise<RestatedEntity[]> {
  const sections = deps
    .routes()
    .flatMap((route) =>
      route.sections.flatMap((section) =>
        section.template
          ? [{ id: `${route.id}:${section.id}`, template: section.template }]
          : [],
      ),
    );
  return sections.reduce<Promise<RestatedEntity[]>>(
    async (previous, section) => {
      const restated = await previous;
      const body = await deps.savedBody(section.id);
      if (body === null) return restated;
      let laidOut: string;
      try {
        laidOut = deps.layOut(section.template, body);
      } catch (error) {
        deps.warn("Section copy left in its stored layout", {
          id: section.id,
          template: section.template,
          error: getErrorMessage(error),
        });
        return restated;
      }
      if (laidOut === body) return restated;
      const row = await deps.restate(section.id, laidOut);
      return row ? [...restated, row] : restated;
    },
    Promise.resolve([]),
  );
}
