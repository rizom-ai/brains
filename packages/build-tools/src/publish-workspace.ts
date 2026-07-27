import {
  preparePublishManifest,
  restorePublishManifest,
} from "./publish-manifest";

/**
 * Prepare every publishable package before a workspace publish command reads
 * its manifest, then restore all source manifests on success or failure.
 */
export async function runWithPreparedPublishManifests<T>(
  packageDirs: readonly string[],
  publish: () => Promise<T>,
): Promise<T> {
  const outcome = await captureOutcome(async () => {
    for (const packageDir of packageDirs) {
      await preparePublishManifest(packageDir);
    }
    return publish();
  });

  const restoreErrors: unknown[] = [];
  for (const packageDir of [...packageDirs].reverse()) {
    try {
      await restorePublishManifest(packageDir, { ifPresent: true });
    } catch (error) {
      restoreErrors.push(error);
    }
  }

  if ("error" in outcome) {
    if (restoreErrors.length > 0) {
      throw new AggregateError(
        [outcome.error, ...restoreErrors],
        "Package publishing failed and one or more source manifests could not be restored",
      );
    }
    throw outcome.error;
  }
  if (restoreErrors.length > 0) {
    throw new AggregateError(
      restoreErrors,
      "One or more source manifests could not be restored after publishing",
    );
  }

  return outcome.value;
}

async function captureOutcome<T>(
  operation: () => Promise<T>,
): Promise<{ value: T } | { error: unknown }> {
  try {
    return { value: await operation() };
  } catch (error) {
    return { error };
  }
}
