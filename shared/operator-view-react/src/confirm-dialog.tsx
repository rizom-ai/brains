/** @jsxImportSource react */
import { ConfirmDialog as AppConfirmDialog } from "@brains/app-ui-react";
import type { ReactElement, ReactNode } from "react";

/** Renderer controls retain their confirmation policy; the shared UI owns the modal. */
export interface ConfirmDialogProps {
  mark: string;
  title: string;
  titleId: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pending?: boolean | undefined;
  sectionClassName?: string | undefined;
  confirmClassName?: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): ReactElement {
  return <AppConfirmDialog {...props} dismissOnOutside />;
}
