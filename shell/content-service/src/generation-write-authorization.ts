import type { BaseEntity, IEntityService } from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import {
  GenerationAuthorizationError,
  type GenerationAccess,
  type GenerationAuthorizer,
} from "./generation-authorization";
import type { ContentGenerationJobData } from "./generation-contracts";

export interface GenerationWriteAuthorizationDependencies {
  authorizer: GenerationAuthorizer;
  templateRegistry: Pick<TemplateRegistry, "get">;
  entityService: Pick<IEntityService, "getEntityTypeConfig">;
}

/**
 * The one authorization routine a durable job runs, shared by the runtime
 * service and its test double so both enforce identical policy. It runs when
 * the job starts and again at the write boundary; the second call passes the
 * final serialized entity so validator-derived visibility or publication
 * changes are judged, and a grant revoked in between is caught by the
 * template and entity-action checks.
 */
export async function authorizeGenerationWrite(
  dependencies: GenerationWriteAuthorizationDependencies,
  data: ContentGenerationJobData,
  persisted?: Readonly<BaseEntity>,
): Promise<GenerationAccess> {
  if (
    persisted &&
    (persisted.id !== data.destination.entityId ||
      persisted.entityType !== data.destination.entityType ||
      persisted.visibility !== data.destination.visibility)
  )
    throw new GenerationAuthorizationError();
  const { authorizer } = dependencies;
  const updating = data.expectedRevision !== null;
  const access = await authorizer.resolve(data.authority);
  const template = dependencies.templateRegistry.get(data.templateName);
  if (!template) throw new GenerationAuthorizationError();
  authorizer.assertTarget(
    access,
    template,
    data.destination.entityType,
    updating,
    data.destination.visibility,
  );
  authorizer.assertWrite(
    access,
    persisted ?? data.destination,
    updating,
    dependencies.entityService,
  );
  return access;
}
