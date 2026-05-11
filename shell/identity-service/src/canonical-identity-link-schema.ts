import { baseEntitySchema } from "@brains/entity-service";
import { z } from "@brains/utils";

export const CANONICAL_IDENTITY_LINK_ENTITY_TYPE = "canonical-identity-link";

export const canonicalIdentityActorSchema = z.object({
  actorId: z.string().min(1),
  interfaceType: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

export type CanonicalIdentityActor = z.infer<
  typeof canonicalIdentityActorSchema
>;

export const canonicalIdentityLinkFrontmatterSchema = z.object({
  canonicalId: z
    .string()
    .regex(
      /^person:[a-z0-9][a-z0-9-]*$/,
      "canonicalId must use person:<slug> format",
    ),
  displayName: z.string().min(1).optional(),
  actors: z.array(canonicalIdentityActorSchema).min(1),
});

export const canonicalIdentityLinkBodySchema =
  canonicalIdentityLinkFrontmatterSchema.superRefine((link, context) => {
    const seen = new Set<string>();
    for (const [index, actor] of link.actors.entries()) {
      if (!seen.has(actor.actorId)) {
        seen.add(actor.actorId);
        continue;
      }
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actors", index, "actorId"],
        message: `Duplicate actorId ${actor.actorId}`,
      });
    }
  });

export type CanonicalIdentityLink = z.infer<
  typeof canonicalIdentityLinkBodySchema
>;

export const canonicalIdentityLinkSchema = baseEntitySchema.extend({
  entityType: z.literal(CANONICAL_IDENTITY_LINK_ENTITY_TYPE),
});

export type CanonicalIdentityLinkEntity = z.infer<
  typeof canonicalIdentityLinkSchema
>;
