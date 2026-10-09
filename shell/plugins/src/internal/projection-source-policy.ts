import type { EntityServiceClient } from "@brains/entity-service";
import type { JobEntityAccess } from "../job/job-context-contract";

/** Only detached scalar classification crosses the authoring boundary. */
export function readProjectionSourcePolicy(
  entities: Pick<EntityServiceClient, "getEntityTypeConfig">,
  entityType: string,
): ReturnType<JobEntityAccess["getSourcePolicy"]> {
  const config = entities.getEntityTypeConfig(entityType);
  return Object.freeze({
    projectionSource: config.projectionSource !== false,
    projectionSourceRole:
      config.projectionSourceRole ??
      (config.projectionSource === false ? "excluded" : "primary"),
  });
}
