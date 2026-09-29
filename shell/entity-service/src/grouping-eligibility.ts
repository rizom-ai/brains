import type { BaseEntity, EntityAdapter, EntityTypeConfig } from "./types";

/** One eligibility rule for registry enforcement and consumer discovery. */
export function isGroupingContributor(
  adapter:
    | Pick<EntityAdapter<BaseEntity>, "frontmatterSchema" | "isSingleton">
    | undefined,
  config: EntityTypeConfig,
): boolean {
  return (
    !!adapter?.frontmatterSchema &&
    !adapter.isSingleton &&
    config.classification !== "system" &&
    config.binaryStorage === undefined
  );
}
