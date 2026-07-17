import type {
  LinkedInProfessionalSnapshotDomain,
  LinkedInSnapshotRecord,
} from "./linkedin-client";
import {
  getLinkedInSnapshotImportDomains,
  mapLinkedInSnapshotDomain,
} from "./transform/registry";
import type { ProfessionalProfileImportPatch } from "./transform/profile-mapper";

export interface LinkedInProfessionalSnapshotSource {
  fetchDomain(
    domain: LinkedInProfessionalSnapshotDomain,
  ): Promise<LinkedInSnapshotRecord[]>;
}

export interface LoadedLinkedInProfileImport {
  patch: ProfessionalProfileImportPatch;
  recordsRead: number;
}

function combinePatches(
  patches: ProfessionalProfileImportPatch[],
): ProfessionalProfileImportPatch {
  const combined: Record<string, unknown> = {};

  for (const patch of patches) {
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const existing = combined[field];
      if (existing === undefined) {
        combined[field] = value;
      } else if (Array.isArray(existing) && Array.isArray(value)) {
        combined[field] = [...existing, ...value];
      } else if (existing !== value) {
        throw new Error(
          `LinkedIn snapshot mappers produced conflicting values for ${field}`,
        );
      }
    }
  }

  return combined as ProfessionalProfileImportPatch;
}

/** Fetch and map every fixture-backed domain registered for durable import. */
export async function loadLinkedInProfileImport(
  source: LinkedInProfessionalSnapshotSource,
): Promise<LoadedLinkedInProfileImport> {
  const domains = getLinkedInSnapshotImportDomains();
  const mapped = await Promise.all(
    domains.map(async (domain) => {
      const records = await source.fetchDomain(domain);
      return {
        patch: mapLinkedInSnapshotDomain(domain, records),
        recordsRead: records.length,
      };
    }),
  );

  return {
    patch: combinePatches(mapped.map(({ patch }) => patch)),
    recordsRead: mapped.reduce(
      (total, domainResult) => total + domainResult.recordsRead,
      0,
    ),
  };
}
