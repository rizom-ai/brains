#!/usr/bin/env bun
import { z } from "@brains/utils/zod";

export interface RetiredPackage {
  name: string;
  replacement: string;
}

const siteSectionsRetirement: RetiredPackage = {
  name: "@rizom/site-sections",
  replacement: "@rizom/site",
};

export const retiredPackages: readonly RetiredPackage[] = [
  siteSectionsRetirement,
  { name: "@rizom/site-rizom", replacement: "@rizom/site-rizom-ai" },
];

const versionMetadataSchema = z.looseObject({
  deprecated: z.string().optional(),
});
const packumentSchema = z.looseObject({
  versions: z.record(z.string(), versionMetadataSchema),
});

export function assertRetiredPackageDeprecations(
  input: unknown,
  retiredPackage: RetiredPackage = siteSectionsRetirement,
): number {
  const packument = packumentSchema.parse(input);
  const alphaVersions = Object.entries(packument.versions).filter(([version]) =>
    version.includes("-alpha."),
  );
  if (alphaVersions.length === 0) {
    throw new Error(`${retiredPackage.name} has no published alpha versions`);
  }

  const invalid = alphaVersions
    .filter(
      ([, metadata]) =>
        metadata.deprecated?.includes(retiredPackage.replacement) !== true,
    )
    .map(([version]) => version)
    .sort();
  if (invalid.length > 0) {
    throw new Error(
      `${retiredPackage.name} versions lack a deprecation pointing to ${retiredPackage.replacement}: ${invalid.join(", ")}`,
    );
  }
  return alphaVersions.length;
}

async function verifyPublishedDeprecations(
  retiredPackage: RetiredPackage,
): Promise<number> {
  const attempts = 8;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(retiredPackage.name)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) {
        throw new Error(
          `Registry returned ${response.status} for ${retiredPackage.name}`,
        );
      }
      return assertRetiredPackageDeprecations(
        await response.json(),
        retiredPackage,
      );
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await Bun.sleep(attempt * 1_000);
    }
  }
  throw lastError;
}

if (import.meta.main) {
  for (const retiredPackage of retiredPackages) {
    const count = await verifyPublishedDeprecations(retiredPackage);
    console.log(
      `Verified ${count} deprecated ${retiredPackage.name} alpha versions pointing to ${retiredPackage.replacement}.`,
    );
  }
}
