/** @jsxImportSource react */
import { tabBarStyles } from "./studio-tab-bar.styles";
import * as stylex from "@stylexjs/stylex";
import { askStyles } from "./studio-ask-panel.styles";
import {
  askFields,
  replaceSelection,
  type AskSelection,
} from "./ask-panel-model";
import type { Proposal } from "./chat-proposals";
import { Button, ConfirmDialog } from "@brains/app-ui-react";
import { lazy, Suspense, type ReactElement, type ReactNode } from "react";
import { typographyStyles } from "./studio-typography.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import {
  accountClass,
  accountStyles as accountLayout,
} from "./studio-account.styles";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import { editorClassName as editorClass } from "./studio-editor.styles";
import type { EntityTypeInfo, StudioWorkspaceInfo, TypeSchema } from "./api";
import { DeleteDialog } from "./editor-status";
import { entityTitle } from "./ui-utils";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";

import type { MobileEditorPane, StudioAppViewProps } from "./app-view-props";
import { deriveStudioAppModel, workspaceRailBadges } from "./studio-app-model";

import { StudioEditorPane } from "./studio-editor-pane";
import { StudioLibraryPane } from "./studio-library-pane";
import { StudioWorkspacePane } from "./studio-workspace-pane";
import { TypeSwitcher } from "./studio-type-navigation";
export type { MobileEditorPane, StudioAppViewProps } from "./app-view-props";

/** Pane preferences are presentation-only and stay in the mounted app. */
/**
 * Where a phone opens an entry: on what it says, or where a new one is
 * written. Properties are one tap away; a bodyless record has only them.
 */
export function mobileEditorEntry(
  schema: Pick<TypeSchema, "format" | "hasBody">,
  preferred: MobileEditorPane | null,
  creating = false,
): MobileEditorPane {
  if (!schema.hasBody) return "details";
  return preferred ?? (creating ? "write" : "preview");
}

export function StudioAppStatus(props: {
  message: string;
  error?: boolean;
  onRetry?: () => void;
  onHome?: () => void;
  children?: ReactNode;
}): ReactElement {
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
        tabBarStyles.space,
      )}
      data-studio-shell=""
    >
      <StudioChrome contextLabel="Studio" />
      <main aria-label="Studio status">
        <StudioStatus
          tone={props.error ? "error" : undefined}
          className={editorClass("", library.boot)}
        >
          {props.message}
          {props.onRetry && (
            <Button type="button" variant="ghost" onClick={props.onRetry}>
              Retry
            </Button>
          )}
          {props.onHome && (
            <Button type="button" variant="ghost" onClick={props.onHome}>
              Open Studio
            </Button>
          )}
        </StudioStatus>
        {props.children && (
          <div className={editorClass("", library.boot)}>{props.children}</div>
        )}
      </main>
    </div>
  );
}

export function StudioAccountWorkspaceView(props: {
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  workspaceId: string;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  children: ReactNode;
}): ReactElement {
  const navigationCollapsed = useStudioNavigationCollapsed();
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
        tabBarStyles.space,
      )}
      data-view="account"
      data-studio-shell=""
    >
      <StudioChrome
        contextLabel="Account"
        navigation={{
          types: props.types,
          workspaces: props.workspaces,
          activeEntityType: null,
          activeWorkspaceId: props.workspaceId,
          workspaceBadges: workspaceRailBadges(props.workspaces),
          selectEntityType: props.selectEntityType,
          selectWorkspace: props.selectWorkspace,
        }}
      />
      <div
        className={navClass(
          "",
          layout.body,
          nav.shell,
          navigationCollapsed && nav.shellCollapsed,
        )}
        data-studio-body=""
      >
        <aside className={navClass("rail", nav.rail)}>
          <TypeSwitcher
            renderMode="desktop"
            types={props.types}
            active={null}
            onSelect={props.selectEntityType}
            workspaces={props.workspaces}
            activeWorkspace={props.workspaceId}
            workspaceBadges={workspaceRailBadges(props.workspaces)}
            onSelectWorkspace={props.selectWorkspace}
          />
        </aside>
        <main
          className={accountClass("account-studio-pane", accountLayout.pane)}
        >
          {props.children}
        </main>
      </div>
    </div>
  );
}

export function StudioAppView(props: StudioAppViewProps): ReactElement {
  const navigationCollapsed = useStudioNavigationCollapsed();
  const {
    activeWorkspaceId,
    types,
    workspaces,
    entityType,
    editor,
    deleting,
    navigationBlocked,
    dispatchEditor,
    selectEntityType,
    selectWorkspace,
    remove,
    onNavigationReset,
    onNavigationProceed,
  } = props;
  const { mode, deleteOpen } = editor;
  const model = deriveStudioAppModel(props);
  const askPanel = askPanelFor(props, model);
  const { editing, canDelete, collectionLabel, workspaceBadges } = model;
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
        tabBarStyles.space,
      )}
      data-studio-shell=""
      data-view={
        props.groupingView
          ? "grouping"
          : props.imagesView
            ? "images"
            : activeWorkspaceId
              ? "workspace"
              : editing
                ? "editor"
                : "listing"
      }
    >
      <StudioChrome
        pageTitle={editing ? model.editorHead.title : undefined}
        contextLabel={
          props.groupReturnLabel ??
          (props.images?.active ? "Images" : undefined) ??
          props.groupings?.items.find(
            (grouping) => grouping.key === props.groupings?.active,
          )?.label ??
          collectionLabel
        }
        navigation={{
          groupings: props.groupings,
          images: props.images,
          types,
          workspaces,
          activeEntityType:
            activeWorkspaceId || props.groupings?.active || props.images?.active
              ? null
              : entityType,
          activeWorkspaceId,
          workspaceBadges,
          selectEntityType,
          selectWorkspace,
          editing,
        }}
      />
      <div
        className={navClass(
          "",
          layout.body,
          nav.shell,
          navigationCollapsed && nav.shellCollapsed,
        )}
        data-studio-body=""
      >
        <aside className={navClass("rail", nav.rail)}>
          <TypeSwitcher
            renderMode="desktop"
            focus={editing}
            groupings={props.groupings}
            images={props.images}
            types={types}
            active={
              activeWorkspaceId ||
              props.groupings?.active ||
              props.images?.active
                ? null
                : entityType
            }
            onSelect={selectEntityType}
            workspaces={workspaces}
            activeWorkspace={activeWorkspaceId}
            workspaceBadges={workspaceRailBadges(workspaces)}
            onSelectWorkspace={selectWorkspace}
          />
        </aside>
        {props.groupingView ??
          props.imagesView ??
          props.homeView ??
          (activeWorkspaceId ? (
            <StudioWorkspacePane {...props} model={model} />
          ) : !editing ? (
            <StudioLibraryPane {...props} model={model} />
          ) : askPanel ? (
            <div {...stylex.props(askStyles.row)}>
              <div {...stylex.props(askStyles.grow)}>
                <StudioEditorPane {...props} model={model} />
              </div>
              {askPanel}
            </div>
          ) : (
            <StudioEditorPane {...props} model={model} />
          ))}
      </div>
      {deleteOpen && mode.kind === "edit" && canDelete && (
        <DeleteDialog
          title={entityTitle(mode.entity)}
          deleting={deleting}
          onCancel={() => dispatchEditor({ type: "deleteCancelled" })}
          onConfirm={remove}
        />
      )}
      {navigationBlocked && (
        <ConfirmDialog
          mark="↩"
          title="Discard unsaved changes?"
          titleId="discard-navigation-title"
          cancelLabel="Keep editing"
          confirmLabel="Discard and continue"
          confirmVariant="danger"
          onCancel={onNavigationReset}
          onConfirm={onNavigationProceed}
        >
          <p>
            This draft has not been saved. Continue only if you want to leave it
            behind.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * Ask beside the open entry, when it is open and the entry can be assisted.
 * A proposal goes into the draft through the editor's own changes, so it is
 * saved, discarded or kept for recovery like any other edit.
 */
// Ask loads with its first opening, so editing never waits on Chat.
const LazyAskPanel = lazy(async () => {
  const module = await import("./studio-ask-panel");
  return { default: module.StudioAskPanel };
});

function askPanelFor(
  props: StudioAppViewProps,
  model: ReturnType<typeof deriveStudioAppModel>,
): ReactElement | null {
  const { ask, editor, dispatchEditor } = props;
  const { mode, body } = editor;
  if (!ask?.open || mode.kind !== "edit" || !model.canAssist) return null;
  const descriptors = model.entitySchema.fields;
  const apply = (
    proposal: Proposal,
    selection: AskSelection | null,
  ): string | null => {
    if (proposal.field === "selection") {
      const replaced = selection
        ? replaceSelection(body, selection, proposal.text)
        : null;
      if (replaced === null)
        return "The selected passage has changed. Select it again and ask once more.";
      dispatchEditor({ type: "bodyChanged", body: replaced });
      return null;
    }
    if (proposal.field === "body") {
      dispatchEditor({ type: "bodyChanged", body: proposal.text });
      return null;
    }
    const descriptor = descriptors.find(
      (field) => field.name === proposal.field,
    );
    if (!descriptor)
      return `This entry has no ${proposal.label.toLowerCase()}.`;
    dispatchEditor({ type: "fieldChanged", descriptor, raw: proposal.text });
    return null;
  };
  return (
    <Suspense fallback={null}>
      <LazyAskPanel
        key={`${model.selectedEntityType}:${mode.entity.id}`}
        chatApiPath={ask.chatApiPath}
        draftStore={ask.draftStore}
        entityType={model.selectedEntityType}
        entityId={mode.entity.id}
        title={model.editorHead.title}
        typeLabel={model.entryLabel.toLowerCase()}
        savedBody={mode.entity.body}
        unsaved={props.hasUnsavedChanges}
        selection={ask.selection}
        onClearSelection={() => ask.setSelection(null)}
        fields={askFields(descriptors)}
        agents={props.agentTargets}
        onApply={apply}
        onClose={() => ask.setOpen(false)}
      />
    </Suspense>
  );
}
