import { z } from "@brains/utils/zod";
import { contentVisibilitySchema, type ContentVisibility } from "./visibility";

export type ProjectionJsonValue =
  | null
  | boolean
  | number
  | string
  | ProjectionJsonValue[]
  | ProjectionJsonObject;

export interface ProjectionJsonObject {
  readonly [key: string]: ProjectionJsonValue;
}

export const ProjectionJsonValueSchema: z.ZodType<ProjectionJsonValue> = z.lazy(
  () =>
    z.union([
      z.null(),
      z.boolean(),
      z
        .number()
        .finite()
        .refine(
          (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
          { message: "integer exceeds the JSON-safe range" },
        ),
      z.string(),
      z.array(ProjectionJsonValueSchema),
      z.record(z.string(), ProjectionJsonValueSchema),
    ]),
);

export const ProjectionJsonObjectSchema: z.ZodRecord<
  z.ZodString,
  typeof ProjectionJsonValueSchema
> = z.record(z.string(), ProjectionJsonValueSchema);

export interface ProjectionEntityWrite<
  TMetadata extends ProjectionJsonObject = ProjectionJsonObject,
> {
  id: string;
  entityType: string;
  content: string;
  metadata: TMetadata;
  visibility: ContentVisibility;
}

export type ProjectionWriteIntent<
  TMetadata extends ProjectionJsonObject = ProjectionJsonObject,
> =
  | {
      operation: "upsert";
      entity: ProjectionEntityWrite<TMetadata>;
    }
  | {
      operation: "delete";
      entityType: string;
      id: string;
    };

const ProjectionEntityWriteSchema: z.ZodObject<
  {
    id: z.ZodString;
    entityType: z.ZodString;
    content: z.ZodString;
    metadata: typeof ProjectionJsonObjectSchema;
    visibility: typeof contentVisibilitySchema;
  },
  z.core.$strict
> = z.strictObject({
  id: z.string().trim().min(1),
  entityType: z.string().trim().min(1),
  content: z.string(),
  metadata: ProjectionJsonObjectSchema,
  visibility: contentVisibilitySchema,
});

export const ProjectionWriteIntentSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      {
        operation: z.ZodLiteral<"upsert">;
        entity: typeof ProjectionEntityWriteSchema;
      },
      z.core.$strict
    >,
    z.ZodObject<
      {
        operation: z.ZodLiteral<"delete">;
        entityType: z.ZodString;
        id: z.ZodString;
      },
      z.core.$strict
    >,
  ],
  "operation"
> = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("upsert"),
    entity: ProjectionEntityWriteSchema,
  }),
  z.strictObject({
    operation: z.literal("delete"),
    entityType: z.string().trim().min(1),
    id: z.string().trim().min(1),
  }),
]);
