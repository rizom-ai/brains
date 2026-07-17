import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  professionalCertificationSchema,
  professionalEducationSchema,
  professionalPositionSchema,
  type ProfessionalCertification,
  type ProfessionalEducation,
  type ProfessionalPosition,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  certificationFingerprint,
  educationFingerprint,
  positionFingerprint,
  skillFingerprint,
} from "./professional-fingerprints";
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

interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

interface CollectionMergeResult {
  value: unknown;
  addedCount: number;
  preservedConflict: boolean;
}

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

function comparisonSignature(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.trim().replace(/\s+/g, " "));
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => comparisonSignature(item)));
  }
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparisonSignature(item)]),
    );
  }
  return String(JSON.stringify(value));
}

function mergeCollection<T>(
  current: unknown,
  imported: T[] | undefined,
  parser: SafeParser<T>,
  fingerprint: (value: T) => string,
): CollectionMergeResult {
  if (!imported || imported.length === 0) {
    return { value: current, addedCount: 0, preservedConflict: false };
  }

  const uniqueImported = new Map<string, T>();
  for (const item of imported) {
    const key = fingerprint(item);
    if (!uniqueImported.has(key)) uniqueImported.set(key, item);
  }

  if (current === undefined || current === null) {
    return {
      value: [...uniqueImported.values()],
      addedCount: uniqueImported.size,
      preservedConflict: false,
    };
  }
  if (!Array.isArray(current)) {
    return { value: current, addedCount: 0, preservedConflict: true };
  }

  const existing = new Map<string, T>();
  for (const item of current) {
    const parsed = parser.safeParse(item);
    if (!parsed.success) continue;
    const key = fingerprint(parsed.data);
    if (!existing.has(key)) existing.set(key, parsed.data);
  }

  const additions: T[] = [];
  let preservedConflict = false;
  for (const [key, item] of uniqueImported) {
    const match = existing.get(key);
    if (!match) {
      additions.push(item);
    } else if (
      typeof match !== "string" &&
      comparisonSignature(match) !== comparisonSignature(item)
    ) {
      preservedConflict = true;
    }
  }

  return {
    value: additions.length > 0 ? [...current, ...additions] : current,
    addedCount: additions.length,
    preservedConflict,
  };
}

/** Fill absent profile values and append new rich records without replacing owner data. */
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

  const applyCollectionMerge = <T>(
    field: "certifications" | "education" | "positions" | "skills",
    imported: T[] | undefined,
    parser: SafeParser<T>,
    fingerprint: (value: T) => string,
  ): void => {
    const result = mergeCollection(
      metadata[field],
      imported,
      parser,
      fingerprint,
    );
    if (result.addedCount > 0) {
      metadata[field] = result.value;
      appliedFields.push(field);
    }
    if (result.preservedConflict) preservedFields.push(field);
  };

  applyCollectionMerge("skills", patch.skills, z.string(), skillFingerprint);
  applyCollectionMerge<ProfessionalPosition>(
    "positions",
    patch.positions,
    professionalPositionSchema,
    positionFingerprint,
  );
  applyCollectionMerge<ProfessionalEducation>(
    "education",
    patch.education,
    professionalEducationSchema,
    educationFingerprint,
  );
  applyCollectionMerge<ProfessionalCertification>(
    "certifications",
    patch.certifications,
    professionalCertificationSchema,
    certificationFingerprint,
  );

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
