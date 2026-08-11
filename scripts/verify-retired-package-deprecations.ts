#!/usr/bin/env bun
import { z } from "@brains/utils/zod";

const retiredPackage = "@rizom/site-sections";
const canonicalPackage = "@rizom/site";
const versionMetadataSchema = z.looseObject({
  deprecated: z.string().optional(),
});
const packumentSchema = z.looseObject({
  versions: z.record(z.string(), versionMetadataSchema),
});

export function assertRetiredPackageDeprecations(input: unknown): number {
  const packument = packumentSchema.parse(input);
  const alphaVersions = Object.entries(packument.versions).filter(([version]) =>
    version.includes("-alpha."),
  );
  if (alphaVersions.length === 0) {
    throw new Error(`${retiredPackage} has no published alpha versions`);
  }

  const invalid = alphaVersions
    .filter(
      ([, metadata]) =>
        metadata.deprecated?.includes(canonicalPackage) !== true,
    )
    .map(([version]) => version)
    .sort();
  if (invalid.length > 0) {
    throw new Error(
      `${retiredPackage} versions lack a deprecation pointing to ${canonicalPackage}: ${invalid.join(", ")}`,
    );
  }
  return alphaVersions.length;
}

async function verifyPublishedDeprecations(): Promise<number> {
  const attempts = 8;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(retiredPackage)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) {
        throw new Error(
          `Registry returned ${response.status} for ${retiredPackage}`,
        );
      }
      return assertRetiredPackageDeprecations(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await Bun.sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

if (import.meta.main) {
  const count = await verifyPublishedDeprecations();
  console.log(
    `Verified ${count} deprecated ${retiredPackage} alpha versions pointing to ${canonicalPackage}.`,
  );
}
