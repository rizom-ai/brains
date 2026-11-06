/** @jsxImportSource react */
import { tableStyles as tableStyle } from "./operator-table.styles";
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import * as stylex from "@stylexjs/stylex";
import { selectionStyles as selection } from "./operator-selection.styles";
import type {
  RuntimeStudioOperatorPanelBlock,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import { type ReactElement } from "react";
import type { OperatorViewQuery } from "./operator-view-host";
import { displayCell } from "./operator-view-format";
import { OperatorLink } from "./operator-view-links";
import { Actions } from "./operator-view-actions";
import { QueryBlock } from "./operator-view-blocks";
import { ListItems, type RuntimeListItem } from "./operator-view-list";

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
  // Beside an open row, the first column keeps a gutter for its marker.
  const gutter = props.openId !== undefined;
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
          <div {...stylex.props(tableStyle.compact)} data-compact-rows="">
            <ListItems
              items={compactRows}
              presentation="activity"
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              openId={props.openId}
            />
          </div>
        )}
        <div
          {...stylex.props(tableStyle.scroll)}
          data-table-scroll=""
          {...(compactRows.length > 0
            ? {
                "data-has-unannotated": hasUnannotatedRows ? "true" : "false",
              }
            : {})}
        >
          <table {...stylex.props(tableStyle.table)}>
            <thead>
              <tr>
                {props.block.columns.map((column, index) => (
                  <th
                    {...stylex.props(
                      tableStyle.head,
                      gutter && index === 0 && tableStyle.gutter,
                    )}
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
                  {...stylex.props(
                    tableStyle.row,
                    props.openId === row.id && selection.current,
                  )}
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
                        {...stylex.props(
                          tableStyle.cell,
                          gutter && index === 0 && tableStyle.gutter,
                        )}
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
    <div data-table-collection="">
      <QueryBlock
        block={props.block.query}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
      {table}
    </div>
  );
}
