import { z } from "@brains/utils/zod";

// The semver.org reference pattern: major.minor.patch[-prerelease][+build].
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;
const NUMERIC_IDENTIFIER = /^\d+$/u;

/** The version of the brain that queued a job or runs a worker. */
export const BrainVersionSchema: z.ZodString = z
  .string()
  .regex(SEMVER, "Brain version must be a semver version");

export type BrainVersion = z.output<typeof BrainVersionSchema>;

/** A number as its digit count then its digits, so longer numbers sort later. */
function numberKey(digits: string): string {
  return `${String(digits.length).padStart(2, "0")}${digits}`;
}

/** Numeric identifiers sort before alphanumeric ones, as semver requires. */
function identifierKey(identifier: string): string {
  return NUMERIC_IDENTIFIER.test(identifier)
    ? `0${numberKey(identifier)}`
    : `1${identifier}`;
}

/**
 * A key whose binary (SQLite BINARY collation) order is semver precedence, so
 * the queue can compare versions inside one atomic claim statement.
 *
 * Identifiers are joined with "!", which sorts below every identifier
 * character, and a shorter identifier list sorts first because it ends first.
 * A prerelease core ends in "-", which sorts below the release marker "~".
 * Build metadata does not affect precedence and is dropped.
 */
export function brainVersionSortKey(version: BrainVersion): string {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`Invalid brain version "${version}"`);
  const [, major = "", minor = "", patch = "", prerelease] = match;
  const core = [major, minor, patch].map(numberKey).join("");
  return prerelease === undefined
    ? `${core}~`
    : `${core}-${prerelease.split(".").map(identifierKey).join("!")}`;
}
