import type {
  LinkedInProfessionalSnapshotDomain,
  LinkedInSnapshotRecord,
} from "../linkedin-client";
import {
  mapLinkedInProfile,
  type ProfessionalProfileImportPatch,
} from "./profile-mapper";

export type LinkedInSnapshotMapper = (
  records: LinkedInSnapshotRecord[],
) => ProfessionalProfileImportPatch;

interface LinkedInSnapshotMapperRegistration {
  domain: LinkedInProfessionalSnapshotDomain;
  mapper: LinkedInSnapshotMapper;
}

/** Only fixture-backed domains belong here. Registration enables preview and import. */
const registrations: readonly LinkedInSnapshotMapperRegistration[] = [
  { domain: "PROFILE", mapper: mapLinkedInProfile },
];

const mappers: ReadonlyMap<
  LinkedInProfessionalSnapshotDomain,
  LinkedInSnapshotMapper
> = new Map(
  registrations.map(({ domain, mapper }) => [domain, mapper] as const),
);

export function getLinkedInSnapshotImportDomains(): readonly LinkedInProfessionalSnapshotDomain[] {
  return registrations.map(({ domain }) => domain);
}

export function mapLinkedInSnapshotDomain(
  domain: LinkedInProfessionalSnapshotDomain,
  records: LinkedInSnapshotRecord[],
): ProfessionalProfileImportPatch {
  const mapper = mappers.get(domain);
  if (!mapper)
    throw new Error(`Unsupported LinkedIn snapshot domain: ${domain}`);
  return mapper(records);
}
