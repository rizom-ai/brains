export const PACKED_COMPATIBILITY_EVIDENCE_ENV =
  "RIZOM_PUBLIC_API_PACKED_EVIDENCE";
export const PACKED_BRAIN_TARBALL_ENV = "RIZOM_PUBLIC_API_PACKED_BRAIN_TARBALL";

export function packedCompatibilityEvidenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PACKED_COMPATIBILITY_EVIDENCE_ENV] === "1";
}

export function packedBrainTarball(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[PACKED_BRAIN_TARBALL_ENV]?.trim();
  return value === "" ? undefined : value;
}
