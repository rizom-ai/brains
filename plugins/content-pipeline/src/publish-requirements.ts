import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";

/**
 * The fields an entry still has to fill before it can go out: those its type
 * declares as needed to publish, left empty. A draft may leave them empty.
 */
export function missingPublishFields(
  requiredFields: readonly string[] | undefined,
  entity: Pick<BaseEntity, "metadata">,
): string[] {
  return (requiredFields ?? []).filter((field) => {
    const value = entity.metadata[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });
}

/** "Add excerpt and author before publishing." */
export function publishRequirementMessage(missing: readonly string[]): string {
  const names =
    missing.length <= 1
      ? missing.join("")
      : `${missing.slice(0, -1).join(", ")} and ${missing.at(-1) ?? ""}`;
  return `Add ${names} before publishing.`;
}
