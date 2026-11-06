import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProfileImport } from "./profile-mapper";

export type ImportOutcome = "fill" | "preserve" | "unchanged";

export interface ImportedField {
  field: keyof ProfileImport;
  current: string | null;
  imported: string;
  outcome: ImportOutcome;
}

export interface ProfileImportMerge {
  content: string;
  changed: boolean;
  fields: ImportedField[];
}

const frontmatterSchema = z.record(z.string(), z.unknown());

/** Imported in this order; story is the markdown body, the rest frontmatter. */
const FIELDS = [
  "name",
  "headline",
  "industry",
  "location",
  "website",
  "story",
] as const satisfies readonly (keyof ProfileImport)[];

/**
 * Values a profile holds before its owner writes one: the recipe seed
 * (`packages/brain-cli/templates/recipes/*\/seed-content/anchor-profile`) and
 * the starter profile `plugins/profile` generates.
 */
function isPlaceholder(field: keyof ProfileImport, value: string): boolean {
  switch (field) {
    case "name":
      return /^(your name here|unknown|anchor for .+)$/i.test(value);
    case "website":
      return /^https?:\/\/example\.com\/?$/.test(value);
    case "story":
      return (
        value.startsWith("This is where your story goes.") ||
        /^This brain picked \*\*.+\*\* as its starter name\./.test(value)
      );
    default:
      return false;
  }
}

function currentValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function outcome(
  field: keyof ProfileImport,
  current: string | null,
  imported: string,
): ImportOutcome {
  if (current === null || isPlaceholder(field, current)) return "fill";
  return current === imported ? "unchanged" : "preserve";
}

/**
 * Fills what the profile lacks, or still holds as a placeholder, with what
 * LinkedIn has. Whatever the owner wrote stays. Unchanged input writes nothing.
 */
export function mergeProfileImport(
  content: string,
  imported: ProfileImport,
): ProfileImportMerge {
  const parsed = parseMarkdownWithFrontmatter(content, frontmatterSchema);
  const body = parsed.content.trim();
  const fields = FIELDS.flatMap((field): ImportedField[] => {
    const value = imported[field];
    if (value === undefined) return [];
    const current = currentValue(
      field === "story" ? body : parsed.metadata[field],
    );
    return [
      {
        field,
        current,
        imported: value,
        outcome: outcome(field, current, value),
      },
    ];
  });
  const filled = fields.filter((field) => field.outcome === "fill");
  if (filled.length === 0) return { content, changed: false, fields };

  const metadata = { ...parsed.metadata };
  filled
    .filter((field) => field.field !== "story")
    .forEach((field) => {
      metadata[field.field] = field.imported;
    });
  const story = filled.find((field) => field.field === "story");
  return {
    content: generateMarkdownWithFrontmatter(story?.imported ?? body, metadata),
    changed: true,
    fields,
  };
}
