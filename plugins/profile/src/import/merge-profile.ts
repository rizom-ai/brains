import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  profileImportFieldNames,
  type ProfileImportField,
  type ProfileImportFieldName,
  type ProfileImportFields,
  type ProfileImportOutcome,
} from "@brains/contracts";

export interface ProfileImportMerge {
  content: string;
  changed: boolean;
  fields: ProfileImportField[];
}

const frontmatterSchema = z.record(z.string(), z.unknown());

/** Imported in this order; story is the markdown body, the rest frontmatter. */
const FIELDS = profileImportFieldNames;

/**
 * Values a profile holds before its owner writes one: the recipe seed
 * (`packages/brain-cli/templates/recipes/*\/seed-content/anchor-profile`) and
 * the starter profile this package generates.
 */
function isPlaceholder(field: ProfileImportFieldName, value: string): boolean {
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
  field: ProfileImportFieldName,
  current: string | null,
  imported: string,
): ProfileImportOutcome {
  if (current === null || isPlaceholder(field, current)) return "fill";
  return current === imported ? "unchanged" : "preserve";
}

/**
 * Fills what the profile lacks, or still holds as a placeholder, with what
 * an outside source has, such as LinkedIn. Whatever the owner wrote stays.
 * Unchanged input writes nothing.
 */
export function mergeProfileImport(
  content: string,
  imported: ProfileImportFields,
): ProfileImportMerge {
  const parsed = parseMarkdownWithFrontmatter(content, frontmatterSchema);
  const body = parsed.content.trim();
  const fields = FIELDS.flatMap((field): ProfileImportField[] => {
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
