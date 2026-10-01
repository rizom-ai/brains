import { z } from "@brains/utils/zod";
import type { AnyWorkspaceActionDefinition } from "./workspace-action-definition-contract";
import { operatorFieldControlSchema } from "./operator-field-contract";
import { linkTargetSchema } from "./operator-link-schemas";
import { spatialBlockSchema } from "./operator-spatial-schemas";
import type { StudioViewSource } from "./operator-studio-source-types";
import { validationIssues } from "./operator-view-diagnostics";
import {
  operatorIdentifierSchema as identifierSchema,
  operatorRowIdentifierSchema as rowIdentifierSchema,
  operatorLabelSchema as labelSchema,
  operatorShortTextSchema as shortTextSchema,
  operatorTextSchema as textSchema,
  operatorToneSchema as toneSchema,
  operatorScalarSchema as scalarSchema,
  operatorStatsBlockSchema as statsBlockSchema,
  operatorKeyValuesBlockSchema as keyValuesBlockSchema,
  operatorNoticeBlockSchema as noticeBlockSchema,
  operatorTextBlockSchema as textBlockSchema,
  operatorMeterBlockSchema as meterBlockSchema,
  operatorProgressBlockSchema as progressBlockSchema,
} from "./operator-view-contract";
import type {
  RuntimeDashboardOperatorView,
  RuntimeDashboardDigest,
  RuntimeDashboardWidgetData,
  RuntimeOperatorParseResult,
} from "./operator-view-runtime-types";

const groupItemSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    value: scalarSchema.optional(),
    description: textSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict();
const groupBlockSchema = z
  .object({
    type: z.literal("group"),
    id: identifierSchema,
    label: labelSchema,
    items: z.array(groupItemSchema).max(50),
  })
  .strict();
const flowStepSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    status: z.enum(["idle", "active", "complete", "failed"]),
    detail: shortTextSchema.optional(),
  })
  .strict();
const flowBlockSchema = z
  .object({
    type: z.literal("flow"),
    id: identifierSchema,
    label: labelSchema,
    direction: z.enum(["forward", "bidirectional"]).optional(),
    steps: z.array(flowStepSchema).min(2).max(20),
  })
  .strict();

const queryKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-zA-Z0-9_.-]*$/);
const queryOptionSchema = z
  .object({
    value: labelSchema,
    label: labelSchema,
    count: z.number().int().nonnegative().optional(),
  })
  .strict();
const queryControlSchema = z
  .object({
    key: queryKeySchema,
    label: labelSchema,
    value: labelSchema.optional(),
    allLabel: labelSchema.optional(),
    options: z.array(queryOptionSchema).max(100),
  })
  .strict();
const queryDefinitionSchema = z
  .object({
    controls: z.array(queryControlSchema).max(20),
    pagination: z
      .object({
        offset: z.number().int().nonnegative(),
        limit: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
        label: labelSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const queryBlockSchema = queryDefinitionSchema
  .extend({
    type: z.literal("query"),
    id: identifierSchema,
  })
  .strict()
  .superRefine((block, context) => {
    const keys = new Set<string>();
    for (const [index, control] of block.controls.entries()) {
      if (keys.has(control.key)) {
        context.addIssue({
          code: "custom",
          message: `Query key "${control.key}" is duplicated`,
          path: ["controls", index, "key"],
        });
      }
      keys.add(control.key);
    }
  });

const tableQuerySchema = queryDefinitionSchema.superRefine((query, context) => {
  const keys = new Set<string>();
  for (const [index, control] of query.controls.entries()) {
    if (keys.has(control.key)) {
      context.addIssue({
        code: "custom",
        message: `Query key "${control.key}" is duplicated`,
        path: ["controls", index, "key"],
      });
    }
    keys.add(control.key);
  }
});

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

const badgeSchema = z
  .object({ label: labelSchema, tone: toneSchema.optional() })
  .strict();
const listFilterOptionSchema = z
  .object({
    value: identifierSchema,
    label: labelSchema,
    count: z.number().int().nonnegative().optional(),
    emphasis: z.literal("gap").optional(),
  })
  .strict();
const MAX_LIST_ITEMS = 200;
const MAX_LIST_ITEM_FILTER_VALUES = 50;
// A complete facet set can contain one option for every distinct membership
// across the bounded list, plus its all-value. Keep the payload fail-closed
// without forcing providers to silently truncate canonical facets.
const MAX_LIST_FILTER_OPTIONS =
  MAX_LIST_ITEMS * MAX_LIST_ITEM_FILTER_VALUES + 1;

const listFilterSchema = z
  .object({
    label: labelSchema,
    defaultValue: identifierSchema,
    allValue: identifierSchema.optional(),
    options: z
      .array(listFilterOptionSchema)
      .min(1)
      .max(MAX_LIST_FILTER_OPTIONS),
  })
  .strict()
  .superRefine((filter, context) => {
    const values = new Set<string>();
    for (const [index, option] of filter.options.entries()) {
      if (values.has(option.value)) {
        context.addIssue({
          code: "custom",
          message: `List filter value "${option.value}" is duplicated`,
          path: ["options", index, "value"],
        });
      }
      values.add(option.value);
    }
    if (!values.has(filter.defaultValue)) {
      context.addIssue({
        code: "custom",
        message: `List filter default "${filter.defaultValue}" has no matching option`,
        path: ["defaultValue"],
      });
    }
  });

const listItemSchema = z
  .object({
    id: rowIdentifierSchema,
    title: shortTextSchema,
    description: textSchema.optional(),
    meta: shortTextSchema.optional(),
    metadata: z.array(shortTextSchema).max(20).optional(),
    tags: z.array(labelSchema).max(30).optional(),
    count: z.number().finite().optional(),
    badges: z.array(badgeSchema).max(10).optional(),
    filterValues: z
      .array(identifierSchema)
      .max(MAX_LIST_ITEM_FILTER_VALUES)
      .optional(),
    links: z
      .array(
        z.object({ label: labelSchema, target: linkTargetSchema }).strict(),
      )
      .max(10)
      .optional(),
    tone: toneSchema.optional(),
    link: linkTargetSchema.optional(),
  })
  .strict();

const listPresentationSchema = z.enum([
  "standard",
  "editorial",
  "attention",
  "activity",
]);
const listBlockSchema = z
  .object({
    type: z.literal("list"),
    id: identifierSchema,
    empty: shortTextSchema,
    presentation: listPresentationSchema.optional(),
    filter: listFilterSchema.optional(),
    items: z.array(listItemSchema).max(MAX_LIST_ITEMS),
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
    if (block.filter) {
      const optionValues = new Set(
        block.filter.options.map((option) => option.value),
      );
      const allValue = block.filter.allValue ?? "all";
      for (const [index, item] of block.items.entries()) {
        for (const value of item.filterValues ?? []) {
          if (value !== allValue && !optionValues.has(value)) {
            context.addIssue({
              code: "custom",
              message: `List item filter value "${value}" has no matching option`,
              path: ["items", index, "filterValues"],
            });
          }
        }
      }
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
const tableCompactRowSchema = z
  .object({
    title: shortTextSchema.trim().min(1),
    description: textSchema.optional(),
    metadata: z.array(shortTextSchema).max(20).optional(),
    badges: z.array(badgeSchema).max(10).optional(),
    count: z.number().finite().optional(),
    tone: toneSchema.optional(),
  })
  .strict();
const tableRowSchema = z
  .object({
    id: rowIdentifierSchema,
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

const matrixCellSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    tone: toneSchema.optional(),
    empty: shortTextSchema,
    items: z.array(listItemSchema).max(100),
  })
  .strict()
  .superRefine((cell, context) => {
    const ids = new Set<string>();
    for (const [index, item] of cell.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
  });
const matrixBlockSchema = z
  .object({
    type: z.literal("matrix"),
    id: identifierSchema,
    columns: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    cells: z.array(matrixCellSchema).min(1).max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, cell] of block.cells.entries()) {
      if (ids.has(cell.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix cell id "${cell.id}" is duplicated`,
          path: ["cells", index, "id"],
        });
      }
      ids.add(cell.id);
    }
  });

const dashboardPanelBlockSchema = z.union([
  statsBlockSchema,
  keyValuesBlockSchema,
  noticeBlockSchema,
  groupBlockSchema,
  flowBlockSchema,
  meterBlockSchema,
  progressBlockSchema,
  linksBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  spatialBlockSchema,
]);
const dashboardTabsBlockSchema = z
  .object({
    type: z.literal("tabs"),
    id: identifierSchema,
    label: labelSchema,
    defaultTab: identifierSchema,
    tabs: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: labelSchema,
            count: z.number().int().nonnegative().optional(),
            blocks: z.array(dashboardPanelBlockSchema).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, tab] of block.tabs.entries()) {
      if (ids.has(tab.id)) {
        context.addIssue({
          code: "custom",
          message: `Tab id "${tab.id}" is duplicated`,
          path: ["tabs", index, "id"],
        });
      }
      ids.add(tab.id);
    }
    if (!ids.has(block.defaultTab)) {
      context.addIssue({
        code: "custom",
        message: `Default tab "${block.defaultTab}" has no matching tab`,
        path: ["defaultTab"],
      });
    }
  });

function isWorkspaceActionDefinition(
  value: unknown,
): value is AnyWorkspaceActionDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-workspace-action" &&
    "name" in value &&
    typeof value.name === "string" &&
    "input" in value &&
    typeof value.input === "object" &&
    value.input !== null &&
    "safeParse" in value.input &&
    typeof value.input.safeParse === "function"
  );
}

const workspaceActionDefinitionSchema = z.custom<AnyWorkspaceActionDefinition>(
  isWorkspaceActionDefinition,
  { message: "Expected a workspace action definition" },
);

const capabilityDefinitionSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    description: textSchema.optional(),
    confirmation: z.literal("prepared").optional(),
  })
  .strict();
const actionFormOptionSchema = z
  .object({ value: z.string().trim().min(1).max(500), label: labelSchema })
  .strict();
const actionFormFieldSchema = z
  .object({
    label: labelSchema,
    control: operatorFieldControlSchema,
    secret: z.boolean().optional(),
    options: z.array(actionFormOptionSchema).min(1).max(100).optional(),
    labelBy: z
      .object({
        field: identifierSchema,
        values: z.array(actionFormOptionSchema).min(1).max(100),
      })
      .strict()
      .optional(),
  })
  .strict();
const actionFormSchema = z
  .object({
    presentation: z.enum(["inline", "disclosure"]).optional(),
    submitLabel: labelSchema.optional(),
    fields: z.record(identifierSchema, actionFormFieldSchema),
  })
  .strict();
const actionResultFieldSchema = z
  .object({
    label: labelSchema,
    copyable: z.boolean().optional(),
    sensitive: z.boolean().optional(),
  })
  .strict();
const actionResultSchema = z
  .object({
    title: labelSchema,
    fields: z.record(identifierSchema, actionResultFieldSchema),
  })
  .strict();
const sourceActionControlSchema = z
  .object({
    action: workspaceActionDefinitionSchema,
    input: z.unknown().optional(),
    form: actionFormSchema.optional(),
    result: actionResultSchema.optional(),
    capability: capabilityDefinitionSchema.optional(),
    label: labelSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

const studioListItemSchema = listItemSchema.extend({
  actionsLabel: labelSchema.optional(),
  actions: z.array(sourceActionControlSchema).max(20).optional(),
});
const studioListBlockSchema = z
  .object({
    type: z.literal("list"),
    id: identifierSchema,
    empty: shortTextSchema,
    presentation: listPresentationSchema.optional(),
    filter: listFilterSchema.optional(),
    items: z.array(studioListItemSchema).max(MAX_LIST_ITEMS),
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
    if (block.filter) {
      const optionValues = new Set(
        block.filter.options.map((option) => option.value),
      );
      const allValue = block.filter.allValue ?? "all";
      for (const [index, item] of block.items.entries()) {
        for (const value of item.filterValues ?? []) {
          if (value !== allValue && !optionValues.has(value)) {
            context.addIssue({
              code: "custom",
              message: `List item filter value "${value}" has no matching option`,
              path: ["items", index, "filterValues"],
            });
          }
        }
      }
    }
  });

const studioTableRowSchema = tableRowSchema.extend({
  compact: tableCompactRowSchema.optional(),
  actions: z.array(sourceActionControlSchema).max(20).optional(),
});
const studioTableBlockSchema = z
  .object({
    type: z.literal("table"),
    id: identifierSchema,
    empty: shortTextSchema,
    filters: z.array(tableFilterSchema).max(20).optional(),
    query: tableQuerySchema.optional(),
    columns: z.array(tableColumnSchema).min(1).max(30),
    rows: z.array(studioTableRowSchema).max(500),
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

const studioMatrixCellSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    tone: toneSchema.optional(),
    empty: shortTextSchema,
    items: z.array(studioListItemSchema).max(100),
  })
  .strict()
  .superRefine((cell, context) => {
    const ids = new Set<string>();
    for (const [index, item] of cell.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
  });
const studioMatrixBlockSchema = z
  .object({
    type: z.literal("matrix"),
    id: identifierSchema,
    columns: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    cells: z.array(studioMatrixCellSchema).min(1).max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, cell] of block.cells.entries()) {
      if (ids.has(cell.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix cell id "${cell.id}" is duplicated`,
          path: ["cells", index, "id"],
        });
      }
      ids.add(cell.id);
    }
  });

const studioActionBlockSchema = sourceActionControlSchema.extend({
  type: z.literal("action"),
  id: identifierSchema.optional(),
});
const studioActionsBlockSchema = z
  .object({
    type: z.literal("actions"),
    id: identifierSchema.optional(),
    items: z.array(sourceActionControlSchema).max(30),
  })
  .strict();
const studioPanelBlockSchema = z.union([
  statsBlockSchema,
  keyValuesBlockSchema,
  noticeBlockSchema,
  textBlockSchema,
  groupBlockSchema,
  flowBlockSchema,
  meterBlockSchema,
  progressBlockSchema,
  queryBlockSchema,
  linksBlockSchema,
  studioListBlockSchema,
  studioTableBlockSchema,
  studioMatrixBlockSchema,
  spatialBlockSchema,
  studioActionBlockSchema,
  studioActionsBlockSchema,
]);
const studioTabsBlockSchema = z
  .object({
    type: z.literal("tabs"),
    id: identifierSchema,
    label: labelSchema,
    defaultTab: identifierSchema,
    queryKey: identifierSchema.optional(),
    tabs: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: labelSchema,
            count: z.number().int().nonnegative().optional(),
            blocks: z
              .array(
                z.lazy(() =>
                  z.union([
                    studioPanelBlockSchema,
                    studioCardBlockSchema,
                    studioDetailBlockSchema,
                    studioColumnsBlockSchema,
                  ]),
                ),
              )
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, tab] of block.tabs.entries()) {
      if (ids.has(tab.id)) {
        context.addIssue({
          code: "custom",
          message: `Tab id "${tab.id}" is duplicated`,
          path: ["tabs", index, "id"],
        });
      }
      ids.add(tab.id);
    }
    if (!ids.has(block.defaultTab)) {
      context.addIssue({
        code: "custom",
        message: `Default tab "${block.defaultTab}" has no matching tab`,
        path: ["defaultTab"],
      });
    }
  });

/**
 * Master/detail is a container in the same closed union as tabs: one collection
 * plus the panels of whichever row is open. Nesting stays one level deep, and
 * the open row is identified rather than flagged per item, so selection cannot
 * disagree with the content it describes.
 */
/* A card groups panels under one caption so a group of related facts reads
   as one thing rather than as loose blocks. */
const studioCardBlockSchema = z
  .object({
    disclosureLabel: labelSchema.optional(),
    type: z.literal("card"),
    id: identifierSchema,
    label: labelSchema,
    presentation: z.enum(["section", "disclosure", "feature"]).optional(),
    metadata: z.array(shortTextSchema).max(20).optional(),
    tone: toneSchema.optional(),
    blocks: z.array(studioPanelBlockSchema).max(12),
  })
  .strict()
  .refine(
    (block) =>
      block.disclosureLabel === undefined ||
      block.presentation === "disclosure",
    {
      message: "disclosureLabel requires disclosure presentation",
      path: ["disclosureLabel"],
    },
  );

const studioDetailBlockSchema = z
  .object({
    type: z.literal("detail"),
    id: identifierSchema,
    /** Canonical query field the host writes with the open row's id. */
    queryKey: identifierSchema,
    empty: shortTextSchema,
    master: z.union([studioListBlockSchema, studioTableBlockSchema]),
    open: z
      .object({
        forId: rowIdentifierSchema,
        title: labelSchema,
        blocks: z
          .array(z.union([studioPanelBlockSchema, studioCardBlockSchema]))
          .max(30),
      })
      .strict()
      .optional(),
  })
  .strict();

/* A card groups panels under one caption so an aside reads as a stack of
   related facts rather than loose blocks. */
/* `forId` marks the open row where the master contains it. It is deliberately
   not required to match: a paged or filtered collection can hold a selection
   whose row is not in the current window, and losing the reading pane because
   the operator turned a page would be worse than an unmarked list. */

/* The composition every operator surface wants: a column of work beside a rail
   of standing facts. Regions hold panels and cards, one level deep. */
const studioColumnsBlockSchema = z
  .object({
    type: z.literal("columns"),
    id: identifierSchema,
    primary: z
      .array(z.union([studioPanelBlockSchema, studioCardBlockSchema]))
      .max(20),
    aside: z
      .array(z.union([studioPanelBlockSchema, studioCardBlockSchema]))
      .max(12),
  })
  .strict();

const studioViewSourceSchema = z
  .object({
    kicker: labelSchema.optional(),
    title: shortTextSchema.optional(),
    description: textSchema.optional(),
    status: z
      .object({
        label: labelSchema,
        detail: shortTextSchema.optional(),
        tone: toneSchema.optional(),
      })
      .strict()
      .optional(),
    primaryAction: sourceActionControlSchema.optional(),
    blocks: z
      .array(
        z.union([
          studioPanelBlockSchema,
          studioTabsBlockSchema,
          studioDetailBlockSchema,
          studioColumnsBlockSchema,
          studioCardBlockSchema,
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

const viewSchema: z.ZodObject<
  {
    title: z.ZodOptional<typeof shortTextSchema>;
    blocks: z.ZodArray<
      z.ZodUnion<
        readonly [
          typeof dashboardPanelBlockSchema,
          typeof dashboardTabsBlockSchema,
        ]
      >
    >;
  },
  z.core.$strict
> = z
  .object({
    title: shortTextSchema.optional(),
    blocks: z
      .array(z.union([dashboardPanelBlockSchema, dashboardTabsBlockSchema]))
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

const digestSchema: z.ZodObject<
  {
    items: z.ZodArray<
      z.ZodObject<
        {
          label: typeof labelSchema;
          value: z.ZodString;
          tone: z.ZodOptional<z.ZodEnum<{ good: "good"; warn: "warn" }>>;
        },
        z.core.$strict
      >
    >;
    attention: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strict
> = z
  .object({
    items: z
      .array(
        z
          .object({
            label: labelSchema,
            value: z.string().max(500),
            tone: z.enum(["good", "warn"]).optional(),
          })
          .strict(),
      )
      .max(4),
    attention: z.number().int().nonnegative().optional(),
  })
  .strict();

const widgetDataSchema: z.ZodObject<
  { view: typeof viewSchema; digest: z.ZodOptional<typeof digestSchema> },
  z.core.$strict
> = z.object({ view: viewSchema, digest: digestSchema.optional() }).strict();

// Closed parser return types check schema output against the renderer contracts.
export function parseDashboardView(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardOperatorView> {
  const result = viewSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
export function parseDashboardDigest(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardDigest> {
  const result = digestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
export function parseDashboardWidgetData(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardWidgetData> {
  const result = widgetDataSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
export function parseStudioViewSource(
  input: unknown,
): RuntimeOperatorParseResult<StudioViewSource> {
  const result = studioViewSourceSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
