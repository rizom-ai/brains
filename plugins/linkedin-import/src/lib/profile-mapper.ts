import type { LinkedInSnapshotRecord } from "./linkedin-client";

/** Profile values read from LinkedIn, in the profile's own field names. */
export interface ProfileImport {
  name?: string | undefined;
  headline?: string | undefined;
  industry?: string | undefined;
  location?: string | undefined;
  website?: string | undefined;
  story?: string | undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function first(
  records: readonly LinkedInSnapshotRecord[],
  key: string,
): string | undefined {
  return records.map((record) => text(record[key])).find(Boolean);
}

/** Maps LinkedIn's documented PROFILE keys; anything blank is left out. */
export function mapLinkedInProfile(
  records: readonly LinkedInSnapshotRecord[],
): ProfileImport {
  const name =
    [first(records, "First Name"), first(records, "Last Name")]
      .filter(Boolean)
      .join(" ") || undefined;
  const website = first(records, "Websites")?.match(/https?:\/\/[^\s,;]+/)?.[0];
  const values: ProfileImport = {
    name,
    headline: first(records, "Headline"),
    industry: first(records, "Industry"),
    location: first(records, "Geo Location"),
    website,
    story: first(records, "Summary"),
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}
