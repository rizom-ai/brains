import styles from "./operator-view-renderer.css" with { type: "text" };

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
