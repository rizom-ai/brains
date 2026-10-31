import type { Tool, ToolResult } from "@brains/mcp-service";
import type { SearchResult } from "@brains/entity-service";
import { createTool } from "@brains/mcp-service";
import {
  permissionToVisibilityScope,
  resolveEntityOrError,
} from "@brains/entity-service";
import type { SystemServices } from "./types";
import { getInputSchema, listInputSchema, searchInputSchema } from "./schemas";
import { sanitizeEntity } from "./tool-helpers";
import { markdownBody } from "./markdown-body";
import { assertGuestReader } from "./guest-read-context";
import { MAX_SEARCH_CONTENT_CHARS, matchingSections } from "./search-excerpt";

const DEFAULT_SYSTEM_SEARCH_MIN_SCORE = 0.5;

/**
 * One search hit as the agent reads it: whole when short; a long entity's
 * hit carries no content and the sections that match the query as its
 * excerpt, so it cannot be taken for the whole text.
 */
function searchHit(
  hit: Pick<SearchResult, "entity"> &
    Partial<Pick<SearchResult, "score" | "excerpt">>,
  query: string,
  registry: SystemServices["entityRegistry"],
): Record<string, unknown> {
  const entity = sanitizeEntity(hit.entity, registry);
  if (entity !== hit.entity) {
    return { ...hit, entity, excerpt: entity.content };
  }
  const body = markdownBody(entity.content);
  if (body.length <= MAX_SEARCH_CONTENT_CHARS) return { ...hit, entity };
  const { content: _content, ...withoutContent } = entity;
  return {
    ...hit,
    entity: withoutContent,
    excerpt: matchingSections(body, query),
    excerpted: true,
  };
}

/** A public reader is a site's visitor, and a draft is not theirs to read. */
const publishedOnlyFor = (
  visibilityScope: ReturnType<typeof permissionToVisibilityScope>,
): { publishedOnly?: true } =>
  visibilityScope === "public" ? { publishedOnly: true } : {};

interface BelowThreshold {
  minScore: number;
  weakerMatches: number;
  bestScore: number;
  hint: string;
}

/** What system_search answers with. */
interface SearchData {
  results: Record<string, unknown>[];
  belowThreshold?: BelowThreshold;
  notSearchable?: { entityType: string; hint: string };
}

/**
 * An empty result above `minScore` is not evidence that nothing exists: broad
 * or abstract questions match content only weakly. When weaker candidates
 * exist, say so, so the model searches again instead of concluding absence.
 */
function describeWeakerMatches(
  candidates: readonly { score: number }[],
  minScore: number,
): BelowThreshold | undefined {
  if (candidates.length === 0) return undefined;
  const bestScore =
    Math.round(Math.max(...candidates.map((result) => result.score)) * 100) /
    100;
  return {
    minScore,
    weakerMatches: candidates.length,
    bestScore,
    hint: `No result reached minScore ${minScore}, but ${candidates.length} weaker match${candidates.length === 1 ? "" : "es"} exist (best score ${bestScore}). Broad or abstract questions match content weakly: search again with a lower minScore, such as 0.3, before concluding that nothing relevant exists.`,
  };
}

export function createEntityReadTools(services: SystemServices): Tool[] {
  const { entityService, logger } = services;

  return [
    createTool(
      "system",
      "search",
      "Search entities using semantic search. For broad search, make one system_search call with scope.kind all. Use scope.kind type only when the user asks for a specific entity type. When the user names entity types, search each with scope.kind type in the same step, without a broad search first. Applies a default minScore of 0.5 to reduce weak matches; lower minScore only for exploratory or loose recall. An empty result with belowThreshold means weaker matches exist: search again with a lower minScore before concluding that nothing relevant exists. Search results include each matched entity's content; a long one's is excerpted to its best-matching sections, which system_get reads whole. When relevant results already contain the complete evidence needed, answer from those results instead of redundantly listing or getting the same entities. Search results are candidates; do not present weak or unrelated candidates as exact matches. For each new user question about what they have written, mentioned, discussed, or saved, run a fresh search for that turn instead of answering from prior-turn results or memory, including analysis phrasing such as 'How do I discuss X in my writing?'.",
      searchInputSchema,
      async (input, context): Promise<ToolResult<SearchData>> => {
        assertGuestReader(context);
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        // A type without embeddings never matches a query: its entries,
        // unranked, answer in this call instead of an empty result the
        // agent would search again, then list and read.
        if (
          input.scope.kind === "type" &&
          services.entityRegistry.getEntityTypeConfig(input.scope.entityType)
            .embeddable === false
        ) {
          const { entityType } = input.scope;
          const entries = await entityService.listEntities({
            entityType,
            options: {
              limit: input.limit ?? services.searchLimit,
              filter: { visibilityScope },
              ...publishedOnlyFor(visibilityScope),
            },
          });
          return {
            success: true,
            data: {
              results: entries.map((entity) =>
                searchHit({ entity }, input.query, services.entityRegistry),
              ),
              notSearchable: {
                entityType,
                hint: `${entityType} is not in the search index, so the results are its entries, unranked.`,
              },
            },
          };
        }
        const minScore = input.minScore ?? DEFAULT_SYSTEM_SEARCH_MIN_SCORE;
        // Ranked by score before the limit applies, so filtering the top
        // candidates by minScore equals a thresholded search, and the
        // candidates below it cost no second query.
        const candidates = await entityService.search({
          query: input.query,
          options: {
            limit: input.limit ?? services.searchLimit,
            ...(input.scope.kind === "type" && {
              types: [input.scope.entityType],
            }),
            ...(input.includeUngenerated !== undefined && {
              includeUngenerated: input.includeUngenerated,
            }),
            visibilityScope,
            ...publishedOnlyFor(visibilityScope),
          },
        });
        const results = candidates.filter(
          (candidate) => candidate.score >= minScore,
        );
        const belowThreshold =
          results.length === 0
            ? describeWeakerMatches(candidates, minScore)
            : undefined;
        return {
          success: true,
          data: {
            results: results.map((r) =>
              searchHit(r, input.query, services.entityRegistry),
            ),
            ...(belowThreshold && { belowThreshold }),
          },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "search",
        },
      },
    ),

    createTool(
      "system",
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title). If retrieval fails, report the entity as not found rather than describing related generation work as pending.",
      getInputSchema,
      async (input, context) => {
        assertGuestReader(context);
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        const result = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
          undefined,
          visibilityScope,
          publishedOnlyFor(visibilityScope),
        );
        if (!result.ok) {
          return { success: false, error: result.error };
        }
        const entity = sanitizeEntity(result.entity, services.entityRegistry);
        return {
          success: true,
          data: {
            entity:
              input.part === "body"
                ? { ...entity, content: markdownBody(entity.content) }
                : entity,
          },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "get",
        },
      },
    ),

    createTool(
      "system",
      "list",
      "List entities by a known entity type. Returns metadata only; it answers a request to show or list items of a type, such as titles, dates and descriptions, so answer from it and use system_get only when the user asks about an item's full content. Use system_search, not system_list, for broad or vague lookup requests. For list/show-all requests that name or browse a known type or synonym (essays/articles/blog posts => post), list that type instead of searching; for a whole-type summary such as 'summarize my blog posts', list it first, then summarize the returned entities. Use system_list to inspect metadata dates such as publishedAt when the user asks for the latest item of a known type, such as latest blog post.",
      listInputSchema,
      async (input, context) => {
        assertGuestReader(context);
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const visibilityScope = permissionToVisibilityScope(
          context.userPermissionLevel,
        );
        const filter: {
          metadata?: Record<string, unknown>;
          visibilityScope: typeof visibilityScope;
        } = {
          visibilityScope,
        };
        if (input.status && input.status !== "any") {
          filter.metadata = { status: input.status };
        }
        const { defaultSort } = services.entityRegistry.getEntityTypeConfig(
          input.entityType,
        );
        const entities = await entityService.listEntities({
          entityType: input.entityType,
          options: {
            limit: input.limit ?? 20,
            filter,
            ...publishedOnlyFor(visibilityScope),
            ...(defaultSort ? { sortFields: defaultSort } : {}),
          },
        });
        const items = entities.map(
          ({ content: _, contentHash: __, ...rest }) => rest,
        );
        return {
          success: true,
          data: { entities: items, count: items.length },
        };
      },
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "list",
        },
      },
    ),
  ];
}
