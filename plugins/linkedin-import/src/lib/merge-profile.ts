import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProfessionalProfileImportPatch } from "./transform/profile-mapper";

export interface ProfileImportMergeResult {
  content: string;
  appliedFields: string[];
  preservedFields: string[];
  changed: boolean;
}

const frontmatterSchema = z.record(z.string(), z.unknown());
const metadataFields = [
  "name",
  "headline",
  "industry",
  "location",
  "website",
] as const;

const placeholderNames = new Set(["unknown", "your name here"]);
const placeholderWebsites = new Set([
  "https://example.com",
  "http://example.com",
]);

function isPlaceholderStory(body: string): boolean {
  return (
    body.includes("This is where your story goes.") &&
    body.includes("Delete this and write your own")
  );
}

function isMissingField(field: string, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (normalized.length === 0) return true;
  if (field === "name") return placeholderNames.has(normalized.toLowerCase());
  return field === "website" && placeholderWebsites.has(normalized);
}

/** Fill absent profile values while preserving deliberate owner-authored data. */
export function mergeProfileImport(
  currentContent: string,
  patch: ProfessionalProfileImportPatch,
): ProfileImportMergeResult {
  const parsed = parseMarkdownWithFrontmatter(
    currentContent,
    frontmatterSchema,
  );
  const metadata = { ...parsed.metadata };
  let body = parsed.content;
  const appliedFields: string[] = [];
  const preservedFields: string[] = [];

  for (const field of metadataFields) {
    const importedValue = patch[field];
    if (importedValue === undefined) continue;

    if (isMissingField(field, metadata[field])) {
      metadata[field] = importedValue;
      appliedFields.push(field);
    } else if (metadata[field] !== importedValue) {
      preservedFields.push(field);
    }
  }

  if (patch.story !== undefined) {
    if (body.trim().length === 0 || isPlaceholderStory(body)) {
      body = patch.story;
      appliedFields.push("story");
    } else if (body.trim() !== patch.story.trim()) {
      preservedFields.push("story");
    }
  }

  if (appliedFields.length === 0) {
    return {
      content: currentContent,
      appliedFields,
      preservedFields,
      changed: false,
    };
  }

  return {
    content: generateMarkdownWithFrontmatter(body, metadata),
    appliedFields,
    preservedFields,
    changed: true,
  };
}
