import type { GuideMaterial, GuideRecipe } from "../schemas/guide-frontmatter";

/**
 * What each recipe brings, in the reader's terms. The lines follow the
 * recipe's bundles in `@rizom/brain` (brain-recipes.ts, canonical-bundles.ts):
 * personal is core, media, web and chat; professional adds the site and the
 * publishing bundle; team adds the site, docs and the action board.
 */
const recipeHighlights: Record<GuideRecipe, readonly string[]> = {
  personal: [
    "Notes and saved links, gathered into topics",
    "Documents and images kept beside them",
    "Summaries, decisions and action items kept from your conversations",
    "Chat, Studio and your AI tools, all on the same brain",
  ],
  professional: [
    "Your own site, with posts and series",
    "A publishing queue with drafts and schedules",
    "Newsletter issues from published posts",
    "LinkedIn drafts when you ask for them",
  ],
  team: [
    "A shared site for the team",
    "Docs the team writes and keeps current",
    "Decisions and action items from team conversations, shared with everyone",
    "A board over the team's action items",
    "Trusted members add and edit notes, links and docs",
  ],
};

export function guideRecipeHighlights(recipe: GuideRecipe): string[] {
  return [...recipeHighlights[recipe]];
}

/** Short notes under the entity types the material map names. */
const entityTypeNotes: Record<string, string> = {
  note: "raw material",
  post: "on your site",
  series: "ordered posts",
  link: "with summary",
  deck: "slides",
  doc: "reference",
  "anchor-profile": "your profile",
  project: "portfolio",
  "action-item": "on the board",
  image: "as uploaded",
};

export function entityTypeNote(entityType: string): string | undefined {
  return entityTypeNotes[entityType];
}

/**
 * One piece of material in the opening, placed on a ring around the title.
 * `x` and `y` are fractions of the ring's radii; `narrowY` keeps every
 * fragment clear of the title on a phone, where the ring is narrower than it.
 */
export interface MaterialFragment {
  label: string;
  text: string;
  x: number;
  y: number;
  narrowY: number;
  rotate: number;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

function clearOfTitle(y: number): number {
  return (Math.sign(y) || 1) * Math.max(Math.abs(y), 0.8);
}

/** Scatter each place the material lives as a fragment, with a fixed jitter. */
export function materialFragments(
  material: GuideMaterial[],
): MaterialFragment[] {
  const pieces = material.flatMap(({ from, where }) =>
    where
      .split(",")
      .map((place) => place.trim())
      .filter((place) => place.length > 0)
      .map((place) => ({ label: from, text: place })),
  );

  return pieces.map((piece, index) => {
    const angle = (index / pieces.length) * Math.PI * 2 + 0.4;
    const x = Math.cos(angle) * (0.82 + ((index * 37) % 18) / 100);
    const y = Math.sin(angle) * (0.82 + ((index * 53) % 18) / 100);
    return {
      ...piece,
      x: round(x),
      y: round(Math.abs(x) < 0.74 ? clearOfTitle(y) : y),
      narrowY: round(clearOfTitle(y)),
      rotate: ((index * 29) % 14) - 7,
    };
  });
}

const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function romanNumeral(position: number): string {
  return numerals[position - 1] ?? String(position);
}

const numberWords = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

/** "Five stages, and then a week." The last stage is the week after. */
export function stagesHeading(stageCount: number): string {
  if (stageCount < 2) return "Moving in.";
  const before = stageCount - 1;
  const word = numberWords[before] ?? String(before);
  return `${word} ${before === 1 ? "stage" : "stages"}, and then a week.`;
}

/** "The writer" → "Not quite a writer?"; a persona without "The" names no kind of user. */
export function closingHeading(persona: string): string {
  const kind = /^the\s+(.+)$/i.exec(persona.trim())?.[1];
  if (!kind) return "Looking for another way in?";
  return `Not quite ${/^[aeiou]/i.test(kind) ? "an" : "a"} ${kind}?`;
}

/** The title with its last word set apart for the accent. */
export function splitTitle(title: string): { lead: string; accent: string } {
  const at = title.trimEnd().lastIndexOf(" ");
  return at < 0
    ? { lead: "", accent: title }
    : { lead: title.slice(0, at + 1), accent: title.slice(at + 1) };
}
