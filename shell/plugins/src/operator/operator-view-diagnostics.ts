import type { z } from "@brains/utils/zod";
import type { RuntimeOperatorValidationIssue } from "./operator-view-runtime-types";

export function validationIssues(
  error: z.ZodError,
): readonly RuntimeOperatorValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectAuthorLinkTarget(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "studio",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!isUnknownRecord(value)) return;
  // A detail target names no block, so it is only meaningful where the
  // enclosing detail is known: inside that detail's own master collection.
  if (value["detail"] !== undefined && !insideDetailMaster) {
    issues.push({
      path,
      message:
        "A detail link is available only on rows of a detail block's master collection",
    });
    return;
  }
  if (
    value["kind"] === "external" ||
    value["kind"] === "entity" ||
    value["kind"] === "launch" ||
    value["kind"] === "detail"
  ) {
    issues.push({
      path,
      message:
        "Author links must use a typed external, entity, catalog, or launch target rather than a normalized host target",
    });
    return;
  }
  const launch = value["launch"];
  if (
    profile === "dashboard" &&
    isUnknownRecord(launch) &&
    (launch["target"] === "inbox-open-entity" ||
      launch["target"] === "inbox-capture-note" ||
      launch["target"] === "inbox-discuss-in-chat")
  ) {
    issues.push({
      path: [...path, "launch", "target"],
      message: `Launch intent "${launch["target"]}" is available only in Studio workspaces`,
    });
  }
}

function inspectAuthorLinkItems(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "studio",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!isUnknownRecord(item)) continue;
    inspectAuthorLinkTarget(
      item["target"],
      [...path, index, "target"],
      profile,
      issues,
      insideDetailMaster,
    );
  }
}

function inspectAuthorListItems(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "studio",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!isUnknownRecord(item)) continue;
    inspectAuthorLinkTarget(
      item["link"],
      [...path, index, "link"],
      profile,
      issues,
      insideDetailMaster,
    );
    inspectAuthorLinkItems(
      item["links"],
      [...path, index, "links"],
      profile,
      issues,
      insideDetailMaster,
    );
  }
}

function inspectAuthorBlocks(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "studio",
  issues: RuntimeOperatorValidationIssue[],
): void {
  if (!Array.isArray(value)) return;
  for (const [index, block] of value.entries()) {
    if (!isUnknownRecord(block)) continue;
    const blockPath = [...path, index];
    switch (block["type"]) {
      case "links":
        inspectAuthorLinkItems(
          block["items"],
          [...blockPath, "items"],
          profile,
          issues,
        );
        break;
      case "list":
        inspectAuthorListItems(
          block["items"],
          [...blockPath, "items"],
          profile,
          issues,
        );
        break;
      case "table": {
        const rows = block["rows"];
        if (Array.isArray(rows)) {
          for (const [rowIndex, row] of rows.entries()) {
            if (!isUnknownRecord(row)) continue;
            inspectAuthorLinkTarget(
              row["link"],
              [...blockPath, "rows", rowIndex, "link"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "matrix": {
        const cells = block["cells"];
        if (Array.isArray(cells)) {
          for (const [cellIndex, cell] of cells.entries()) {
            if (!isUnknownRecord(cell)) continue;
            inspectAuthorListItems(
              cell["items"],
              [...blockPath, "cells", cellIndex, "items"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "tabs": {
        const tabs = block["tabs"];
        if (Array.isArray(tabs)) {
          for (const [tabIndex, tab] of tabs.entries()) {
            if (!isUnknownRecord(tab)) continue;
            inspectAuthorBlocks(
              tab["blocks"],
              [...blockPath, "tabs", tabIndex, "blocks"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "card":
        inspectAuthorBlocks(
          block["blocks"],
          [...blockPath, "blocks"],
          profile,
          issues,
        );
        break;
      case "columns":
        inspectAuthorBlocks(
          block["primary"],
          [...blockPath, "primary"],
          profile,
          issues,
        );
        inspectAuthorBlocks(
          block["aside"],
          [...blockPath, "aside"],
          profile,
          issues,
        );
        break;
      case "detail": {
        const master = block["master"];
        if (isUnknownRecord(master)) {
          const masterPath = [...blockPath, "master"];
          inspectAuthorListItems(
            master["items"],
            [...masterPath, "items"],
            profile,
            issues,
            true,
          );
          const rows = master["rows"];
          if (Array.isArray(rows)) {
            for (const [rowIndex, row] of rows.entries()) {
              if (!isUnknownRecord(row)) continue;
              inspectAuthorLinkTarget(
                row["link"],
                [...masterPath, "rows", rowIndex, "link"],
                profile,
                issues,
                true,
              );
            }
          }
        }
        const open = block["open"];
        if (isUnknownRecord(open)) {
          inspectAuthorBlocks(
            open["blocks"],
            [...blockPath, "open", "blocks"],
            profile,
            issues,
          );
        }
        break;
      }
    }
  }
}

export function authorLinkIssues(
  input: unknown,
  profile: "dashboard" | "studio",
): readonly RuntimeOperatorValidationIssue[] {
  if (!isUnknownRecord(input)) return [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  inspectAuthorBlocks(input["blocks"], ["blocks"], profile, issues);
  return issues;
}
