import styles from "./operator-view-renderer.css" with { type: "text" };

export { OperatorFacts } from "./operator-facts";
export { OperatorColumns } from "./operator-columns";
export { OperatorStats } from "./operator-stats";
export { OperatorStatusDot, OperatorStatusList } from "./operator-status";
export {
  OperatorStatusSummary,
  OperatorStatusPill,
  OperatorReadiness,
  OperatorSteps,
  OperatorChecks,
} from "./operator-status-content";
export { OperatorPanel, OperatorPanelGrid } from "./operator-panel";
export {
  OperatorPanelParagraph,
  OperatorPanelStatus,
  OperatorPanelEmpty,
  OperatorPanelList,
  OperatorPanelListItem,
} from "./operator-panel-content";
export {
  OperatorPage,
  OperatorFrame,
  OperatorCanvas,
  OperatorSections,
  OperatorSection,
  OperatorSectionHeading,
  OperatorFooter,
  OperatorFooterLink,
} from "./operator-frame";
export { OperatorRecordCopy } from "./operator-record";
export { OperatorCard } from "./operator-card";
export {
  OperatorHeader,
  OperatorHeaderLink,
  OperatorHeaderButton,
  OperatorMasthead,
  OperatorSectionTabs,
  OperatorSectionTab,
} from "./operator-chrome";
export { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";
export {
  OperatorActionButton,
  OperatorViewRenderer,
  type OperatorControlButtonProps,
  type OperatorControlVariant,
  type OperatorDisclosureProps,
  type OperatorTabsProps,
  type OperatorViewComponents,
  type OperatorViewQuery,
  type OperatorViewRendererProps,
} from "./operator-view-renderer";

export const operatorViewRendererStyles: string = styles;

/** Supplied by the package build, not a browser or server runtime compiler. */
declare const __OPERATOR_STYLEX_CSS__: string;
export const operatorViewStylexCSS: string = __OPERATOR_STYLEX_CSS__;
