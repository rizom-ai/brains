import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import { z } from "@brains/utils/zod";

export type RuntimeOperatorScalar = string | number | boolean | null;
export type RuntimeOperatorTone = "good" | "warn" | "neutral" | "error";

export type RuntimeOperatorLinkTarget =
  | { readonly kind: "external"; readonly href: string }
  | {
      readonly kind: "entity";
      readonly entityType: string;
      readonly id: string;
    };

export interface RuntimeOperatorStatItem {
  readonly label: string;
  readonly value: string | number;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorStatsBlock {
  readonly type: "stats";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorStatItem[];
}

export interface RuntimeOperatorKeyValueItem {
  readonly label: string;
  readonly value: RuntimeOperatorScalar;
}

export interface RuntimeOperatorKeyValuesBlock {
  readonly type: "key-values";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorKeyValueItem[];
}

export interface RuntimeOperatorNoticeBlock {
  readonly type: "notice";
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly text: string;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorLinkItem {
  readonly label: string;
  readonly target: RuntimeOperatorLinkTarget;
}

export interface RuntimeOperatorLinksBlock {
  readonly type: "links";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorLinkItem[];
}

export interface RuntimeOperatorListItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly meta?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
  readonly link?: RuntimeOperatorLinkTarget | undefined;
}

export interface RuntimeOperatorListBlock {
  readonly type: "list";
  readonly id: string;
  readonly empty: string;
  readonly items: readonly RuntimeOperatorListItem[];
}

export interface RuntimeOperatorTableColumn {
  readonly key: string;
  readonly label: string;
  readonly align?: "start" | "center" | "end" | undefined;
}

export interface RuntimeOperatorTableFilter {
  readonly key: string;
  readonly label: string;
  readonly values: readonly RuntimeOperatorScalar[];
}

export interface RuntimeOperatorTableRow {
  readonly id: string;
  readonly cells: Readonly<
    Record<string, RuntimeOperatorScalar | readonly string[]>
  >;
  readonly link?: RuntimeOperatorLinkTarget | undefined;
}

export interface RuntimeOperatorTableBlock {
  readonly type: "table";
  readonly id: string;
  readonly empty: string;
  readonly filters?: readonly RuntimeOperatorTableFilter[] | undefined;
  readonly columns: readonly RuntimeOperatorTableColumn[];
  readonly rows: readonly RuntimeOperatorTableRow[];
}

export type RuntimeDashboardOperatorBlock =
  | RuntimeOperatorStatsBlock
  | RuntimeOperatorKeyValuesBlock
  | RuntimeOperatorNoticeBlock
  | RuntimeOperatorLinksBlock
  | RuntimeOperatorListBlock
  | RuntimeOperatorTableBlock;

export interface RuntimeDashboardOperatorView {
  readonly title?: string | undefined;
  readonly blocks: readonly RuntimeDashboardOperatorBlock[];
}

export interface RuntimeDashboardDigest {
  readonly items: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly attention?: number | undefined;
}

export interface RuntimeDashboardWidgetData {
  readonly view: RuntimeDashboardOperatorView;
  readonly digest?: RuntimeDashboardDigest | undefined;
}

export interface RuntimeOperatorValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type RuntimeOperatorParseResult<T> =
  | { readonly success: true; readonly data: T }
  | {
      readonly success: false;
      readonly issues: readonly RuntimeOperatorValidationIssue[];
    };

const identifierSchema = z.string().trim().min(1).max(120);
const labelSchema = z.string().trim().min(1).max(160);
const shortTextSchema = z.string().max(500);
const textSchema = z.string().max(4_000);
const toneSchema = z.enum(["good", "warn", "neutral", "error"]);
const scalarSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

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

function isEntityDefinition(value: unknown): value is AnyEntityDefinition {
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

const entityDefinitionSchema = z.custom<AnyEntityDefinition>(
  isEntityDefinition,
  { message: "Expected an imported entity definition" },
);

function externalLinkTarget(input: {
  readonly external: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "external", href: input.external };
}

function entityLinkTarget(input: {
  readonly entity: AnyEntityDefinition;
  readonly id: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "entity", entityType: input.entity.type, id: input.id };
}

const linkTargetSchema: z.ZodType<RuntimeOperatorLinkTarget, unknown> = z.union(
  [
    z
      .object({ external: safeExternalUrlSchema })
      .strict()
      .transform(externalLinkTarget),
    z
      .object({ entity: entityDefinitionSchema, id: identifierSchema })
      .strict()
      .transform(entityLinkTarget),
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
  ],
);

const statItemSchema = z
  .object({
    label: labelSchema,
    value: z.union([z.string().max(500), z.number().finite()]),
    tone: toneSchema.optional(),
  })
  .strict();

const keyValueItemSchema = z
  .object({ label: labelSchema, value: scalarSchema })
  .strict();

const statsBlockSchema = z
  .object({
    type: z.literal("stats"),
    id: identifierSchema.optional(),
    items: z.array(statItemSchema).max(20),
  })
  .strict();

const keyValuesBlockSchema = z
  .object({
    type: z.literal("key-values"),
    id: identifierSchema.optional(),
    items: z.array(keyValueItemSchema).max(40),
  })
  .strict();

const noticeBlockSchema = z
  .object({
    type: z.literal("notice"),
    id: identifierSchema.optional(),
    title: labelSchema.optional(),
    text: textSchema,
    tone: toneSchema.optional(),
  })
  .strict();

const linksBlockSchema = z
  .object({
    type: z.literal("links"),
    id: identifierSchema.optional(),
    items: z
      .array(
        z.object({ label: labelSchema, target: linkTargetSchema }).strict(),
      )
      .max(30),
  })
  .strict();

const listItemSchema = z
  .object({
    id: identifierSchema,
    title: shortTextSchema,
    description: textSchema.optional(),
    meta: shortTextSchema.optional(),
    tone: toneSchema.optional(),
    link: linkTargetSchema.optional(),
  })
  .strict();

const listBlockSchema = z
  .object({
    type: z.literal("list"),
    id: identifierSchema,
    empty: shortTextSchema,
    items: z.array(listItemSchema).max(200),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, item] of block.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `List item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
  });

const tableColumnSchema = z
  .object({
    key: identifierSchema,
    label: labelSchema,
    align: z.enum(["start", "center", "end"]).optional(),
  })
  .strict();
const tableFilterSchema = z
  .object({
    key: identifierSchema,
    label: labelSchema,
    values: z.array(scalarSchema).max(50),
  })
  .strict();
const tableCellSchema = z.union([
  scalarSchema,
  z.array(z.string().max(500)).max(50),
]);
const tableRowSchema = z
  .object({
    id: identifierSchema,
    cells: z.record(z.string(), tableCellSchema),
    link: linkTargetSchema.optional(),
  })
  .strict();

const tableBlockSchema = z
  .object({
    type: z.literal("table"),
    id: identifierSchema,
    empty: shortTextSchema,
    filters: z.array(tableFilterSchema).max(20).optional(),
    columns: z.array(tableColumnSchema).min(1).max(30),
    rows: z.array(tableRowSchema).max(500),
  })
  .strict()
  .superRefine((block, context) => {
    const columnKeys = new Set<string>();
    for (const [index, column] of block.columns.entries()) {
      if (columnKeys.has(column.key)) {
        context.addIssue({
          code: "custom",
          message: `Table column key "${column.key}" is duplicated`,
          path: ["columns", index, "key"],
        });
      }
      columnKeys.add(column.key);
    }
    for (const [index, filter] of (block.filters ?? []).entries()) {
      if (!columnKeys.has(filter.key)) {
        context.addIssue({
          code: "custom",
          message: `Table filter key "${filter.key}" has no matching column`,
          path: ["filters", index, "key"],
        });
      }
    }
    const rowIds = new Set<string>();
    for (const [rowIndex, row] of block.rows.entries()) {
      if (rowIds.has(row.id)) {
        context.addIssue({
          code: "custom",
          message: `Table row id "${row.id}" is duplicated`,
          path: ["rows", rowIndex, "id"],
        });
      }
      rowIds.add(row.id);
      for (const key of Object.keys(row.cells)) {
        if (!columnKeys.has(key)) {
          context.addIssue({
            code: "custom",
            message: `Table cell key "${key}" has no matching column`,
            path: ["rows", rowIndex, "cells", key],
          });
        }
      }
    }
  });

const viewSchema: z.ZodType<RuntimeDashboardOperatorView, unknown> = z
  .object({
    title: shortTextSchema.optional(),
    blocks: z
      .array(
        z.union([
          statsBlockSchema,
          keyValuesBlockSchema,
          noticeBlockSchema,
          linksBlockSchema,
          listBlockSchema,
          tableBlockSchema,
        ]),
      )
      .max(50),
  })
  .strict()
  .superRefine((view, context) => {
    const ids = new Set<string>();
    for (const [index, block] of view.blocks.entries()) {
      if (block.id === undefined) continue;
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          message: `Operator view block id "${block.id}" is duplicated`,
          path: ["blocks", index, "id"],
        });
      }
      ids.add(block.id);
    }
  });

const digestSchema: z.ZodType<RuntimeDashboardDigest, unknown> = z
  .object({
    items: z
      .array(
        z.object({ label: labelSchema, value: z.string().max(500) }).strict(),
      )
      .max(4),
    attention: z.number().int().nonnegative().optional(),
  })
  .strict();

const widgetDataSchema: z.ZodType<RuntimeDashboardWidgetData, unknown> = z
  .object({ view: viewSchema, digest: digestSchema.optional() })
  .strict();

function validationIssues(
  error: z.ZodError,
): readonly RuntimeOperatorValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

export function safeParseRuntimeDashboardOperatorView(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardOperatorView> {
  const result = viewSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}

export function safeParseRuntimeDashboardDigest(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardDigest> {
  const result = digestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}

export function safeParseRuntimeDashboardWidgetData(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardWidgetData> {
  const result = widgetDataSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
