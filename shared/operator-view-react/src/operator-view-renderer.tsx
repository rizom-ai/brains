/** @jsxImportSource react */
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import * as stylex from "@stylexjs/stylex";
import { workspaceStyles as workspace } from "./operator-workspace.styles";
import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
} from "@brains/plugins";
import { useState, type ReactElement } from "react";
import {
  CSS_COMPONENTS,
  OperatorRendererHostContext,
} from "./operator-view-host";
import type {
  OperatorViewQuery,
  OperatorViewComponents,
  PresentedActionResult,
} from "./operator-view-host";
import { ActionResult, OperatorActionButton } from "./operator-view-actions";
import { StatsBlock } from "./operator-view-blocks";
import { ViewBlock, blockSpan } from "./operator-view-panels";

export interface OperatorViewRendererProps {
  data: RuntimeStudioWorkspaceData;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch?: ((launch: RuntimeOperatorLaunchIntent) => void) | undefined;
  query?: OperatorViewQuery | undefined;
  onQueryChange?: ((query: OperatorViewQuery) => void) | undefined;
  resolveLink?:
    ((target: RuntimeOperatorLinkTarget) => string | undefined) | undefined;
  renderAllTabs?: boolean | undefined;
  /** Host-owned controls; Dashboard keeps the CSS defaults, Studio supplies app controls. */
  components?: OperatorViewComponents | undefined;
  /** Studio may render the normalized head while this renderer keeps the body. */
  renderHead?: boolean | undefined;
}

export function OperatorViewRenderer(
  props: OperatorViewRendererProps,
): ReactElement {
  const [actionReceipt, setActionReceipt] =
    useState<PresentedActionResult | null>(null);
  const { title, blocks } = props.data.view;
  // Leading stats are the workspace's totals, so they belong beside the title
  // rather than in the body as one more card.
  const [lead] = blocks;
  const totals =
    props.renderHead !== false &&
    props.renderAllTabs !== true &&
    lead?.type === "stats"
      ? lead
      : null;
  const bodyBlocks = totals ? blocks.slice(1) : blocks;
  const components = props.components ?? CSS_COMPONENTS;
  const frame = stylex.props(
    workspace.frame,
    props.renderHead === false && workspace.embedded,
  );
  const sections = stylex.props(
    workspace.sections,
    components.density === "comfortable" && workspace.comfortableSections,
  );
  const { kicker, description, status, primaryAction } = props.data.view;
  const hasHead =
    Boolean(title) ||
    Boolean(kicker) ||
    Boolean(description) ||
    totals !== null ||
    status !== undefined ||
    primaryAction !== undefined;

  return (
    <OperatorRendererHostContext.Provider
      value={{
        resolveLink: props.resolveLink,
        onDetachedActionResult: setActionReceipt,
        renderAllTabs: props.renderAllTabs === true,
        components,
      }}
    >
      <main
        {...frame}
        className={`declarative-workspace operator-view ${frame.className ?? ""}`}
        data-control-engine={components.engine}
      >
        {props.renderHead !== false && hasHead && (
          <header {...stylex.props(rendererLayout.head)}>
            <div {...stylex.props(rendererLayout.copy)}>
              {kicker && (
                <span {...stylex.props(rendererLayout.kicker)}>{kicker}</span>
              )}
              <h2 {...stylex.props(rendererLayout.title)}>{title}</h2>
              {description && (
                <p {...stylex.props(rendererLayout.description)}>
                  {description}
                </p>
              )}
            </div>
            <div {...stylex.props(rendererLayout.standing)}>
              {status && (
                <strong
                  {...stylex.props(rendererLayout.status)}
                  data-tone={status.tone ?? "neutral"}
                >
                  {status.label}
                  {status.detail && (
                    <small {...stylex.props(rendererLayout.statusDetail)}>
                      {status.detail}
                    </small>
                  )}
                </strong>
              )}
              {totals && <StatsBlock block={totals} placement="head" />}
              {primaryAction && (
                <OperatorActionButton
                  action={primaryAction}
                  primary
                  onAction={props.onAction}
                />
              )}
            </div>
          </header>
        )}
        <div
          {...sections}
          data-operator-blocks=""
          className={`declarative-blocks ${sections.className ?? ""}`}
        >
          {actionReceipt && (
            <section
              className={`operator-block operator-block--action declarative-action-receipt ${stylex.props(workspace.section, workspace.wide).className ?? ""}`}
              data-block="action"
              data-span="wide"
            >
              <ActionResult
                result={actionReceipt}
                onDismiss={() => setActionReceipt(null)}
              />
            </section>
          )}
          {bodyBlocks.map((block, index) => (
            <section
              className={`operator-block operator-block--${block.type} ${stylex.props(workspace.section, blockSpan(block.type) === "wide" && workspace.wide, block.type === "query" && workspace.query).className ?? ""}`}
              key={block.id ?? `${block.type}:${index}`}
              data-block={block.type}
              data-span={blockSpan(block.type)}
            >
              <ViewBlock
                block={block}
                onAction={props.onAction}
                onOpenEntity={props.onOpenEntity}
                onLaunch={props.onLaunch ?? ((): void => {})}
                query={props.query ?? {}}
                onQueryChange={props.onQueryChange ?? ((): void => {})}
              />
            </section>
          ))}
        </div>
      </main>
    </OperatorRendererHostContext.Provider>
  );
}
