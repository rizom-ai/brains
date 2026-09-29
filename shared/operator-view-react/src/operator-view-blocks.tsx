/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { OperatorFacts } from "./operator-facts";
import { OperatorCard } from "./operator-card";
import { OperatorNotice } from "./operator-notice";
import { OperatorSource } from "./operator-source";
import { OperatorStats } from "./operator-stats";
import { progressStyles as progress } from "./operator-progress.styles";
import { flowStyles as flow } from "./operator-flow.styles";
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import { queryStyles as q } from "./operator-query.styles";
import type {
  RuntimeStudioOperatorPanelBlock,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import { useContext, type ReactElement } from "react";
import { OperatorRendererHostContext } from "./operator-view-host";
import type { OperatorViewQuery, RuntimeBlock } from "./operator-view-host";
import { displayScalar } from "./operator-view-format";
import { OperatorLink } from "./operator-view-links";

export function StatsBlock({
  block,
  placement = "body",
}: {
  block: Extract<RuntimeBlock, { type: "stats" }>;
  placement?: "body" | "head";
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  return (
    <OperatorStats
      items={block.items}
      density={components.density}
      placement={placement}
    />
  );
}

export function KeyValuesBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "key-values" }>;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  return (
    <OperatorFacts
      density={components.density}
      items={block.items.map((item) => ({
        label: item.label,
        value: displayScalar(item.value),
      }))}
    />
  );
}

export function NoticeBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "notice" }>;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  const { Disclosure } = components;
  return (
    <OperatorNotice
      title={block.title}
      text={block.text}
      tone={block.tone ?? "neutral"}
      density={components.density}
    >
      {block.details && block.details.length > 0 && (
        <Disclosure
          title={block.title ?? "Diagnostics"}
          triggerLabel="View diagnostics"
          className="operator-notice-details"
        >
          <OperatorSource
            text={block.details.join("\n\n")}
            density={components.density}
            framed={false}
          />
        </Disclosure>
      )}
    </OperatorNotice>
  );
}

export function TextBlock({
  block,
}: {
  block: Extract<RuntimeBlock, { type: "text" }>;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  return (
    <OperatorSource
      label={block.label}
      text={block.text}
      truncated={block.truncated}
      density={components.density}
    />
  );
}

export function LinksBlock(props: {
  block: Extract<RuntimeBlock, { type: "links" }>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <nav {...stylex.props(rendererLayout.links)} aria-label="Workspace links">
      {props.block.items.map((item, index) => (
        <OperatorLink
          key={`${item.label}:${index}`}
          target={item.target}
          emphasis="action"
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        >
          {item.label}
        </OperatorLink>
      ))}
    </nav>
  );
}

export function GroupBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "group" }>;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  return (
    <OperatorCard
      label={props.block.label}
      density={components.density}
      framed={false}
    >
      <OperatorFacts
        density={components.density}
        items={props.block.items.map((item) => ({
          label: item.label,
          value:
            item.value === undefined ? undefined : displayScalar(item.value),
          caption: item.description,
          tone: item.tone,
        }))}
      />
    </OperatorCard>
  );
}

export function FlowBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "flow" }>;
}): ReactElement {
  return (
    <section
      {...stylex.props(flow.root)}
      aria-labelledby={`${props.block.id}-title`}
    >
      <h3 {...stylex.props(flow.heading)} id={`${props.block.id}-title`}>
        {props.block.label}
      </h3>
      <ol
        {...stylex.props(flow.track)}
        data-direction={props.block.direction ?? "forward"}
      >
        {props.block.steps.map((step) => (
          <li
            {...stylex.props(flow.step)}
            key={step.id}
            data-status={step.status}
          >
            <span {...stylex.props(flow.mark)} aria-hidden="true" />
            <strong {...stylex.props(flow.label)}>{step.label}</strong>
            {step.detail && (
              <small {...stylex.props(flow.detail)}>{step.detail}</small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MetersBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "meters" }>;
}): ReactElement {
  return (
    <dl {...stylex.props(progress.meters)}>
      {props.block.items.map((item) => (
        <div
          {...stylex.props(progress.meter)}
          key={item.id}
          data-tone={item.tone ?? "neutral"}
        >
          <dt {...stylex.props(progress.label)}>{item.label}</dt>
          <dd
            {...stylex.props(
              progress.value,
              item.tone && item.tone !== "neutral" && progress[item.tone],
            )}
          >
            <span>
              {item.value}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
            {item.max !== undefined && (
              <progress
                {...stylex.props(progress.bar)}
                aria-label={item.label}
                value={item.value}
                max={item.max}
              >
                {item.value} / {item.max}
              </progress>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "progress" }>;
}): ReactElement {
  return (
    <section
      {...stylex.props(progress.frame)}
      data-tone={props.block.tone ?? "neutral"}
    >
      <header {...stylex.props(progress.header)}>
        <strong {...stylex.props(progress.title)}>{props.block.label}</strong>
        <span
          {...stylex.props(
            progress.state,
            props.block.tone &&
              props.block.tone !== "neutral" &&
              progress[props.block.tone],
          )}
        >
          {props.block.state}
        </span>
      </header>
      {props.block.progress !== undefined && (
        <progress
          {...stylex.props(progress.bar)}
          aria-label={props.block.label}
          value={props.block.progress}
          max={1}
        >
          {Math.round(props.block.progress * 100)}%
        </progress>
      )}
      {props.block.detail && (
        <p {...stylex.props(progress.detail)}>{props.block.detail}</p>
      )}
      {(props.block.startedAt ?? props.block.updatedAt) && (
        <small {...stylex.props(progress.time)}>
          {props.block.startedAt ? `Started ${props.block.startedAt}` : ""}
          {props.block.startedAt && props.block.updatedAt ? " · " : ""}
          {props.block.updatedAt ? `Updated ${props.block.updatedAt}` : ""}
        </small>
      )}
    </section>
  );
}

export function QueryBlock(props: {
  block: Pick<
    Extract<RuntimeStudioOperatorPanelBlock, { type: "query" }>,
    "controls" | "pagination"
  >;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const { Button, Select, density, engine } = useContext(
    OperatorRendererHostContext,
  ).components;
  const change = (key: string, value: string): void => {
    const next: Record<string, string | number | undefined> = {
      ...props.query,
      offset: 0,
    };
    if (value === "") delete next[key];
    else next[key] = value;
    props.onQueryChange(next);
  };
  const pagination = props.block.pagination;
  const shown = pagination
    ? Math.min(pagination.offset + pagination.limit, pagination.total)
    : 0;
  return (
    <section
      {...stylex.props(q.root)}
      aria-label={
        props.block.controls.length ? "Workspace filters" : "Collection pages"
      }
    >
      {props.block.controls.length > 0 && (
        <div {...stylex.props(q.controls)}>
          {props.block.controls.map((control) => (
            <label
              {...stylex.props(
                q.label,
                density === "compact" && q.compactLabel,
              )}
              key={control.key}
            >
              <span>{control.label}</span>
              <Select
                xstyle={[engine === "css" && q.cssSelect, q.control]}
                value={control.value ?? ""}
                onChange={(event) => change(control.key, event.target.value)}
              >
                <option value="">{control.allLabel ?? "All"}</option>
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.count === undefined ? "" : ` (${option.count})`}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      )}
      {pagination && (
        <footer
          {...stylex.props(
            q.footer,
            props.block.controls.length === 0 && q.standaloneFooter,
          )}
        >
          {/* The window is replaced, not appended: a triage list is worked from
              the top and its rows leave as they are handled, so an accumulating
              list would shift under the operator. That makes saying which slice
              is shown, and offering the way back, part of the control. */}
          <span>
            {pagination.total === 0
              ? "Nothing to show"
              : pagination.offset >= pagination.total
                ? `No items on this page · ${pagination.total} total`
                : `Showing ${pagination.offset + 1}–${shown} of ${pagination.total}`}
          </span>
          {(pagination.offset > 0 || shown < pagination.total) && (
            <span {...stylex.props(q.pager)}>
              <Button
                type="button"
                variant="ghost"
                disabled={pagination.offset === 0}
                onClick={() =>
                  props.onQueryChange({
                    ...props.query,
                    offset: Math.max(0, pagination.offset - pagination.limit),
                    limit: pagination.limit,
                  })
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={shown >= pagination.total}
                onClick={() =>
                  props.onQueryChange({
                    ...props.query,
                    offset: pagination.offset + pagination.limit,
                    limit: pagination.limit,
                  })
                }
              >
                {pagination.label ?? "Next"}
              </Button>
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
