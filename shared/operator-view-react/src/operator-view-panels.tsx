/** @jsxImportSource react */
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
import {
  ListBlock,
  TableBlock,
  MatrixBlock,
} from "./operator-view-collections";
import { SpatialBlock } from "./operator-view-spatial";

function PanelBlock(props: {
  block: RuntimeStudioOperatorPanelBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
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
function DetailBlock(props: {
  block: Extract<RuntimeStudioOperatorBlock, { type: "detail" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const { block, query, onQueryChange } = props;
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
      className={`declarative-detail ${stylex.props(detail.root, requested !== undefined && detail.split).className ?? ""}`}
      data-open={requested === undefined ? "false" : "true"}
    >
      <section
        className={`declarative-detail-master ${stylex.props(detail.master, requested !== undefined && detail.hiddenMaster).className ?? ""}`}
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
          className={`declarative-detail-pane ${stylex.props(detail.pane).className ?? ""}`}
          aria-label={open ? open.title : "Detail"}
        >
          {open ? (
            <>
              <button
                type="button"
                className={`declarative-detail-back ${stylex.props(detail.back).className ?? ""}`}
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
                      <CardBlock
                        framed={false}
                        block={panel}
                        onAction={props.onAction}
                        onOpenEntity={props.onOpenEntity}
                        onLaunch={props.onLaunch}
                        query={query}
                        onQueryChange={onQueryChange}
                      />
                    ) : (
                      <PanelBlock
                        block={panel}
                        onAction={props.onAction}
                        onOpenEntity={props.onOpenEntity}
                        onLaunch={props.onLaunch}
                        query={query}
                        onQueryChange={onQueryChange}
                      />
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`declarative-detail-back ${stylex.props(detail.back).className ?? ""}`}
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

function CardBlock(props: {
  framed?: boolean;
  block: Extract<RuntimeStudioOperatorBlock, { type: "card" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const { components } = useContext(OperatorRendererHostContext);
  const panels = props.block.blocks;
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
      <PanelBlock
        block={panel}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    </div>
  );
  return (
    <OperatorCard
      label={props.block.label}
      metadata={props.block.metadata}
      framed={props.framed}
      tone={props.block.tone}
      presentation={props.block.presentation}
      density={components.density}
      renderDisclosure={
        props.block.presentation === "disclosure" &&
        props.block.disclosureLabel !== undefined
          ? (content): ReactElement => (
              <components.Disclosure
                title={props.block.label}
                triggerLabel={props.block.disclosureLabel}
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
function ColumnsBlock(props: {
  block: Extract<RuntimeStudioOperatorBlock, { type: "columns" }>;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
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
            <CardBlock
              block={entry}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              query={props.query}
              onQueryChange={props.onQueryChange}
            />
          ) : (
            <PanelBlock
              block={entry}
              onAction={props.onAction}
              onOpenEntity={props.onOpenEntity}
              onLaunch={props.onLaunch}
              query={props.query}
              onQueryChange={props.onQueryChange}
            />
          )}
        </section>
      ))}
    </>
  );

  return (
    <OperatorColumns
      density={components.density}
      joined={components.density === "comfortable"}
      primary={region(props.block.primary)}
      aside={region(props.block.aside)}
    />
  );
}

export function ViewBlock(props: {
  block: RuntimeBlock;
  onAction: (action: RuntimeOperatorActionControl) => Promise<unknown>;
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  query: OperatorViewQuery;
  onQueryChange: (query: OperatorViewQuery) => void;
}): ReactElement {
  const tabDefault = props.block.type === "tabs" ? props.block.defaultTab : "";
  const tabQueryKey =
    props.block.type === "tabs" ? props.block.queryKey : undefined;
  const [localActiveTab, setLocalActiveTab] = useState(tabDefault);
  useEffect(() => {
    if (!tabQueryKey) setLocalActiveTab(tabDefault);
  }, [tabDefault, tabQueryKey]);
  const host = useContext(OperatorRendererHostContext);
  if (props.block.type === "columns") {
    return (
      <ColumnsBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  if (props.block.type === "card") {
    return (
      <CardBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  if (props.block.type === "detail") {
    return (
      <DetailBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  if (props.block.type !== "tabs") {
    return (
      <PanelBlock
        block={props.block}
        onAction={props.onAction}
        onOpenEntity={props.onOpenEntity}
        onLaunch={props.onLaunch}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    );
  }
  const tabs = props.block.tabs.map((tab) => ({
    value: tab.id,
    label: tab.label,
    ...(tab.count !== undefined ? { count: tab.count } : {}),
    content: tab.blocks.map((block, index) => (
      <section
        className={`operator-block operator-block--${block.type} ${stylex.props(workspace.section, index > 0 && workspace.sectionAfter).className ?? ""}`}
        key={block.id ?? `${block.type}:${index}`}
      >
        <ViewBlock
          block={block}
          onAction={props.onAction}
          onOpenEntity={props.onOpenEntity}
          onLaunch={props.onLaunch}
          query={props.query}
          onQueryChange={props.onQueryChange}
        />
      </section>
    )),
  }));
  if (host.renderAllTabs) {
    return (
      <StaticAllTabs
        id={`operator-${props.block.id}`}
        label={props.block.label}
        defaultValue={props.block.defaultTab}
        tabs={tabs}
      />
    );
  }
  const requestedTab = tabQueryKey ? props.query[tabQueryKey] : undefined;
  const activeTab =
    typeof requestedTab === "string" ? requestedTab : localActiveTab;
  const activeValue = tabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : (tabs[0]?.value ?? "");
  const { Tabs } = host.components;
  return (
    <Tabs
      label={props.block.label}
      value={activeValue}
      tabs={tabs}
      onValueChange={(value) => {
        if (tabQueryKey) {
          props.onQueryChange({ [tabQueryKey]: value });
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
