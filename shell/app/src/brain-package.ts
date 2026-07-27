export interface BrainPackageResolutionOptions {
  /** Prepared Phase 6 path; callers keep this false until the coordinated crossover. */
  enableCanonicalDefinition?: boolean | undefined;
}

/** Resolve a brain.yaml name to its import package without selecting a model. */
export function resolveBrainPackageName(
  rawBrain: string,
  options: BrainPackageResolutionOptions = {},
): string {
  if (
    options.enableCanonicalDefinition &&
    (rawBrain === "brain" ||
      rawBrain === "@rizom/brain" ||
      rawBrain === "@rizom/brain/model")
  ) {
    return "@rizom/brain/model";
  }
  return rawBrain.startsWith("@") ? rawBrain : `@brains/${rawBrain}`;
}
