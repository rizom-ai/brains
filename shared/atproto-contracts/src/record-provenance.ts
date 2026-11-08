import type { BaseEntity } from "@brains/entity-service";
import { canonicalAtprotoLexicons } from "./lexicon";
import type { CanonicalAtprotoLexiconId } from "./lexicon";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "./projection";
import type { CanonicalAtprotoRecordMap } from "./records";

/** The collections whose records end in the shared provenance fields. */
type AtprotoProvenancedCollection =
  | "ai.rizom.brain.deck"
  | "ai.rizom.brain.link"
  | "ai.rizom.brain.note"
  | "ai.rizom.brain.project"
  | "ai.rizom.brain.series"
  | "ai.rizom.brain.socialPost"
  | "ai.rizom.brain.topic";

/**
 * Where a projected record comes from: the brain and anchor that publish it,
 * the page it lives on, and the entity it was built from.
 */
export type AtprotoRecordProvenance = Pick<
  CanonicalAtprotoRecordMap[AtprotoProvenancedCollection],
  | "brainDid"
  | "anchorDid"
  | "canonicalUrl"
  | "sourceEntityType"
  | "sourceEntityId"
  | "createdAt"
  | "updatedAt"
>;

type AtprotoProvenancePlacement = Pick<
  AtprotoProjectionBuildInput,
  "config"
> & {
  pageUrl?: AtprotoProjectionBuildInput["pageUrl"] | undefined;
};

type AtprotoProvenanceSource = Pick<
  BaseEntity,
  "entityType" | "id" | "created"
> &
  Partial<Pick<BaseEntity, "updated">>;

/**
 * The provenance fields a projected record ends with. Absent or empty brain,
 * anchor, page and update values are left out rather than sent empty.
 */
export function atprotoProvenance(
  { config, pageUrl }: AtprotoProvenancePlacement,
  entity: AtprotoProvenanceSource,
): AtprotoRecordProvenance {
  return {
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    ...(pageUrl && { canonicalUrl: pageUrl }),
    sourceEntityType: entity.entityType,
    sourceEntityId: entity.id,
    createdAt: entity.created,
    ...(entity.updated && { updatedAt: entity.updated }),
  };
}

/**
 * An entity's projection into a canonical collection. The collection's lexicon
 * comes with it, the record is sent with `validate: false`, and the records it
 * builds must belong to the collection.
 */
export function defineAtprotoProjection<
  TCollection extends CanonicalAtprotoLexiconId,
>(
  definition: Omit<
    AtprotoProjection<CanonicalAtprotoRecordMap[TCollection]>,
    "collection" | "lexicon" | "validate"
  > & { collection: TCollection },
): AtprotoProjection<CanonicalAtprotoRecordMap[TCollection]> {
  const { entityType, collection, ...hooks } = definition;
  return {
    entityType,
    collection,
    lexicon: canonicalAtprotoLexicons[collection],
    validate: false,
    ...hooks,
  };
}
