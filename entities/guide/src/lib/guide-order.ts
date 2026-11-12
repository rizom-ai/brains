import { compareIds } from "@brains/utils/sort";
import type { GuideWithData } from "../schemas/guide";
import type { GuideRecipe } from "../schemas/guide-frontmatter";

/**
 * Guides by order, then title, then id: the order the index and every card
 * list use.
 */
export function sortGuides(guides: GuideWithData[]): GuideWithData[] {
  return [...guides].sort(
    (a, b) =>
      a.metadata.order - b.metadata.order ||
      a.metadata.title.localeCompare(b.metadata.title) ||
      compareIds(a.id, b.id),
  );
}

export function guideHref(guide: GuideWithData): string {
  return `/guides/${guide.metadata.slug}`;
}

/** The recipe line on a guide's card. */
export function guideRecipeLabel(recipe: GuideRecipe | null): string {
  return recipe ? `recipe · ${recipe}` : "any recipe";
}
