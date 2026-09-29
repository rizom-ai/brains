import {
  defineEntity,
  z,
  type EntityTypeClassification,
  type EntityDefinitionConfig,
} from "@rizom/brain/entities";

const classification: EntityTypeClassification = "system";
export const system = defineEntity({
  type: "instruction",
  purpose: "Operating instructions",
  classification,
  metadata: z.object({ title: z.string() }),
});
export const content = defineEntity({
  type: "article",
  purpose: "Authored content",
  metadata: z.object({ title: z.string() }),
});
export const invalid = defineEntity({
  type: "invalid",
  purpose: "Compile-only negative canary",
  metadata: z.object({}),
  // @ts-expect-error Classification is a closed semantic enum, not a permission.
  classification: "admin",
});
export const invalidConfig: EntityDefinitionConfig = {
  // @ts-expect-error Classification is top-level declaration metadata, not a config override.
  classification: "system",
};
