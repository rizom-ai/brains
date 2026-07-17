import { createHash } from "node:crypto";
import type { ProfessionalProfileImportPatch } from "./transform/profile-mapper";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

/** Stable digest of imported source values. */
export function profileImportDigest(
  patch: ProfessionalProfileImportPatch,
): string {
  return digest(patch);
}

/** Bind approval to both imported values and the profile used to compute the merge. */
export function profileImportPreviewDigest(
  patch: ProfessionalProfileImportPatch,
  currentProfileContent: string,
): string {
  return digest({ currentProfileContent, patch });
}
