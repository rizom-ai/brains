/** @jsxImportSource react */
import { Button, ConfirmDialog } from "@brains/app-ui-react";
import type { ReactElement, ReactNode } from "react";
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
import { TypeSwitcher } from "./entity-fields";
import { DeleteDialog } from "./editor-status";
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
export type { MobileEditorPane, StudioAppViewProps } from "./app-view-props";

/** Pane preferences are presentation-only and stay in the mounted app. */
export function mobileEditorEntry(
  schema: Pick<TypeSchema, "format" | "hasBody">,
  preferred: MobileEditorPane | null,
): MobileEditorPane {
  if (!schema.hasBody) return "details";
  return preferred ?? (schema.format === "raw" ? "preview" : "details");
}

export function StudioAppStatus(props: {
  message: string;
  error?: boolean;
  onRetry?: () => void;
  onHome?: () => void;
}): ReactElement {
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
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
  const { editing, canDelete, collectionLabel, workspaceBadges } = model;
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
      )}
      data-studio-shell=""
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <StudioChrome
        contextLabel={collectionLabel}
        navigation={{
          types,
          workspaces,
          activeEntityType: activeWorkspaceId ? null : entityType,
          activeWorkspaceId,
          workspaceBadges,
          selectEntityType,
          selectWorkspace,
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
            types={types}
            active={activeWorkspaceId ? null : entityType}
            onSelect={selectEntityType}
            workspaces={workspaces}
            activeWorkspace={activeWorkspaceId}
            workspaceBadges={workspaceRailBadges(workspaces)}
            onSelectWorkspace={selectWorkspace}
          />
        </aside>
        {activeWorkspaceId ? (
          <StudioWorkspacePane {...props} model={model} />
        ) : !editing ? (
          <StudioLibraryPane {...props} model={model} />
        ) : (
          <StudioEditorPane {...props} model={model} />
        )}
      </div>
      {deleteOpen && mode.kind === "edit" && canDelete && (
        <DeleteDialog
          entityId={mode.entity.id}
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
