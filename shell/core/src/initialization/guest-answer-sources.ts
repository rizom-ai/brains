import type { SourceCitation } from "@brains/contracts";
import {
  permissionToVisibilityScope,
  type IEntityService,
  type SearchResult,
} from "@brains/entity-service";

/** Candidates searched; many are types the site does not cite. */
const SEARCH_LIMIT = 20;
/** The embedding search's own floor for a relevant match. */
const MIN_SCORE = 0.5;
/** How far below the closest page a source may score and still count. */
const SCORE_BAND = 0.06;
const MAX_SOURCES = 5;

export interface GuestAnswerSourcesDeps {
  entityService: Pick<IEntityService, "search">;
  /** Whether the site offers this type to visitors as a source. */
  isCitable: (entityType: string) => boolean;
  /** The site path of an entity of this type. */
  urlFor: (entityType: string, slug: string) => string;
  /** The domain the site is published at; without it, sources carry no address. */
  siteBaseUrl: string | undefined;
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function httpsString(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("https://")
    ? value
    : undefined;
}

/** The brain a piece came from, as the citation names it: its name and address. */
function brainOf(value: unknown): { name: string; url?: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const fields = new Map(Object.entries(value));
  const name = fields.get("name");
  if (typeof name !== "string" || !name) return undefined;
  const url = httpsString(fields.get("url"));
  return { name, ...(url ? { url } : {}) };
}

function toCitation(
  { entity }: SearchResult,
  deps: GuestAnswerSourcesDeps,
): SourceCitation {
  const title =
    metadataString(entity.metadata, "title") ??
    metadataString(entity.metadata, "name");
  const slug = metadataString(entity.metadata, "slug") ?? entity.id;
  // The deployment's domain, with or without a scheme; the site is served over https.
  const domain = deps.siteBaseUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  // A piece from another brain lives at its origin, and names that brain.
  const origin = httpsString(entity.metadata["origin"]);
  const brain = brainOf(entity.metadata["brain"]);
  const url =
    origin ??
    (domain
      ? new URL(deps.urlFor(entity.entityType, slug), `https://${domain}`).href
      : undefined);
  return {
    id: `${entity.entityType}:${entity.id}`,
    ...(title ? { title } : {}),
    source: entity.entityType,
    entityType: entity.entityType,
    entityId: entity.id,
    ...(url ? { url } : {}),
    ...(brain ? { brain } : {}),
  };
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
      .map((result) => toCitation(result, deps));
  };
}
