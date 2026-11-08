import type { CallerAuthority } from "@brains/content-service";

/** The entries a generation is written from, as the runtime records them. */
export interface QueuedGenerationSource {
  entityType: string;
  ids: string[];
}

/** A package job's queued data, as the runtime writes it. */
export interface QueuedPackageJob {
  authority: CallerAuthority;
  input: unknown;
  byPackage?: true;
  entityId?: string;
  source?: QueuedGenerationSource;
}

/**
 * A job the package queued for itself: its own grant is the authority, and
 * the job runs as the package. `entityId` names the entity a generation
 * fills, and `source` the entries it is written from.
 */
export function queuedByPackage(
  pluginId: string,
  input: unknown,
  beside: {
    entityId?: string | undefined;
    source?: QueuedGenerationSource | undefined;
  } = {},
): QueuedPackageJob {
  return {
    authority: {
      actor: { kind: "service", serviceId: pluginId },
      permissionCeiling: "public",
    },
    input,
    byPackage: true,
    ...(beside.entityId !== undefined && { entityId: beside.entityId }),
    ...(beside.source !== undefined && { source: beside.source }),
  };
}
