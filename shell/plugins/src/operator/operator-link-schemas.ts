import { z } from "@brains/utils/zod";
import type { OperatorLinkableEntity } from "./operator-view-contract";
import type { OperatorEntityCatalogDefinition } from "./operator-view-contract";
import {
  operatorIdentifierSchema as identifierSchema,
  operatorRowIdentifierSchema as rowIdentifierSchema,
  operatorLabelSchema as labelSchema,
  operatorShortTextSchema as shortTextSchema,
} from "./operator-view-contract";
import type {
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
} from "./operator-view-runtime-types";

const safeExternalUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "External operator links must use http or https" },
  );

function isEntityDefinition(value: unknown): value is OperatorLinkableEntity {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-entity" &&
    "type" in value &&
    typeof value.type === "string" &&
    value.type.length > 0
  );
}

const entityDefinitionSchema = z.custom<OperatorLinkableEntity>(
  isEntityDefinition,
  { message: "Expected an imported entity definition" },
);

function isEntityCatalogDefinition(
  value: unknown,
): value is OperatorEntityCatalogDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-entity-catalog" &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string"
  );
}

const entityCatalogDefinitionSchema = z.custom<OperatorEntityCatalogDefinition>(
  isEntityCatalogDefinition,
  { message: "Expected an imported entity catalog definition" },
);

function externalLinkTarget(input: {
  readonly external: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "external", href: input.external };
}

function entityLinkTarget(input: {
  readonly entity: OperatorLinkableEntity;
  readonly id: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "entity", entityType: input.entity.type, id: input.id };
}

const launchIntentSchema = z.union([
  z.object({ target: z.literal("account-settings") }).strict(),
  z.object({ target: z.literal("invitations") }).strict(),
  z
    .object({
      target: z.literal("admin-peer-invite"),
      peerId: identifierSchema,
      displayName: labelSchema,
    })
    .strict(),
  z.object({ target: z.literal("inbox") }).strict(),
  z
    .object({
      target: z.literal("inbox"),
      source: z.literal("mail"),
      filter: z
        .enum(["high-priority", "needs-reply", "unclassified"])
        .optional(),
    })
    .strict(),
  z.object({ target: z.literal("publishing") }).strict(),
  z.object({ target: z.literal("site") }).strict(),
  z
    .object({
      target: z.literal("inbox-open-entity"),
      entityType: identifierSchema,
      entityId: identifierSchema,
    })
    .strict(),
  z
    .object({
      target: z.literal("inbox-capture-note"),
      title: shortTextSchema,
      summary: z.string().trim().min(1).max(1_000).optional(),
      entityType: identifierSchema,
      entityId: identifierSchema,
    })
    .strict(),
  z
    .object({
      target: z.literal("inbox-discuss-in-chat"),
      sourceId: identifierSchema,
      itemId: z.string().trim().min(1).max(300),
      label: z.string().trim().min(1).max(160),
    })
    .strict(),
]);

function catalogEntityLinkTarget(input: {
  readonly catalog: OperatorEntityCatalogDefinition;
  readonly entityType: string;
  readonly id: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "entity", entityType: input.entityType, id: input.id };
}

function launchLinkTarget(input: {
  readonly launch: RuntimeOperatorLaunchIntent;
}): RuntimeOperatorLinkTarget {
  return { kind: "launch", launch: input.launch };
}

function detailLinkTarget(input: {
  readonly detail: { readonly itemId: string };
}): RuntimeOperatorLinkTarget {
  return { kind: "detail", itemId: input.detail.itemId };
}

export const linkTargetSchema: z.ZodType<RuntimeOperatorLinkTarget, unknown> =
  z.union([
    z
      .object({ external: safeExternalUrlSchema })
      .strict()
      .transform(externalLinkTarget),
    z
      .object({ entity: entityDefinitionSchema, id: identifierSchema })
      .strict()
      .transform(entityLinkTarget),
    z
      .object({
        catalog: entityCatalogDefinitionSchema,
        entityType: identifierSchema,
        id: identifierSchema,
      })
      .strict()
      .transform(catalogEntityLinkTarget),
    z
      .object({ launch: launchIntentSchema })
      .strict()
      .transform(launchLinkTarget),
    z
      .object({ detail: z.object({ itemId: rowIdentifierSchema }).strict() })
      .strict()
      .transform(detailLinkTarget),
    z
      .object({ kind: z.literal("external"), href: safeExternalUrlSchema })
      .strict(),
    z
      .object({
        kind: z.literal("entity"),
        entityType: identifierSchema,
        id: identifierSchema,
      })
      .strict(),
    z
      .object({ kind: z.literal("launch"), launch: launchIntentSchema })
      .strict(),
    z
      .object({ kind: z.literal("detail"), itemId: rowIdentifierSchema })
      .strict(),
  ]);
