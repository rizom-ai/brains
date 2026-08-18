import type { InstanceOverrides } from "@brains/app";

export const BRAIN_RECIPE_NAMES = [
  "headless",
  "personal",
  "professional",
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
  headless: {
    bundles: ["core"],
  },
  personal: {
    anchor: "person",
    kind: "professional",
    bundles: ["core", "media", "web", "chat"],
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  professional: {
    anchor: "person",
    kind: "professional",
    bundles: [
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ],
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
    bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
    add: ["docs"],
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
    bundles: ["core", "media", "web", "site"],
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
