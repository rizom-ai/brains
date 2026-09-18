/** @jsxImportSource react */
import {
  OperatorSegmentedGroup,
  OperatorSegmentedButton,
} from "./operator-segmented";
import { tableStyles as tableStyle } from "./operator-table.styles";
import {
  OperatorRecordCopy,
  OperatorRecordDescription,
} from "./operator-record";
import {
  OperatorList,
  OperatorRecordRow,
  OperatorBadge,
} from "./operator-list";
import { listStyles as list } from "./operator-list.styles";
import { OperatorSource } from "./operator-source";
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import * as stylex from "@stylexjs/stylex";
import { OperatorMetadata } from "./operator-metadata";
import type {
  RuntimeStudioOperatorPanelBlock,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import { useContext, useState, type ReactElement } from "react";
import {
  OperatorRendererHostContext,
  OpenDetailContext,
} from "./operator-view-host";
import type { OperatorViewQuery } from "./operator-view-host";
import { displayCell } from "./operator-view-format";
import { OperatorLink } from "./operator-view-links";
import { Actions } from "./operator-view-actions";
import { QueryBlock } from "./operator-view-blocks";

type RuntimeListItem = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "list" }
>["items"][number];

function ListItems(props: {
  items: readonly RuntimeListItem[];
  presentation?: Extract<
    RuntimeStudioOperatorPanelBlock,
    { type: "list" }
  >["presentation"];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  openId?: string | undefined;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  const { Disclosure } = components;
  const master = useContext(OpenDetailContext) !== null;
  return (
    <OperatorList
      density={components.density}
      presentation={props.presentation}
    >
      {props.items.map((item, index) => {
        const metadata = [
          ...(item.meta ? [item.meta] : []),
          ...(item.metadata ?? []),
        ];
        return (
          <OperatorRecordRow
            key={item.id}
            density={components.density}
            tone={item.tone}
            selected={props.openId === item.id}
            master={master && props.openId !== undefined}
            stacked={
              props.presentation === "activity" ||
              props.presentation === "attention"
            }
            interactive={Boolean(item.link ?? item.links?.length)}
            trailing={
              item.count !== undefined ||
              Boolean(item.badges?.length) ||
              Boolean(item.actions?.length) ||
              Boolean(item.links?.length) ||
              (props.presentation === "attention" && metadata.length > 0) ? (
                <>
                  {props.presentation === "attention" &&
                    metadata.length > 0 && (
                      <small {...stylex.props(list.footerMetadata)}>
                        <OperatorMetadata values={metadata} />
                      </small>
                    )}
                  {item.links && item.links.length > 0 && (
                    <nav
                      {...stylex.props(list.links)}
                      aria-label={`${item.title} links`}
                    >
                      {item.links.map((link, index) => (
                        <OperatorLink
                          key={`${link.label}:${index}`}
                          target={link.target}
                          emphasis="normal"
                          onOpenEntity={props.onOpenEntity}
                          onLaunch={props.onLaunch}
                        >
                          {link.label}
                        </OperatorLink>
                      ))}
                    </nav>
                  )}
                  {item.count !== undefined && (
                    <span {...stylex.props(list.count)}>{item.count}</span>
                  )}
                  {item.badges?.map((badge, index) => (
                    <OperatorBadge
                      key={`${badge.label}:${index}`}
                      density={components.density}
                      tone={badge.tone}
                    >
                      {badge.label}
                    </OperatorBadge>
                  ))}
                  <Actions
                    actions={item.actions ?? []}
                    onAction={props.onAction}
                    subordinate
                    label={item.title}
                    triggerLabel={item.actionsLabel}
                  />
                </>
              ) : undefined
            }
          >
            <OperatorRecordCopy
              density={components.density}
              metadata={props.presentation === "attention" ? [] : metadata}
              presentation={props.presentation}
              primary={index === 0}
              clamp={master}
              title={
                item.link ? (
                  <OperatorLink
                    target={item.link}
                    emphasis="title"
                    onOpenEntity={props.onOpenEntity}
                    onLaunch={props.onLaunch}
                  >
                    {item.title}
                  </OperatorLink>
                ) : (
                  item.title
                )
              }
              description={
                item.description &&
                (item.tone === "warn" || item.tone === "error") &&
                item.description.length > 160 ? (
                  <div {...stylex.props(list.controls)}>
                    <OperatorRecordDescription
                      text={item.description}
                      density={components.density}
                      clamp
                    />
                    <Disclosure
                      title={item.title}
                      triggerLabel="Details"
                      className="operator-issue-details"
                    >
                      <OperatorSource
                        text={item.description}
                        density={components.density}
                        framed={false}
                      />
                    </Disclosure>
                  </div>
                ) : (
                  item.description
                )
              }
            >
              {item.tags && item.tags.length > 0 && (
                <span {...stylex.props(list.tags)}>
                  {item.tags.map((tag) => (
                    <OperatorBadge key={tag} density={components.density}>
                      {tag}
                    </OperatorBadge>
                  ))}
                </span>
              )}
            </OperatorRecordCopy>
          </OperatorRecordRow>
        );
      })}
    </OperatorList>
  );
}

export function ListBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "list" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  openId?: string | undefined;
}): ReactElement {
  const [activeFilter, setActiveFilter] = useState(
    props.block.filter?.defaultValue ?? "all",
  );
  const allValue = props.block.filter?.allValue ?? "all";
  const items = props.block.items.filter(
    (item) =>
      !props.block.filter ||
      activeFilter === allValue ||
      item.filterValues?.includes(activeFilter),
  );
  if (props.block.items.length === 0) {
    return <p {...stylex.props(rendererLayout.empty)}>{props.block.empty}</p>;
  }
  return (
    <div>
      {props.block.filter && (
        <OperatorSegmentedGroup
          className="declarative-filter"
          role="group"
          aria-label={props.block.filter.label}
        >
          {props.block.filter.options.map((option) => (
            <OperatorSegmentedButton
              key={option.value}
              type="button"
              emphasis={option.emphasis === "gap" ? "attention" : undefined}
              aria-pressed={activeFilter === option.value}
              data-emphasis={option.emphasis}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.label}
              {option.count !== undefined ? ` (${option.count})` : ""}
            </OperatorSegmentedButton>
          ))}
        </OperatorSegmentedGroup>
      )}
      {items.length === 0 ? (
        <p {...stylex.props(rendererLayout.empty)}>{props.block.empty}</p>
      ) : (
        <ListItems
          items={items}
          presentation={props.block.presentation}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
          openId={props.openId}
        />
      )}
    </div>
  );
}

export function TableBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "table" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
  openId?: string | undefined;
}): ReactElement {
  const hasActions = props.block.rows.some(
    (row) => (row.actions?.length ?? 0) > 0,
  );
  const compactRows: readonly RuntimeListItem[] = props.block.rows.flatMap(
    (row): RuntimeListItem[] => {
      if (!row.compact) return [];
      return [
        {
          id: row.id,
          title: row.compact.title,
          ...(row.compact.description
            ? { description: row.compact.description }
            : {}),
          ...(row.compact.metadata ? { metadata: row.compact.metadata } : {}),
          ...(row.compact.badges ? { badges: row.compact.badges } : {}),
          ...(row.compact.count !== undefined
            ? { count: row.compact.count }
            : {}),
          ...(row.compact.tone ? { tone: row.compact.tone } : {}),
          ...(row.link ? { link: row.link } : {}),
          ...(row.actions ? { actions: row.actions } : {}),
        },
      ];
    },
  );
  const hasUnannotatedRows = props.block.rows.some((row) => !row.compact);
  const table =
    props.block.rows.length === 0 ? (
      <p {...stylex.props(rendererLayout.empty)}>{props.block.empty}</p>
    ) : (
      <>
        {compactRows.length > 0 && (
          <div
            {...stylex.props(tableStyle.compact)}
            className={`declarative-compact-rows ${stylex.props(tableStyle.compact).className ?? ""}`}
          >
            <ListItems
              items={compactRows}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              openId={props.openId}
            />
          </div>
        )}
        <div
          {...stylex.props(tableStyle.scroll)}
          className={`declarative-table-scroll operator-table-scroll ${stylex.props(tableStyle.scroll).className ?? ""}`}
          {...(compactRows.length > 0
            ? {
                "data-has-unannotated": hasUnannotatedRows ? "true" : "false",
              }
            : {})}
        >
          <table
            {...stylex.props(tableStyle.table)}
            className={`declarative-table operator-table ${stylex.props(tableStyle.table).className ?? ""}`}
          >
            <thead>
              <tr>
                {props.block.columns.map((column) => (
                  <th
                    {...stylex.props(tableStyle.head)}
                    key={column.key}
                    data-align={column.align ?? "start"}
                  >
                    {column.label}
                  </th>
                ))}
                {hasActions && (
                  <th {...stylex.props(tableStyle.head)} data-align="end">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {props.block.rows.map((row) => (
                <tr
                  {...stylex.props(tableStyle.row)}
                  key={row.id}
                  {...(row.compact ? { "data-compact-row": "true" } : {})}
                  {...(props.openId === row.id
                    ? { "aria-current": "true" }
                    : {})}
                >
                  {props.block.columns.map((column, index) => {
                    const value = displayCell(row.cells[column.key]);
                    return (
                      <td
                        {...stylex.props(tableStyle.cell)}
                        key={column.key}
                        data-align={column.align ?? "start"}
                      >
                        {index === 0 && row.link ? (
                          <OperatorLink
                            target={row.link}
                            onOpenEntity={props.onOpenEntity}
                            onLaunch={props.onLaunch}
                          >
                            {value}
                          </OperatorLink>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                  {hasActions && (
                    <td {...stylex.props(tableStyle.cell)} data-align="end">
                      <Actions
                        align="end"
                        actions={row.actions ?? []}
                        onAction={props.onAction}
                        subordinate
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (!props.block.query) return table;
  return (
    <div className="declarative-table-collection">
      <QueryBlock
        block={props.block.query}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
      {table}
    </div>
  );
}

export function MatrixBlock(props: {
  block: Extract<RuntimeStudioOperatorPanelBlock, { type: "matrix" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <div {...stylex.props(rendererLayout.matrix(props.block.columns ?? 2))}>
      {props.block.cells.map((cell) => (
        <section
          {...stylex.props(rendererLayout.cell)}
          key={cell.id}
          data-tone={cell.tone ?? "neutral"}
        >
          <h3 {...stylex.props(rendererLayout.caption)}>{cell.label}</h3>
          {cell.items.length === 0 ? (
            <p {...stylex.props(rendererLayout.empty)}>{cell.empty}</p>
          ) : (
            <ListItems
              items={cell.items}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
            />
          )}
        </section>
      ))}
    </div>
  );
}
