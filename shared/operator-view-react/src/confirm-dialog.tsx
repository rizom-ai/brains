/** @jsxImportSource react */
import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * The one Studio confirmation modal: scrim dismiss, alertdialog semantics, an
 * initially focused cancel button, and a Tab/Escape focus trap. Every
 * confirm-style dialog renders through this so behavior cannot drift per
 * surface.
 */
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
  const sectionRef = useRef<HTMLElement>(null);
  const pending = props.pending === true;

  const trapFocus = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>): void => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        props.onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sectionRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [pending, props],
  );

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={pending ? undefined : props.onCancel}
    >
      <section
        ref={sectionRef}
        className={
          props.sectionClassName
            ? `delete-modal ${props.sectionClassName}`
            : "delete-modal"
        }
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <span className="modal-mark" aria-hidden="true">
          {props.mark}
        </span>
        <h3 id={props.titleId}>{props.title}</h3>
        {props.children}
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            autoFocus
            disabled={pending}
            onClick={props.onCancel}
          >
            {props.cancelLabel}
          </button>
          <button
            type="button"
            className={
              props.confirmClassName ? `btn ${props.confirmClassName}` : "btn"
            }
            disabled={pending}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
