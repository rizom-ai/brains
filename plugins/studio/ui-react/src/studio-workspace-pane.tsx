/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import {
  OperatorActionButton,
  OperatorViewRenderer,
} from "@brains/operator-view-react";
import type { ReactElement } from "react";
import { workspaceClassName } from "./studio-workspace.styles";
import { StudioStatus } from "./studio-status";
import { STUDIO_OPERATOR_COMPONENTS } from "./app-controls";
import type { StudioWorkspaceQuery } from "./queries";
import { StudioPageHead } from "./studio-page-head";

import type { StudioAppViewProps } from "./app-view-props";
import type { StudioAppModel } from "./studio-app-model";

export function StudioWorkspacePane(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement | null {
  const {
    activeWorkspaceId,
    workspaceError,
    declarativeWorkspaceData,
    workspaceQuery,
    openWorkspaceEntity,
    openWorkspaceLaunch,
    performDeclarativeAction,
    onWorkspaceQueryChange,
  } = props;
  const { declarativeHead } = props.model;
  return workspaceError && !declarativeWorkspaceData ? (
    <main className={workspaceClassName("")}>
      <StudioStatus tone="error">
        {workspaceError}
        <Button type="button" variant="ghost" onClick={props.onRetryRead}>
          Retry
        </Button>
      </StudioStatus>
    </main>
  ) : declarativeWorkspaceData && declarativeHead ? (
    <div className={workspaceClassName("studio-workspace-frame")}>
      {workspaceError && (
        <StudioStatus tone="error">
          Showing previously loaded content. {workspaceError}
          <Button type="button" variant="ghost" onClick={props.onRetryRead}>
            Retry
          </Button>
        </StudioStatus>
      )}
      <StudioPageHead
        model={declarativeHead}
        {...(declarativeHead.primaryAction
          ? {
              action: (
                <OperatorActionButton
                  action={declarativeHead.primaryAction}
                  primary
                  onAction={performDeclarativeAction}
                  components={STUDIO_OPERATOR_COMPONENTS}
                />
              ),
            }
          : {})}
      />
      <OperatorViewRenderer
        key={activeWorkspaceId}
        data={declarativeWorkspaceData}
        components={STUDIO_OPERATOR_COMPONENTS}
        renderHead={false}
        onOpenEntity={openWorkspaceEntity}
        onLaunch={openWorkspaceLaunch}
        onAction={performDeclarativeAction}
        query={workspaceQuery}
        {...(activeWorkspaceId
          ? {
              onQueryChange: (query: StudioWorkspaceQuery) =>
                onWorkspaceQueryChange(activeWorkspaceId, query, query),
            }
          : {})}
      />
    </div>
  ) : null;
}
