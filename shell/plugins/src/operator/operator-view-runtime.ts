import type { UserPermissionLevel } from "@brains/templates";
import type { AnyWorkspaceActionDefinition } from "./workspace-action-definition-contract";
import { authorLinkIssues } from "./operator-view-diagnostics";
import { normalizeActionControls } from "./operator-action-normalization";
import { normalizeStudioBlock } from "./operator-studio-block-normalization";
import {
  parseDashboardView,
  parseDashboardDigest,
  parseDashboardWidgetData,
  parseStudioViewSource,
} from "./operator-view-schemas";
import type {
  RuntimeDashboardOperatorView,
  RuntimeStudioOperatorBlock,
  RuntimeStudioOperatorView,
  RuntimeDashboardDigest,
  RuntimeDashboardWidgetData,
  RuntimeOperatorValidationIssue,
  RuntimeOperatorParseResult,
} from "./operator-view-runtime-types";

export type {
  RuntimeOperatorScalar,
  RuntimeOperatorTone,
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
  RuntimeOperatorStatItem,
  RuntimeOperatorStatsBlock,
  RuntimeOperatorKeyValueItem,
  RuntimeOperatorKeyValuesBlock,
  RuntimeOperatorNoticeBlock,
  RuntimeOperatorTextBlock,
  RuntimeOperatorGroupItem,
  RuntimeOperatorGroupBlock,
  RuntimeOperatorFlowStep,
  RuntimeOperatorFlowBlock,
  RuntimeOperatorMeterItem,
  RuntimeOperatorMeterBlock,
  RuntimeOperatorProgressBlock,
  RuntimeOperatorQueryOption,
  RuntimeOperatorQueryDefinition,
  RuntimeOperatorQueryBlock,
  RuntimeOperatorLinkItem,
  RuntimeOperatorLinksBlock,
  RuntimeOperatorBadge,
  RuntimeOperatorListItem,
  RuntimeOperatorListFilterOption,
  RuntimeOperatorListFilter,
  RuntimeOperatorListBlock,
  RuntimeOperatorTableColumn,
  RuntimeOperatorTableFilter,
  RuntimeOperatorTableCompactRow,
  RuntimeOperatorTableRow,
  RuntimeOperatorTableBlock,
  RuntimeOperatorMatrixCell,
  RuntimeOperatorMatrixBlock,
  RuntimeOperatorSpatialLegendItem,
  RuntimeOperatorSpatialRelationship,
  RuntimeOperatorCartesianPoint,
  RuntimeOperatorCartesianZone,
  RuntimeOperatorCartesianSpatialBlock,
  RuntimeOperatorRadialPoint,
  RuntimeOperatorSpatialCluster,
  RuntimeOperatorRadialStratum,
  RuntimeOperatorRadialSpatialBlock,
  RuntimeOperatorSpatialBlock,
  RuntimeDashboardOperatorPanelBlock,
  RuntimeDashboardOperatorTabsBlock,
  RuntimeDashboardOperatorBlock,
  RuntimeDashboardOperatorView,
  RuntimePreparedConfirmation,
  RuntimeWorkspaceActionFormField,
  RuntimeWorkspaceActionForm,
  RuntimeWorkspaceActionResultField,
  RuntimeWorkspaceActionResult,
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorListItem,
  RuntimeStudioOperatorListBlock,
  RuntimeStudioOperatorTableRow,
  RuntimeStudioOperatorTableBlock,
  RuntimeStudioOperatorActionBlock,
  RuntimeStudioOperatorActionsBlock,
  RuntimeStudioOperatorPanelBlock,
  RuntimeStudioOperatorTabsBlock,
  RuntimeStudioOperatorDetailBlock,
  RuntimeStudioOperatorCardBlock,
  RuntimeStudioOperatorRegionBlock,
  RuntimeStudioOperatorColumnsBlock,
  RuntimeStudioOperatorBlock,
  RuntimeStudioOperatorViewStatus,
  RuntimeStudioOperatorView,
  RuntimeStudioWorkspaceData,
  RuntimeDashboardDigest,
  RuntimeDashboardWidgetData,
  RuntimeOperatorValidationIssue,
  RuntimeOperatorParseResult,
} from "./operator-view-runtime-types";

export function safeParseRuntimeDashboardOperatorView(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardOperatorView> {
  const sourceIssues = authorLinkIssues(input, "dashboard");
  if (sourceIssues.length > 0) {
    return { success: false, issues: sourceIssues };
  }
  return parseDashboardView(input);
}

export function safeParseRuntimeStudioOperatorView(
  input: unknown,
  options: {
    readonly actions: readonly AnyWorkspaceActionDefinition[];
    readonly permission: UserPermissionLevel;
  },
): RuntimeOperatorParseResult<RuntimeStudioOperatorView> {
  const sourceIssues = authorLinkIssues(input, "studio");
  if (sourceIssues.length > 0) {
    return { success: false, issues: sourceIssues };
  }
  const parsed = parseStudioViewSource(input);
  if (!parsed.success) {
    return parsed;
  }
  const blocks: RuntimeStudioOperatorBlock[] = [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  const primaryAction = parsed.data.primaryAction
    ? normalizeActionControls(
        [parsed.data.primaryAction],
        options.actions,
        options.permission,
        [],
        ["primaryAction"],
      )
    : { controls: [], issues: [] };
  issues.push(...primaryAction.issues);
  for (const [index, source] of parsed.data.blocks.entries()) {
    const normalized = normalizeStudioBlock(
      source,
      index,
      options.actions,
      options.permission,
    );
    issues.push(...normalized.issues);
    if (normalized.block) blocks.push(normalized.block);
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: Object.freeze({
      ...(parsed.data.kicker ? { kicker: parsed.data.kicker } : {}),
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.description
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(primaryAction.controls[0]
        ? { primaryAction: primaryAction.controls[0] }
        : {}),
      blocks: Object.freeze(blocks),
    }),
  };
}

export function safeParseRuntimeDashboardDigest(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardDigest> {
  return parseDashboardDigest(input);
}

export function safeParseRuntimeDashboardWidgetData(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardWidgetData> {
  return parseDashboardWidgetData(input);
}
