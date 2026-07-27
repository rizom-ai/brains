import definition, {
  CORE_BUNDLE_ID,
  expandBrainRecipe,
} from "@rizom/brain/model";

if (definition.bundles?.[0]?.id !== CORE_BUNDLE_ID) {
  throw new Error("Canonical model subpath did not expose core first");
}
if (expandBrainRecipe("minimal").bundles?.[0] !== CORE_BUNDLE_ID) {
  throw new Error("Canonical model subpath did not expose recipe expansion");
}
