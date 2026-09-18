/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { systemFieldStyles } from "./studio-system-fields.styles";
import { Button } from "@brains/app-ui-react";
import type { ReactElement } from "react";
import { headStyles } from "./studio-page-head.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { typeHasPublicationField } from "./entity-fields";
import { StudioPageHead } from "./studio-page-head";
import { entityPublicationState, entityTitle, formatUpdated } from "./ui-utils";

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
    openEntity,
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
  return (
    <main
      className={editorClass(
        "",
        library.listing,
        headStyles.inset,
        canCreate && hierarchy.withMobileBar,
      )}
      data-studio-library=""
      aria-busy={entityListLoading}
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
        model={listingHead}
        action={
          (!systemDesign || canCreate) && (
            <Button
              type="button"
              disabled={!canCreate || !schema}
              data-studio-library-new=""
              xstyle={hierarchy.desktopCreateAction}
              onClick={startCreate}
            >
              New {entryLabel.toLowerCase()}
            </Button>
          )
        }
      />
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
        onNavigate={props.selectFolder}
      />
      {!entitySchema.isSingleton && (
        <StudioCollectionControls
          kind={hierarchyKind}
          query={props.collectionQuery}
          fields={entitySchema.fields}
          total={entityTotal}
          onChange={props.onCollectionQueryChange}
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
          <button
            type="button"
            key={entity.id}
            className={editorClass(
              "",
              library.row,
              editorStyles.listingRow,
              systemDesign && systemFieldStyles.collectionRow,
            )}
            data-studio-record=""
            onClick={() => openEntity(entity.id)}
          >
            {!systemDesign && (
              <span className={editorClass("", library.index)}>
                {String(entityOffset + index + 1).padStart(2, "0")}
              </span>
            )}
            <span
              className={editorClass(
                "",
                library.title,
                systemDesign && systemFieldStyles.collectionTitle,
              )}
              title={entity.id}
            >
              {entityTitle(entity, entity.path?.at(-1))}
              {(props.collectionQuery.q ||
                props.collectionQuery.scope === "collection") &&
                entity.path &&
                entity.path.length > 1 && (
                  <span className={editorClass("", hierarchy.context)}>
                    {entity.path.slice(0, -1).map(folderLabel).join(" / ")}
                  </span>
                )}
              {systemDesign && (
                <span {...stylex.props(systemFieldStyles.collectionMeta)}>
                  {entryLabel} ·{" "}
                  <time dateTime={entity.updated} title={entity.updated}>
                    {formatUpdated(entity.updated)}
                  </time>
                </span>
              )}
              {typeHasPublicationField(entitySchema.fields) && (
                <span
                  className={editorClass(
                    "studio-publication-state",
                    editorStyles.publication,
                  )}
                >
                  {entityPublicationState(entity)}
                </span>
              )}
            </span>
            {systemDesign ? (
              <span aria-hidden="true">→</span>
            ) : (
              <time
                className={editorClass("", library.updated)}
                dateTime={entity.updated}
                title={entity.updated}
              >
                {formatUpdated(entity.updated)}
              </time>
            )}
          </button>
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
      {canCreate && (
        <div
          data-studio-folder-action
          className={editorClass("", hierarchy.mobileBar)}
        >
          <span>
            Creating in <strong>{folderContext}</strong>
          </span>
          <Button type="button" onClick={startCreate} disabled={!schema}>
            New {entryLabel.toLowerCase()}
          </Button>
        </div>
      )}
    </main>
  );
}
