import type { LinkedInSnapshotRecord } from "../linkedin-client";

export interface ProfessionalProfileImportPatch {
  name?: string | undefined;
  headline?: string | undefined;
  industry?: string | undefined;
  location?: string | undefined;
  website?: string | undefined;
  story?: string | undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstField(
  records: LinkedInSnapshotRecord[],
  key: string,
): string | undefined {
  for (const record of records) {
    const value = nonEmptyString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function firstWebsite(records: LinkedInSnapshotRecord[]): string | undefined {
  const websites = firstField(records, "Websites");
  if (!websites) return undefined;
  return websites.match(/https?:\/\/[^\s,;]+/)?.[0];
}

/** Deterministically map LinkedIn's documented PROFILE keys. */
export function mapLinkedInProfile(
  records: LinkedInSnapshotRecord[],
): ProfessionalProfileImportPatch {
  const firstName = firstField(records, "First Name");
  const lastName = firstField(records, "Last Name");
  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const headline = firstField(records, "Headline");
  const industry = firstField(records, "Industry");
  const location = firstField(records, "Geo Location");
  const website = firstWebsite(records);
  const story = firstField(records, "Summary");

  return {
    ...(name ? { name } : {}),
    ...(headline ? { headline } : {}),
    ...(industry ? { industry } : {}),
    ...(location ? { location } : {}),
    ...(website ? { website } : {}),
    ...(story ? { story } : {}),
  };
}
