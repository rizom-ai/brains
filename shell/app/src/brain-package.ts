/** Resolve the canonical definition or an explicitly scoped external package. */
export function resolveBrainPackageName(rawBrain = "brain"): string {
  if (
    rawBrain === "brain" ||
    rawBrain === "@rizom/brain" ||
    rawBrain === "@rizom/brain/model"
  ) {
    return "@rizom/brain/model";
  }
  if (rawBrain.startsWith("@") && !rawBrain.startsWith("@brains/")) {
    return rawBrain;
  }
  throw new Error(
    `Unsupported brain definition "${rawBrain}"; run \`brain config migrate\` for a legacy config`,
  );
}
