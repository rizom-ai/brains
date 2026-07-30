import type { InstanceOverrides } from "@brains/app";

export const BRAIN_RECIPE_NAMES = [
  "minimal",
  "personal",
  "team",
  "commerce",
] as const;

export type BrainRecipeName = (typeof BRAIN_RECIPE_NAMES)[number];

export function isBrainRecipeName(value: unknown): value is BrainRecipeName {
  return (
    typeof value === "string" &&
    BRAIN_RECIPE_NAMES.some((recipe) => recipe === value)
  );
}
export type BrainRecipeExpansion = Omit<InstanceOverrides, "brain" | "mode">;

const recipes: Record<BrainRecipeName, BrainRecipeExpansion> = {
  minimal: {
    bundles: ["core"],
  },
  personal: {
    anchor: "person",
    kind: "professional",
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
    kind: "team",
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
    kind: "organization",
    bundles: ["core", "site"],
    add: ["products"],
    site: {
      package: "@rizom/site-rizom",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
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
