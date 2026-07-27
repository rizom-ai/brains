import type { InstanceOverrides } from "@brains/app";

export const BRAIN_RECIPE_NAMES = [
  "minimal",
  "personal",
  "team",
  "commerce",
] as const;

export type BrainRecipeName = (typeof BRAIN_RECIPE_NAMES)[number];
export type BrainRecipeExpansion = Omit<
  InstanceOverrides,
  "brain" | "preset" | "mode"
>;

const recipes: Record<BrainRecipeName, BrainRecipeExpansion> = {
  minimal: {
    bundles: ["core"],
  },
  personal: {
    anchor: "person",
    bundles: ["core", "site", "publishing"],
    site: {
      package: "@brains/site-default",
      theme: "@rizom/theme-default",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  team: {
    anchor: "team",
    bundles: ["core", "site", "team"],
    site: {
      package: "@brains/site-default",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  commerce: {
    anchor: "organization",
    bundles: ["core", "site"],
    add: ["products"],
    site: {
      package: "@rizom/site-rizom",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
      discord: { captureUrls: true },
    },
  },
};

function cloneRecipe(value: BrainRecipeExpansion): BrainRecipeExpansion {
  return structuredClone(value);
}

/** Expand compile-time recipe scaffolding to explicit brain.yaml inputs. */
export function expandBrainRecipe(
  recipe: BrainRecipeName,
): BrainRecipeExpansion {
  return cloneRecipe(recipes[recipe]);
}
