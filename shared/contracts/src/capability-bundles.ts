/**
 * The brain's canonical capability bundles, in the order the brain defines
 * them. The brain's model and the fleet's cohort schema both read this one
 * list, so a new bundle is named in one place; a test pins the model to it.
 */
export const CANONICAL_BUNDLE_IDS: readonly [
  "core",
  "media",
  "automation",
  "web",
  "chat",
  "site",
  "publishing",
  "federation",
  "matrix",
  "team",
] = [
  "core",
  "media",
  "automation",
  "web",
  "chat",
  "site",
  "publishing",
  "federation",
  "matrix",
  "team",
];

export type CanonicalBundleId = (typeof CANONICAL_BUNDLE_IDS)[number];
