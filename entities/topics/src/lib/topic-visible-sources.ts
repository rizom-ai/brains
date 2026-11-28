import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import type {
  ContentVisibility,
  ListEntitiesRequest,
} from "@brains/sdk/internal/service-runtime";
import { sourceKey, type SourceRef } from "./topic-extraction-decisions";
import { readTopicSourcePages } from "./topic-source-pages";

/** A source visible to the caller, and whether extraction reads it. */
export interface ScannedSource extends Pick<SourceRef, "key" | "contentHash"> {
  eligible: boolean;
}

export interface VisibleSourceOptions {
  /** Whether topics are extracted from entities of this type. */
  isSourceType: (type: string) => boolean;
  /** Whether extraction reads this source: its visibility and status. */
  isEligibleSource: (entity: BaseEntity) => boolean;
}

/** What search can return: a public reader gets no drafts. */
function sourceScope(visibilityScope: ContentVisibility): {
  filter: { visibilityScope: ContentVisibility };
  publishedOnly?: true;
} {
  return {
    filter: { visibilityScope },
    ...(visibilityScope === "public" && { publishedOnly: true }),
  };
}

/** Every source of every topic source type the caller can see. */
export async function readVisibleSources(
  entityService: {
    getEntityTypes(): string[];
    listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  },
  options: VisibleSourceOptions,
  visibilityScope: ContentVisibility,
): Promise<ScannedSource[]> {
  return (
    await Promise.all(
      entityService
        .getEntityTypes()
        .filter((type) => options.isSourceType(type))
        .map((entityType) =>
          readTopicSourcePages(
            entityService,
            { entityType, ...sourceScope(visibilityScope) },
            (source) => [
              {
                key: sourceKey(source),
                contentHash: source.contentHash,
                eligible: options.isEligibleSource(source),
              },
            ],
          ),
        ),
    )
  ).flat();
}
