import type { UserPermissionLevel } from "@brains/templates";
import type { AnyWorkspaceActionDefinition } from "./workspace-action-definition-contract";
import type {
  StudioBlockSource,
  StudioRegionSource,
} from "./operator-studio-source-types";
import { normalizeActionControls } from "./operator-action-normalization";
import { definedFields } from "@brains/utils/strip-undefined";
import type {
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorActionBlock,
  RuntimeStudioOperatorPanelBlock,
  RuntimeStudioOperatorDetailBlock,
  RuntimeStudioOperatorCardBlock,
  RuntimeStudioOperatorRegionBlock,
  RuntimeStudioOperatorColumnsBlock,
  RuntimeStudioOperatorBlock,
  RuntimeOperatorValidationIssue,
} from "./operator-view-runtime-types";

/** Panels may nest in containers; containers may not nest in each other. */
function isPanelBlock(
  block: RuntimeStudioOperatorBlock,
): block is RuntimeStudioOperatorPanelBlock {
  return (
    block.type !== "tabs" &&
    block.type !== "detail" &&
    block.type !== "columns" &&
    block.type !== "card"
  );
}

function actionBlock(
  action: RuntimeOperatorActionControl,
  id: string | undefined,
): RuntimeStudioOperatorActionBlock {
  return {
    type: "action",
    ...(id ? { id } : {}),
    ...action,
  };
}

export function normalizeStudioBlock(
  block: StudioBlockSource | StudioRegionSource,
  blockIndex: number,
  declared: readonly AnyWorkspaceActionDefinition[],
  permission: UserPermissionLevel,
): {
  readonly block?: RuntimeStudioOperatorBlock | undefined;
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  switch (block.type) {
    case "list": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const items = block.items.map((item, itemIndex) => {
        const actions = normalizeActionControls(
          item.actions ?? [],
          declared,
          permission,
          ["blocks", blockIndex, "items", itemIndex, "actions"],
        );
        issues.push(...actions.issues);
        return {
          id: item.id,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          ...(item.meta ? { meta: item.meta } : {}),
          ...(item.metadata ? { metadata: item.metadata } : {}),
          ...(item.tags ? { tags: item.tags } : {}),
          ...definedFields({ count: item.count }),
          ...(item.badges ? { badges: item.badges } : {}),
          ...(item.filterValues ? { filterValues: item.filterValues } : {}),
          ...(item.links ? { links: item.links } : {}),
          ...(item.tone ? { tone: item.tone } : {}),
          ...(item.link ? { link: item.link } : {}),
          ...(actions.controls.length > 0
            ? {
                actions: actions.controls,
                ...definedFields({ actionsLabel: item.actionsLabel }),
              }
            : {}),
        };
      });
      return {
        block: {
          type: "list",
          id: block.id,
          empty: block.empty,
          ...(block.presentation ? { presentation: block.presentation } : {}),
          ...(block.filter ? { filter: block.filter } : {}),
          items,
        },
        issues,
      };
    }
    case "table": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const rows = block.rows.map((row, rowIndex) => {
        const actions = normalizeActionControls(
          row.actions ?? [],
          declared,
          permission,
          ["blocks", blockIndex, "rows", rowIndex, "actions"],
        );
        issues.push(...actions.issues);
        return {
          id: row.id,
          cells: row.cells,
          ...(row.compact ? { compact: row.compact } : {}),
          ...(row.link ? { link: row.link } : {}),
          ...(actions.controls.length > 0 ? { actions: actions.controls } : {}),
        };
      });
      return {
        block: {
          type: "table",
          id: block.id,
          empty: block.empty,
          ...(block.filters ? { filters: block.filters } : {}),
          ...(block.query ? { query: block.query } : {}),
          columns: block.columns,
          rows,
        },
        issues,
      };
    }
    case "matrix": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const cells = block.cells.map((cell, cellIndex) => ({
        id: cell.id,
        label: cell.label,
        ...(cell.tone ? { tone: cell.tone } : {}),
        empty: cell.empty,
        items: cell.items.map((item, itemIndex) => {
          const actions = normalizeActionControls(
            item.actions ?? [],
            declared,
            permission,
            [
              "blocks",
              blockIndex,
              "cells",
              cellIndex,
              "items",
              itemIndex,
              "actions",
            ],
          );
          issues.push(...actions.issues);
          return {
            id: item.id,
            title: item.title,
            ...(item.description ? { description: item.description } : {}),
            ...(item.meta ? { meta: item.meta } : {}),
            ...(item.metadata ? { metadata: item.metadata } : {}),
            ...(item.tags ? { tags: item.tags } : {}),
            ...definedFields({ count: item.count }),
            ...(item.badges ? { badges: item.badges } : {}),
            ...(item.filterValues ? { filterValues: item.filterValues } : {}),
            ...(item.links ? { links: item.links } : {}),
            ...(item.tone ? { tone: item.tone } : {}),
            ...(item.link ? { link: item.link } : {}),
            ...(actions.controls.length > 0
              ? {
                  actions: actions.controls,
                  ...definedFields({ actionsLabel: item.actionsLabel }),
                }
              : {}),
          };
        }),
      }));
      return {
        block: {
          type: "matrix",
          id: block.id,
          ...(block.columns ? { columns: block.columns } : {}),
          cells,
        },
        issues,
      };
    }
    case "tabs": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const tabs = block.tabs.map((tab) => {
        const blocks: (
          | RuntimeStudioOperatorPanelBlock
          | RuntimeStudioOperatorCardBlock
          | RuntimeStudioOperatorDetailBlock
          | RuntimeStudioOperatorColumnsBlock
        )[] = [];
        for (const [panelIndex, panelBlock] of tab.blocks.entries()) {
          const normalized = normalizeStudioBlock(
            panelBlock,
            panelIndex,
            declared,
            permission,
          );
          issues.push(...normalized.issues);
          if (normalized.block && normalized.block.type !== "tabs") {
            blocks.push(normalized.block);
          }
        }
        return {
          id: tab.id,
          label: tab.label,
          ...definedFields({ count: tab.count }),
          blocks,
        };
      });
      return {
        block: {
          type: "tabs",
          id: block.id,
          label: block.label,
          defaultTab: block.defaultTab,
          ...(block.queryKey ? { queryKey: block.queryKey } : {}),
          tabs,
        },
        issues,
      };
    }
    case "card": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const panels: RuntimeStudioOperatorPanelBlock[] = [];
      for (const [panelIndex, panel] of block.blocks.entries()) {
        const normalized = normalizeStudioBlock(
          panel,
          panelIndex,
          declared,
          permission,
        );
        issues.push(...normalized.issues);
        if (normalized.block && isPanelBlock(normalized.block)) {
          panels.push(normalized.block);
        }
      }
      return {
        block: {
          type: "card",
          id: block.id,
          label: block.label,
          ...(block.presentation ? { presentation: block.presentation } : {}),
          ...definedFields({ disclosureLabel: block.disclosureLabel }),
          ...(block.metadata ? { metadata: block.metadata } : {}),
          ...(block.tone ? { tone: block.tone } : {}),
          blocks: panels,
        },
        issues,
      };
    }
    case "columns": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const region = (
        entries: readonly StudioRegionSource[],
      ): RuntimeStudioOperatorRegionBlock[] => {
        const out: RuntimeStudioOperatorRegionBlock[] = [];
        for (const [index, entry] of entries.entries()) {
          const normalized = normalizeStudioBlock(
            entry,
            index,
            declared,
            permission,
          );
          issues.push(...normalized.issues);
          const candidate = normalized.block;
          if (
            candidate &&
            (isPanelBlock(candidate) || candidate.type === "card")
          ) {
            out.push(candidate);
          }
        }
        return out;
      };
      return {
        block: {
          type: "columns",
          id: block.id,
          primary: region(block.primary),
          aside: region(block.aside),
        },
        issues,
      };
    }
    case "detail": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const master = normalizeStudioBlock(
        block.master,
        blockIndex,
        declared,
        permission,
      );
      issues.push(...master.issues);
      const masterBlock = master.block;
      if (
        !masterBlock ||
        (masterBlock.type !== "list" && masterBlock.type !== "table")
      ) {
        return { issues };
      }
      const openBlocks: RuntimeStudioOperatorRegionBlock[] = [];
      for (const [panelIndex, panelBlock] of (
        block.open?.blocks ?? []
      ).entries()) {
        const normalized = normalizeStudioBlock(
          panelBlock,
          panelIndex,
          declared,
          permission,
        );
        issues.push(...normalized.issues);
        const candidate = normalized.block;
        if (
          candidate &&
          (isPanelBlock(candidate) || candidate.type === "card")
        ) {
          openBlocks.push(candidate);
        }
      }
      return {
        block: {
          type: "detail",
          id: block.id,
          queryKey: block.queryKey,
          empty: block.empty,
          master: masterBlock,
          ...(block.open
            ? {
                open: {
                  forId: block.open.forId,
                  title: block.open.title,
                  blocks: openBlocks,
                },
              }
            : {}),
        },
        issues,
      };
    }
    case "action": {
      const result = normalizeActionControls(
        [block],
        declared,
        permission,
        ["blocks"],
        [blockIndex],
      );
      const action = result.controls[0];
      return {
        ...(action
          ? {
              block: actionBlock(action, block.id),
            }
          : {}),
        issues: result.issues,
      };
    }
    case "actions": {
      const result = normalizeActionControls(
        block.items,
        declared,
        permission,
        ["blocks", blockIndex, "items"],
      );
      return {
        block: {
          type: "actions",
          ...(block.id ? { id: block.id } : {}),
          items: result.controls,
        },
        issues: result.issues,
      };
    }
    default:
      return { block, issues: [] };
  }
}
