import { z } from "@brains/utils/zod";
import {
  canonicalContentVisibilitySchema,
  entityWriteAdmissionSchema,
  type EntityWriteAdmission,
  type EntityWriteAdmissions,
} from "@brains/entity-service";
import {
  generationAuthoritySchema,
  GenerationAuthorizationError,
} from "./generation-authorization";
import type { ContentGenerationJobData } from "./generation-contracts";
import type { ContentService } from "./types";

const name = "content:generation";
const payloadSchema = z.strictObject({
  authority: generationAuthoritySchema,
  templateName: z.string().min(1),
  expectedRevision: z.string().min(1).nullable(),
  destination: z.strictObject({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    visibility: canonicalContentVisibilitySchema,
  }),
});

/** No prompt, generated content or caller metadata is duplicated in admission. */
export function generationWriteAdmission(
  data: ContentGenerationJobData,
): EntityWriteAdmission {
  const authority = generationAuthoritySchema.parse(data.authority);
  const actor =
    authority.actor.kind === "user"
      ? {
          kind: authority.actor.kind,
          userId: authority.actor.userId,
          ...(authority.actor.canonicalId !== undefined && {
            canonicalId: authority.actor.canonicalId,
          }),
        }
      : authority.actor;
  return entityWriteAdmissionSchema.parse({
    name,
    payload: {
      authority: {
        actor,
        permissionCeiling: authority.permissionCeiling,
        ...(authority.principalId !== undefined && {
          principalId: authority.principalId,
        }),
      },
      templateName: data.templateName,
      expectedRevision: data.expectedRevision,
      destination: {
        entityType: data.destination.entityType,
        entityId: data.destination.entityId,
        visibility: data.destination.visibility,
      },
    },
  });
}

/** Bind to the owner's current authorizer, not a worker's earlier grant. */
export function registerGenerationWriteAdmission(
  admissions: EntityWriteAdmissions,
  content: Pick<ContentService, "authorizeGenerationWrite">,
): () => void {
  return admissions.register(
    name,
    payloadSchema,
    async ({ entity, operation }, payload): Promise<void> => {
      if (
        operation !== (payload.expectedRevision === null ? "create" : "update")
      )
        throw new GenerationAuthorizationError();
      await content.authorizeGenerationWrite(
        {
          ...payload,
          destination: { ...payload.destination, metadata: entity.metadata },
        },
        entity,
      );
    },
  );
}
