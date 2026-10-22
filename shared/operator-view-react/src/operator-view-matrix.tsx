/** @jsxImportSource react */
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import * as stylex from "@stylexjs/stylex";
import type {
  RuntimeStudioOperatorPanelBlock,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import { useContext, useState, type ReactElement } from "react";
import { OperatorRendererHostContext } from "./operator-view-host";
import {
  actionFailureMessage,
  presentedActionResult,
} from "./operator-action-result";
import {
  ListItems,
  dropActions,
  type RuntimeListItem,
} from "./operator-view-list";

export function MatrixBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "matrix" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  /** The open card when this matrix is a detail master. */
  openId?: string | undefined;
}): ReactElement {
  const host = useContext(OperatorRendererHostContext);
  const [dragging, setDragging] = useState<RuntimeListItem | null>(null);
  const [failure, setFailure] = useState("");
  // Beside an open card there is room for one column of cards, not four.
  const columns = props.openId !== undefined ? 1 : (props.block.columns ?? 2);
  const drop = async (action: RuntimeOperatorActionControl): Promise<void> => {
    setFailure("");
    try {
      const presented = presentedActionResult(
        action,
        await props.onAction(action),
      );
      if (presented) host.onDetachedActionResult?.(presented);
    } catch (error) {
      setFailure(actionFailureMessage(error));
    }
  };
  return (
    <div {...stylex.props(rendererLayout.matrixFrame)}>
      <div {...stylex.props(rendererLayout.matrix)} data-columns={columns}>
        {failure && (
          <p {...stylex.props(rendererLayout.error)} role="alert">
            {failure}
          </p>
        )}
        {props.block.cells.map((cell) => {
          const action = dragging
            ? dropActions(dragging).find(
                (candidate) => candidate.dropTarget === cell.id,
              )
            : undefined;
          return (
            <section
              {...stylex.props(
                rendererLayout.cell,
                action && rendererLayout.dropAllowed,
              )}
              key={cell.id}
              data-tone={cell.tone ?? "neutral"}
              data-matrix-cell=""
              data-drop={action ? "allowed" : undefined}
              onDragOver={
                action ? (event): void => event.preventDefault() : undefined
              }
              onDrop={
                action
                  ? (event): void => {
                      event.preventDefault();
                      setDragging(null);
                      void drop(action);
                    }
                  : undefined
              }
            >
              <h3 {...stylex.props(rendererLayout.caption)}>{cell.label}</h3>
              {cell.items.length === 0 ? (
                <p
                  {...stylex.props(
                    rendererLayout.empty,
                    rendererLayout.cellEmpty,
                  )}
                >
                  {cell.empty}
                </p>
              ) : (
                <ListItems
                  items={cell.items}
                  onAction={props.onAction}
                  onOpenEntity={props.onOpenEntity}
                  onLaunch={props.onLaunch}
                  openId={props.openId}
                  drag={{
                    start: setDragging,
                    end: (): void => setDragging(null),
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
