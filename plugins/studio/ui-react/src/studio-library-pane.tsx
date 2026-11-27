/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { systemFieldStyles } from "./studio-system-fields.styles";
import { Button } from "@brains/app-ui-react";
import type { MouseEvent, ReactElement } from "react";
import { studioEntityPath } from "../../src/studio-paths";
import { isPlainLinkClick } from "./link-click";
import { getStudioRouterBasePath } from "./studio-router";
import { headStyles } from "./studio-page-head.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { StudioPageHead } from "./studio-page-head";
import { StudioEntityImage } from "./studio-entity-image";
import { useDensityPreference } from "./use-density-preference";
import { STUDIO_THUMBNAIL_WIDTH } from "../../src/studio-thumbnail";
import {
  entityGenerationState,
  entityRowCover,
  entityRowDate,
  entityRowExcerpt,
  entityRowStatus,
  entityTitle,
  optionLabel,
  rowDateText,
  sentenceLabel,
} from "./ui-utils";
import type { EntitySummary } from "./api";
import { pickedLine, refineActionLabel } from "./refine";
import {
  RefineDialog,
  RefineMark,
  RefineNoticeLine,
  useStudioRefine,
  type StudioRefine,
} from "./studio-refine";
import { refineStyles } from "./studio-refine.styles";

import {
  StudioCollectionControls,
  StudioCollectionPager,
} from "./studio-collection-controls";
import {
  StudioFolderTrail,
  StudioFolderRows,
  folderLabel,
} from "./studio-hierarchy";
import { hierarchyStyles as hierarchy } from "./studio-hierarchy.styles";

import type { StudioAppViewProps } from "./app-view-props";
import type { StudioAppModel } from "./studio-app-model";

export function StudioLibraryPane(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const {
    entities,
    entityOffset,
    entityLimit,
    entityTotal,
    entityListLoading,
    schema,
    changeEntityPage,
    startCreate,
  } = props;
  const {
    activeType,
    entitySchema,
    systemDesign,
    canCreate,
    hierarchyKind,
    folderContext,
    collectionLabel,
    entryLabel,
    pageEnd,
    collectionFiltered,
    listingHead,
  } = props.model;
  const refine = useStudioRefine({
    activeType,
    entityType: props.entityType,
    entities,
    entityOffset,
    entryLabel,
    collectionLabel,
    onConfirmed: props.onRefineConfirmed,
  });
  const picking = refine.picked.length > 0;
  const [density, setDensity] = useDensityPreference();
  // Only rows with an excerpt or a cover have anything to leave out.
  const compactable = entitySchema.fields.some(
    (field) => field.column === "excerpt" || field.column === "cover",
  );
  const compact = compactable && density === "compact";
  const refineLabel = refineActionLabel(
    refine.picked.length,
    entryLabel,
    collectionLabel,
  );
  const target = activeType?.refinesInto;
  return (
    <main
      className={editorClass(
        "",
        library.listing,
        headStyles.inset,
        (canCreate || picking) && hierarchy.withMobileBar,
      )}
      data-studio-library=""
      aria-busy={entityListLoading}
      onKeyDown={(event) => {
        // Escape puts the list back, as Cancel does.
        if (event.key === "Escape" && picking && !refine.asking) refine.clear();
      }}
    >
      {props.readError && (
        <StudioStatus tone="error">
          {entities?.length ? "Showing previously loaded entries. " : ""}
          {props.readError}
          <Button type="button" variant="ghost" onClick={props.onRetryRead}>
            Retry
          </Button>
        </StudioStatus>
      )}
      <StudioPageHead
        model={
          picking
            ? {
                ...listingHead,
                metadata: [pickedLine(refine.picked.length, entityTotal)],
              }
            : listingHead
        }
        action={
          picking ? (
            // The page keeps one action: while entries are picked it is Refine.
            <>
              <Button
                type="button"
                variant="ghost"
                xstyle={hierarchy.desktopCreateAction}
                onClick={refine.clear}
              >
                Cancel
              </Button>
              <Button
                type="button"
                data-studio-library-refine=""
                xstyle={hierarchy.desktopCreateAction}
                onClick={refine.ask}
              >
                {refineLabel}
              </Button>
            </>
          ) : (
            (!systemDesign || canCreate) && (
              <Button
                type="button"
                disabled={!canCreate || !schema}
                data-studio-library-new=""
                xstyle={hierarchy.desktopCreateAction}
                onClick={startCreate}
              >
                New {sentenceLabel(entryLabel)}
              </Button>
            )
          )
        }
      />
      <RefineNoticeLine notice={props.refineNotice ?? null} />
      {refine.refusal && (
        <StudioStatus tone="error">{refine.refusal}</StudioStatus>
      )}
      {systemDesign && (
        <p
          data-studio-system-intro=""
          {...stylex.props(systemFieldStyles.collectionIntro)}
        >
          {systemDesign.intro}
        </p>
      )}
      <StudioFolderTrail
        kind={hierarchyKind}
        collectionLabel={collectionLabel}
        collectionPath={props.collectionPath}
        query={props.collectionQuery}
        trail={props.collectionTrail}
        onNavigate={props.selectFolder}
      />
      {!entitySchema.isSingleton && (
        <StudioCollectionControls
          kind={hierarchyKind}
          query={props.collectionQuery}
          fields={entitySchema.fields}
          total={entityTotal}
          onChange={props.onCollectionQueryChange}
          {...(compactable && { density, onDensityChange: setDensity })}
        />
      )}
      {!entityListLoading && (
        <StudioFolderRows
          kind={hierarchyKind}
          folders={props.folders}
          collectionPath={props.collectionPath}
          query={props.collectionQuery}
          onNavigate={props.selectFolder}
        />
      )}
      {props.folders.length > 0 && entityTotal > 0 && (
        <div className={editorClass("", hierarchy.label)}>
          <span>Entries here</span>
          <span>{entityTotal}</span>
        </div>
      )}
      {!entitySchema.isSingleton && entityTotal > 0 && (
        <StudioCollectionPager
          label={`${activeType?.label ?? "Entity"} pagination`}
          offset={entityOffset}
          count={Math.max(0, pageEnd - entityOffset)}
          total={entityTotal}
          loading={entityListLoading}
          hasNext={entityOffset + entityLimit < entityTotal}
          onPrevious={() =>
            changeEntityPage(Math.max(0, entityOffset - entityLimit))
          }
          onNext={() => changeEntityPage(entityOffset + entityLimit)}
        />
      )}
      {entityListLoading && (
        <StudioStatus className={editorClass("", library.empty)}>
          Loading entries…
        </StudioStatus>
      )}
      {!entityListLoading &&
        (entities ?? []).map((entity, index) => (
          <LibraryRow
            key={entity.id}
            entity={entity}
            index={String(entityOffset + index + 1).padStart(2, "0")}
            view={props}
            refine={refine}
            picking={picking}
            compact={compact}
          />
        ))}
      {!props.readError &&
        !entityListLoading &&
        entities?.length === 0 &&
        props.folders.length === 0 && (
          <StudioStatus className={editorClass("", library.empty)}>
            {props.collectionQuery.q ||
            props.collectionQuery.status ||
            props.collectionQuery.visibility !== "all"
              ? "No entries match these filters. Clear or change the filters to try again."
              : canCreate
                ? "Nothing here yet — start the first entry."
                : "No entries are available in this collection."}
            {collectionFiltered &&
              props.collectionQuery.prefix &&
              props.collectionQuery.scope === "folder" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    props.onCollectionQueryChange({
                      ...props.collectionQuery,
                      scope: "collection",
                      offset: 0,
                    })
                  }
                >
                  Search whole collection
                </Button>
              )}
          </StudioStatus>
        )}
      {picking ? (
        // On a phone the page's action sits in the action bar.
        <div
          data-studio-refine-action
          className={editorClass("", hierarchy.mobileBar)}
        >
          <Button type="button" variant="ghost" onClick={refine.clear}>
            Cancel
          </Button>
          <Button type="button" onClick={refine.ask}>
            {refineLabel}
          </Button>
        </div>
      ) : (
        canCreate && (
          <div
            data-studio-folder-action
            className={editorClass("", hierarchy.mobileBar)}
          >
            <span>
              Creating in <strong>{folderContext}</strong>
            </span>
            <Button type="button" onClick={startCreate} disabled={!schema}>
              New {sentenceLabel(entryLabel)}
            </Button>
          </div>
        )
      )}
      {refine.asking && props.entityType && target && (
        <RefineDialog
          entityType={props.entityType}
          entryLabel={entryLabel}
          collectionLabel={collectionLabel}
          targetLabel={target.label}
          picked={(entities ?? []).filter(({ id }) =>
            refine.picked.includes(id),
          )}
          onCancel={refine.closeAsk}
          onRefused={refine.refused}
          onConfirmed={(entityId) => {
            refine.confirmed(entityId);
            // Studio moves to where the refined entry is being written.
            props.selectEntityType(target.entityType);
          }}
        />
      )}
    </main>
  );
}

/**
 * One entry in the listing. Where the collection can be refined, the row
 * is the mark and the entry side by side, each its own control; anywhere
 * else it is the entry alone, as it always was.
 */
function LibraryRow(props: {
  entity: EntitySummary;
  index: string;
  view: StudioAppViewProps & { model: StudioAppModel };
  refine: StudioRefine;
  picking: boolean;
  /** One line per entry: no excerpt or cover. */
  compact: boolean;
}): ReactElement {
  const { entity, view, refine } = props;
  const { systemDesign, entitySchema } = view.model;
  const query = view.collectionQuery;
  const title = entityTitle(entity, entity.path?.at(-1));
  const generation = entityGenerationState(entity);
  const status = entityRowStatus(entity, entitySchema.fields);
  const rowDate = entityRowDate(entity, entitySchema.fields);
  const excerpt = props.compact
    ? null
    : entityRowExcerpt(entity, entitySchema.fields);
  const covered =
    !props.compact &&
    entitySchema.fields.some((field) => field.column === "cover");
  const coverImage = entityRowCover(entity, entitySchema.fields);
  // The title names the entry, so its thumbnail is decorative.
  const coverCell = covered && (
    <span
      data-studio-row-cover=""
      aria-hidden="true"
      {...stylex.props(library.cover)}
    >
      {coverImage && (
        <StudioEntityImage
          imageId={coverImage}
          thumbnailWidth={STUDIO_THUMBNAIL_WIDTH}
          alt=""
          placeholder={<span {...stylex.props(library.coverPending)} />}
          {...stylex.props(library.coverImage)}
        />
      )}
    </span>
  );
  const open = (): void => view.openEntity(entity.id, entity.entityType);
  // A row is a link, so it opens in a new tab or copies like any other; a
  // plain click opens the entry in place.
  const href = studioEntityPath(
    getStudioRouterBasePath(),
    entity.entityType,
    entity.id,
  );
  const follow = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLinkClick(event)) return;
    event.preventDefault();
    open();
  };
  const titleCell = (
    <span className={editorClass("", library.title)} title={entity.id}>
      {title}
      {(query.q || query.scope === "collection") &&
        entity.path &&
        entity.path.length > 1 && (
          <span className={editorClass("", hierarchy.context)}>
            {entity.path.slice(0, -1).map(folderLabel).join(" / ")}
          </span>
        )}
      {excerpt && (
        <span data-studio-row-excerpt="" {...stylex.props(library.excerpt)}>
          {excerpt}
        </span>
      )}
      {status && (
        <span
          className={editorClass(
            "studio-publication-state",
            editorStyles.publication,
            props.compact && library.inlineStatus,
          )}
        >
          {optionLabel(status)}
        </span>
      )}
      {generation && (
        <span
          data-studio-generation={generation}
          className={editorClass("", editorStyles.publication)}
        >
          {generation}
        </span>
      )}
    </span>
  );
  if (refine.available && !systemDesign) {
    const picked = refine.picked.includes(entity.id);
    return (
      <div
        data-studio-row=""
        {...(props.picking && { "data-picking": "" })}
        className={editorClass(
          "",
          library.row,
          editorStyles.listingRow,
          refineStyles.row,
          covered && library.covered,
          props.compact && library.compact,
          picked && refineStyles.rowPicked,
        )}
      >
        <RefineMark
          index={props.index}
          title={title}
          picked={picked}
          onToggle={() => refine.toggle(entity.id)}
        />
        <a
          href={href}
          data-studio-record=""
          {...stylex.props(refineStyles.open)}
          onClick={follow}
        >
          {coverCell}
          {titleCell}
          <time
            className={editorClass("", library.updated, refineStyles.updated)}
            dateTime={rowDate.iso}
            title={rowDate.iso}
          >
            {rowDateText(rowDate)}
          </time>
        </a>
      </div>
    );
  }
  return (
    <a
      href={href}
      className={editorClass(
        "",
        library.row,
        library.recordLink,
        editorStyles.listingRow,
        covered && library.covered,
        props.compact && library.compact,
      )}
      data-studio-record=""
      onClick={follow}
    >
      <span className={editorClass("", library.index)}>{props.index}</span>
      {coverCell}
      {titleCell}
      <time
        className={editorClass("", library.updated)}
        dateTime={rowDate.iso}
        title={rowDate.iso}
      >
        {rowDateText(rowDate)}
      </time>
    </a>
  );
}
