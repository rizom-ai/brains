import type { EntityDefinitionConfig } from "@rizom/brain/entities";

export const binary: EntityDefinitionConfig = { binaryStorage: "data-url" };
export const ordered: EntityDefinitionConfig = {
  defaultSort: [{ field: "publishedAt", direction: "desc", nullsFirst: false }],
};
export const importable: EntityDefinitionConfig = { markdownImport: true };
export const unsupportedStorage: EntityDefinitionConfig = {
  // @ts-expect-error Internal asset-backed persistence is not an author capability.
  binaryStorage: "asset",
};
export const invalidOrder: EntityDefinitionConfig = {
  // @ts-expect-error Sort direction is a closed enum.
  defaultSort: [{ field: "publishedAt", direction: "sideways" }],
};
export const invalidImport: EntityDefinitionConfig = {
  // @ts-expect-error Import eligibility is declarative data, not a callback.
  markdownImport: () => true,
};
