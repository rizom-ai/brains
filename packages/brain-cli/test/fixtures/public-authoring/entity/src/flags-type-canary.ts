import {
  defineEntity,
  z,
  type EntityDefinitionConfig,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
export const searchable: EntityDefinitionConfig = {
  weight: 2,
  includeInBroadSearch: false,
  projectionSourceRole: "supporting",
};
export const machinery: EntityDefinitionConfig = {
  embeddable: false,
  fullTextSearchable: false,
  projectionSource: false,
};
export const inline: EntityDefinitionConfig = { binaryStorage: "data-url" };
export const assetBacked: EntityDefinitionConfig = { binaryStorage: "asset" };
export const ordered: EntityDefinitionConfig = {
  defaultSort: [{ field: "publishedAt", direction: "desc", nullsFirst: false }],
};
export const importable: EntityDefinitionConfig = { markdownImport: true };
export const renamed: EntityDefinitionConfig = {
  retiredFields: ["domain"],
  translatedFields: ["sources"],
};
export const contained: EntityDefinitionConfig = { containedIn: "book" };
export const guarded: EntityDefinitionConfig = {
  actionPolicy: { delete: "admin", publish: "never" },
};
export const publishing: EntityDefinitionConfig = {
  publish: { publishStatuses: ["queued", "published"] },
};

export const configuredMachinery = defineEntity({
  type: "machine-setting",
  purpose: "System configuration, not user content.",
  classification: "system",
  metadata: z.object({ target: z.string() }),
  config: machinery,
});

export const unsupportedStorage: EntityDefinitionConfig = {
  // @ts-expect-error Binary storage is a closed set of representations.
  binaryStorage: "blob",
};
export const invalidOrder: EntityDefinitionConfig = {
  // @ts-expect-error Sort direction is a closed enum.
  defaultSort: [{ field: "publishedAt", direction: "sideways" }],
};
export const invalidImport: EntityDefinitionConfig = {
  // @ts-expect-error Import eligibility is declarative data, not a callback.
  markdownImport: () => true,
};
export const invalidPolicy: EntityDefinitionConfig = {
  // @ts-expect-error Action levels are a closed vocabulary.
  actionPolicy: { delete: "owner" },
};
export const invalidClassification: EntityDefinitionConfig = {
  // @ts-expect-error Classification is top-level declaration metadata, not a config override.
  classification: "system",
};
