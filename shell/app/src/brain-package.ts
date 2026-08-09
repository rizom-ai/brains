export interface BrainPackageRef {
  /** Package that owns package.json and .env.schema. */
  packageName: string;
  /** Import specifier of the definition export. */
  specifier: string;
}

/**
 * Resolve the canonical definition or an explicitly scoped external package,
 * keeping the owning package together with the definition specifier so no
 * consumer has to re-derive one from the other.
 */
export function resolveBrainPackageRef(rawBrain = "brain"): BrainPackageRef {
  if (
    rawBrain === "brain" ||
    rawBrain === "@rizom/brain" ||
    rawBrain === "@rizom/brain/model"
  ) {
    return { packageName: "@rizom/brain", specifier: "@rizom/brain/model" };
  }
  if (rawBrain.startsWith("@") && !rawBrain.startsWith("@brains/")) {
    const [scope, name] = rawBrain.split("/");
    return {
      packageName: scope && name ? `${scope}/${name}` : rawBrain,
      specifier: rawBrain,
    };
  }
  throw new Error(
    `Unsupported brain definition "${rawBrain}"; run \`brain config migrate\` for a legacy config`,
  );
}

/** Resolve the canonical definition specifier. */
export function resolveBrainPackageName(rawBrain = "brain"): string {
  return resolveBrainPackageRef(rawBrain).specifier;
}
