/** @jsxImportSource react */
import {
  OperatorSegmentedGroup,
  OperatorSegmentedButton,
} from "./operator-segmented";
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
import { useContext, useState, type DragEvent, type ReactElement } from "react";
import {
  OperatorRendererHostContext,
  OpenDetailContext,
} from "./operator-view-host";
import { OperatorLink } from "./operator-view-links";
import { Actions } from "./operator-view-actions";

export type RuntimeListItem = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "list" }
>["items"][number];

export function ListItems(props: {
  items: readonly RuntimeListItem[];
  presentation?: Extract<
    RuntimeStudioOperatorPanelBlock,
    { type: "list" }
  >["presentation"];
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  openId?: string | undefined;
  /** Cards with drop actions can be dragged; the matrix answers the drop. */
  drag?:
    { start: (item: RuntimeListItem) => void; end: () => void } | undefined;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  const drag = props.drag;
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
            drag={
              drag && dropActions(item).length > 0
                ? {
                    onStart: (event: DragEvent): void => {
                      // Firefox starts a drag only once it carries data.
                      event.dataTransfer.setData("text/plain", item.id);
                      drag.start(item);
                    },
                    onEnd: drag.end,
                  }
                : undefined
            }
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
          data-filter=""
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

/** The card's actions that run when it is dropped on another cell. */
export function dropActions(
  item: RuntimeListItem,
): readonly RuntimeOperatorActionControl[] {
  return (item.actions ?? []).filter(
    (action) => action.dropTarget !== undefined && action.disabled !== true,
  );
}
