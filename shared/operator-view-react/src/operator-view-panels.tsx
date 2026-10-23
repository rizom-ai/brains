/** @jsxImportSource react */
import { SeriesBlock } from "./operator-series";
import { TimelineBlock } from "./operator-timeline";
import { OperatorCard } from "./operator-card";
import { OperatorColumns } from "./operator-columns";
import { rendererLayoutStyles as rendererLayout } from "./operator-renderer-layout.styles";
import { detailStyles as detail } from "./operator-detail.styles";
import * as stylex from "@stylexjs/stylex";
import { workspaceStyles as workspace } from "./operator-workspace.styles";
import type {
  RuntimeStudioOperatorBlock,
  RuntimeStudioOperatorPanelBlock,
  RuntimeStudioOperatorRegionBlock,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  StaticAllTabs,
  OperatorRendererHostContext,
  OpenDetailContext,
} from "./operator-view-host";
import type { OperatorViewQuery, RuntimeBlock } from "./operator-view-host";
import { OperatorActionButton, Actions } from "./operator-view-actions";
import {
  StatsBlock,
  KeyValuesBlock,
  NoticeBlock,
  TextBlock,
  LinksBlock,
  GroupBlock,
  FlowBlock,
  MetersBlock,
  ProgressBlock,
  QueryBlock,
} from "./operator-view-blocks";
import { ListBlock } from "./operator-view-list";
import { MatrixBlock } from "./operator-view-matrix";
import { TableBlock } from "./operator-view-table";
import { SpatialBlock } from "./operator-view-spatial";

/** What every container hands down to the blocks it holds. */
interface BlockHandlers {
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}

type BlockProps<Block> = BlockHandlers & { block: Block };

function PanelBlock(
  props: BlockProps<RuntimeStudioOperatorPanelBlock>,
): ReactElement {
  switch (props.block.type) {
    case "stats":
      return <StatsBlock block={props.block} />;
    case "key-values":
      return <KeyValuesBlock block={props.block} />;
    case "notice":
      return <NoticeBlock block={props.block} />;
    case "text":
      return <TextBlock block={props.block} />;
    case "group":
      return <GroupBlock block={props.block} />;
    case "flow":
      return <FlowBlock block={props.block} />;
    case "meters":
      return <MetersBlock block={props.block} />;
    case "series":
      return <SeriesBlock block={props.block} />;
    case "timeline":
      return <TimelineBlock block={props.block} />;
    case "progress":
      return <ProgressBlock block={props.block} />;
    case "query":
      return (
        <QueryBlock
          block={props.block}
          query={props.query}
          onQueryChange={props.onQueryChange}
        />
      );
    case "links":
      return (
        <LinksBlock
          block={props.block}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "list":
      return (
        <ListBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "table":
      return (
        <TableBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
          query={props.query}
          onQueryChange={props.onQueryChange}
        />
      );
    case "matrix":
      return (
        <MatrixBlock
          block={props.block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
        />
      );
    case "spatial":
      return <SpatialBlock block={props.block} />;
    case "action":
      return (
        <OperatorActionButton action={props.block} onAction={props.onAction} />
      );
    case "actions":
      return <Actions actions={props.block.items} onAction={props.onAction} />;
  }
}

/**
 * Master/detail is rendered as two regions of one block: the collection keeps
 * its place while the open row's panels render beside it. Opening and closing
 * are canonical query changes, so the URL stays the source of truth and a
 * reload restores the same pair.
 */
function DetailBlock(
  props: BlockProps<Extract<RuntimeStudioOperatorBlock, { type: "detail" }>>,
): ReactElement {
  const { block, ...handlers } = props;
  const { query, onQueryChange } = handlers;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // What the query asks for, not what has arrived: the two differ while a
  // detail is loading, and a click must be answered immediately rather than
  // waiting on a round-trip that may be slow.
  const requestedRaw = query[block.queryKey];
  const requested =
    typeof requestedRaw === "string" && requestedRaw !== ""
      ? requestedRaw
      : undefined;
  const open = block.open?.forId === requested ? block.open : undefined;
  const pending = requested !== undefined && open === undefined;

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  const openItem = (itemId: string): void => {
    onQueryChange({ ...query, [block.queryKey]: itemId });
  };
  const closeItem = (): void => {
    const next = { ...query };
    delete next[block.queryKey];
    onQueryChange(next);
  };

  const master =
    block.master.type === "list" ? (
      <ListBlock
        block={block.master}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        openId={requested}
      />
    ) : block.master.type === "matrix" ? (
      <MatrixBlock
        block={block.master}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        openId={requested}
      />
    ) : (
      <TableBlock
        block={block.master}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={query}
        onQueryChange={onQueryChange}
        openId={requested}
      />
    );

  return (
    <div
      {...stylex.props(detail.root, requested !== undefined && detail.split)}
      data-detail=""
      data-open={requested === undefined ? "false" : "true"}
    >
      <section
        {...stylex.props(
          detail.master,
          requested !== undefined && detail.hiddenMaster,
        )}
        data-detail-master=""
        aria-label="Items"
      >
        <OpenDetailContext.Provider value={openItem}>
          {master}
        </OpenDetailContext.Provider>
      </section>
      {/* The reading pane exists only once something is asked for, so a
          collection at rest keeps the full measure. */}
      {requested !== undefined && (
        <section
          data-operator-detail-pane=""
          {...stylex.props(detail.pane)}
          aria-label={open ? open.title : "Detail"}
        >
          {open ? (
            <>
              <button
                type="button"
                {...stylex.props(detail.back)}
                data-detail-back=""
                onClick={closeItem}
              >
                ← Back
              </button>
              <h2
                {...stylex.props(detail.heading)}
                ref={headingRef}
                tabIndex={-1}
              >
                {open.title}
              </h2>
              <div {...stylex.props(detail.body)}>
                {open.blocks.map((panel, index) => (
                  <section
                    key={panel.id ?? `${panel.type}:${index}`}
                    data-block={panel.type}
                  >
                    {panel.type === "card" ? (
                      <CardBlock framed={false} block={panel} {...handlers} />
                    ) : (
                      <PanelBlock block={panel} {...handlers} />
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                {...stylex.props(detail.back)}
                data-detail-back=""
                onClick={closeItem}
              >
                ← Back
              </button>
              <p {...stylex.props(rendererLayout.empty)} aria-live="polite">
                {pending ? "Loading…" : block.empty}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CardBlock(
  props: BlockProps<Extract<RuntimeStudioOperatorBlock, { type: "card" }>> & {
    framed?: boolean;
  },
): ReactElement {
  const { framed, block, ...handlers } = props;
  const { components } = useContext(OperatorRendererHostContext);
  const panels = block.blocks;
  // Adjacent trailing navigation and mutation controls share one action line.
  const footerStart =
    panels.reduce(
      (last, panel, index) =>
        panel.type === "links" || panel.type === "actions" ? last : index,
      -1,
    ) + 1;
  const groupedFooter = panels.length - footerStart > 1;
  const renderPanel = (
    panel: RuntimeStudioOperatorPanelBlock,
    index: number,
  ): ReactElement => (
    <div key={panel.id ?? `${panel.type}:${index}`} data-block={panel.type}>
      <PanelBlock block={panel} {...handlers} />
    </div>
  );
  return (
    <OperatorCard
      label={block.label}
      metadata={block.metadata}
      summary={block.summary}
      framed={framed}
      tone={block.tone}
      presentation={block.presentation}
      density={components.density}
      renderDisclosure={
        block.presentation === "disclosure" &&
        block.disclosureLabel !== undefined
          ? (content): ReactElement => (
              <components.Disclosure
                title={block.label}
                triggerLabel={block.disclosureLabel}
                triggerVariant="outline"
              >
                {content}
              </components.Disclosure>
            )
          : undefined
      }
      footer={
        groupedFooter
          ? panels
              .slice(footerStart)
              .map((panel, index) => renderPanel(panel, footerStart + index))
          : undefined
      }
    >
      {panels
        .slice(0, groupedFooter ? footerStart : panels.length)
        .map(renderPanel)}
    </OperatorCard>
  );
}

/**
 * A column of work beside a rail of standing facts. Both regions hold panels
 * and cards; the host owns the ratio and the narrow-viewport stacking.
 */
function ColumnsBlock(
  props: BlockProps<Extract<RuntimeStudioOperatorBlock, { type: "columns" }>>,
): ReactElement {
  const { block, ...handlers } = props;
  const { components } = useContext(OperatorRendererHostContext);
  const region = (
    entries: readonly RuntimeStudioOperatorRegionBlock[],
  ): ReactElement => (
    <>
      {entries.map((entry, index) => (
        <section
          key={entry.id ?? `${entry.type}:${index}`}
          {...stylex.props(
            components.density === "comfortable" &&
              index > 0 &&
              !(entry.type === "card" && entry.presentation === "disclosure") &&
              workspace.sectionAfter,
          )}
          data-block={entry.type}
        >
          {entry.type === "card" ? (
            <CardBlock block={entry} {...handlers} />
          ) : (
            <PanelBlock block={entry} {...handlers} />
          )}
        </section>
      ))}
    </>
  );

  return (
    <OperatorColumns
      density={components.density}
      joined={components.density === "comfortable"}
      primary={region(block.primary)}
      aside={region(block.aside)}
    />
  );
}

export function ViewBlock(props: BlockProps<RuntimeBlock>): ReactElement {
  const { block, ...handlers } = props;
  const tabDefault = block.type === "tabs" ? block.defaultTab : "";
  const tabQueryKey = block.type === "tabs" ? block.queryKey : undefined;
  const [localActiveTab, setLocalActiveTab] = useState(tabDefault);
  useEffect(() => {
    if (!tabQueryKey) setLocalActiveTab(tabDefault);
  }, [tabDefault, tabQueryKey]);
  const host = useContext(OperatorRendererHostContext);
  switch (block.type) {
    case "columns":
      return <ColumnsBlock block={block} {...handlers} />;
    case "card":
      return <CardBlock block={block} {...handlers} />;
    case "detail":
      return <DetailBlock block={block} {...handlers} />;
    case "tabs":
      break;
    default:
      return <PanelBlock block={block} {...handlers} />;
  }
  const tabs = block.tabs.map((tab) => ({
    value: tab.id,
    label: tab.label,
    ...(tab.count !== undefined ? { count: tab.count } : {}),
    content: tab.blocks.map((child, index) => (
      <section
        {...stylex.props(
          workspace.section,
          index > 0 && workspace.sectionAfter,
        )}
        key={child.id ?? `${child.type}:${index}`}
      >
        <ViewBlock block={child} {...handlers} />
      </section>
    )),
  }));
  if (host.renderAllTabs) {
    return (
      <StaticAllTabs
        id={`operator-${block.id}`}
        label={block.label}
        defaultValue={block.defaultTab}
        tabs={tabs}
      />
    );
  }
  const requestedTab = tabQueryKey ? handlers.query[tabQueryKey] : undefined;
  const activeTab =
    typeof requestedTab === "string" ? requestedTab : localActiveTab;
  const activeValue = tabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : (tabs[0]?.value ?? "");
  const { Tabs } = host.components;
  return (
    <Tabs
      label={block.label}
      value={activeValue}
      tabs={tabs}
      onValueChange={(value) => {
        if (tabQueryKey) {
          handlers.onQueryChange({ [tabQueryKey]: value });
        } else {
          setLocalActiveTab(value);
        }
      }}
    />
  );
}

/**
 * Blocks that read as a narrow instrument panel share a row; everything that
 * carries a collection, a reading surface, or its own controls claims the full
 * measure. Authors declare meaning, so width stays a host decision.
 */
const COMPACT_BLOCKS: ReadonlySet<string> = new Set([
  "key-values",
  "group",
  "meters",
  "progress",
]);

export function blockSpan(type: string): "compact" | "wide" {
  return COMPACT_BLOCKS.has(type) ? "compact" : "wide";
}
