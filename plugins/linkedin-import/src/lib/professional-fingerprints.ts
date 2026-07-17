import type {
  ProfessionalCertification,
  ProfessionalEducation,
  ProfessionalPosition,
} from "@brains/plugins";

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fingerprint(kind: string, values: Array<string | undefined>): string {
  return JSON.stringify([kind, ...values.map(normalized)]);
}

/** Match equivalent skill labels without making display casing provider-owned. */
export function skillFingerprint(skill: string): string {
  return fingerprint("skill", [skill]);
}

/** Stable identity for a position; descriptive fields deliberately do not participate. */
export function positionFingerprint(position: ProfessionalPosition): string {
  return fingerprint("position", [
    position.companyName,
    position.title,
    position.startedOn,
  ]);
}

/** Stable identity for one education record across source refreshes. */
export function educationFingerprint(education: ProfessionalEducation): string {
  return fingerprint("education", [
    education.schoolName,
    education.degreeName,
    education.fieldOfStudy,
    education.startedOn,
  ]);
}

/** Prefer credential identity when available, with a deterministic semantic fallback. */
export function certificationFingerprint(
  certification: ProfessionalCertification,
): string {
  if (certification.credentialId?.trim()) {
    return fingerprint("certification-credential", [
      certification.issuingOrganization,
      certification.credentialId,
    ]);
  }
  return fingerprint("certification", [
    certification.name,
    certification.issuingOrganization,
    certification.issuedOn,
  ]);
}
