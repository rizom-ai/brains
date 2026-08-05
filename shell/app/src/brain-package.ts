/** Resolve the package root that owns a definition export. */
export function resolveBrainPackageRootName(packageName: string): string {
  const parts = packageName.split("/");
  if (packageName.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : packageName;
  }
  return parts[0] ?? packageName;
}

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
