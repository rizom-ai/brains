import type { LinkedInSnapshotRecord } from "../linkedin-client";
import {
  mapLinkedInProfile,
  type ProfessionalProfileImportPatch,
} from "./profile-mapper";

export type LinkedInSnapshotMapper = (
  records: LinkedInSnapshotRecord[],
) => ProfessionalProfileImportPatch;

const mappers: ReadonlyMap<string, LinkedInSnapshotMapper> = new Map([
  ["PROFILE", mapLinkedInProfile],
]);

export function mapLinkedInSnapshotDomain(
  domain: string,
  records: LinkedInSnapshotRecord[],
): ProfessionalProfileImportPatch {
  const mapper = mappers.get(domain);
  if (!mapper)
    throw new Error(`Unsupported LinkedIn snapshot domain: ${domain}`);
  return mapper(records);
}
