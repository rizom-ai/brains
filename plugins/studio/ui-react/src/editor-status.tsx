/** @jsxImportSource react */
import type { ReactElement, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { saveStyles as s } from "./studio-save.styles";
import { StudioStatus } from "./studio-status";
import type { GitSyncState } from "./api";
import { ConfirmDialog } from "@brains/app-ui-react";
import type { SaveState } from "./editor-workflow";

export function SaveStateNotice(props: {
  state: SaveState;
  conflictActions?: ReactNode;
}): ReactElement | null {
  const { state } = props;
  if (state.kind === "saved") {
    return state.noop ? (
      <StudioStatus tone="good" save>
        No changes — already saved.
      </StudioStatus>
    ) : (
      <StudioStatus tone="good" save>
        Saved through the entity service.
      </StudioStatus>
    );
  }
  if (state.kind === "conflict") {
    return (
      <section
        {...stylex.props(s.conflict)}
        role="alert"
        data-studio-conflict=""
      >
        <h4 {...stylex.props(s.conflictTitle)}>
          The manuscript changed elsewhere
        </h4>
        <p {...stylex.props(s.conflictCopy)}>{state.message}</p>
        {props.conflictActions}
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <StudioStatus tone="error" save>
        {state.message}
      </StudioStatus>
    );
  }
  return null;
}

export function editorSaveLabel(state: SaveState, dirty: boolean): string {
  if (state.kind === "saving") return "Saving…";
  if (state.kind === "conflict") return "Conflict — your changes are not saved";
  if (state.kind === "error") return "Save failed — your changes are not saved";
  return dirty ? "Unsaved changes" : "Saved";
}

export type StationState = "pending" | "active" | "done";

export interface PipelineView {
  db: StationState;
  exported: StationState;
  committed: StationState;
  /** Short ref of the latest commit, for the "last write" readout. */
  commitRef: string | null;
}

/** Derive the entity db → file export → git commit instrument state. */
export function derivePipeline(args: {
  save: SaveState;
  git: GitSyncState | null;
  baselineCommit: string | null;
}): PipelineView {
  const { save, git, baselineCommit } = args;
  const commitRef = git?.lastCommit ? git.lastCommit.slice(0, 7) : null;

  if (save.kind === "saving") {
    return {
      db: "active",
      exported: "pending",
      committed: "pending",
      commitRef,
    };
  }
  if (save.kind !== "saved") {
    return {
      db: "pending",
      exported: "pending",
      committed: "pending",
      commitRef,
    };
  }
  if (save.noop) {
    return { db: "done", exported: "done", committed: "done", commitRef };
  }
  if (!git) {
    return { db: "done", exported: "done", committed: "pending", commitRef };
  }
  if (git.hasChanges) {
    return { db: "done", exported: "done", committed: "active", commitRef };
  }
  if (git.lastCommit !== baselineCommit) {
    return { db: "done", exported: "done", committed: "done", commitRef };
  }
  return { db: "done", exported: "active", committed: "pending", commitRef };
}

function Station(props: { state: StationState; label: string }): ReactElement {
  return (
    <span
      {...stylex.props(
        s.station,
        props.state === "done" && s.done,
        props.state === "active" && s.active,
      )}
      data-studio-station={props.state}
    >
      <span
        {...stylex.props(
          s.dot,
          props.state === "done" && s.doneDot,
          props.state === "active" && s.activeDot,
        )}
      />
      {props.label}
    </span>
  );
}

function Track(props: { flowing: boolean }): ReactElement {
  return (
    <span
      {...stylex.props(s.track)}
      data-studio-flowing={props.flowing ? "" : undefined}
      aria-hidden="true"
    >
      <span {...stylex.props(s.flow, props.flowing && s.flowing)} />
    </span>
  );
}

/** The save-pipeline instrument strip: single-writer thesis as UI. */
export function PipelineStations(props: {
  view: PipelineView;
  gitConfigured: boolean;
}): ReactElement {
  const { view, gitConfigured } = props;
  return (
    <span {...stylex.props(s.wrap)}>
      <span {...stylex.props(s.stations)}>
        <Station state={view.db} label="entity db" />
        <Track flowing={view.db === "done" && view.exported === "active"} />
        <Station state={view.exported} label="exported to file" />
        {gitConfigured ? (
          <>
            <Track
              flowing={view.exported === "done" && view.committed === "active"}
            />
            <Station state={view.committed} label="committed" />
          </>
        ) : (
          <span {...stylex.props(s.station, s.noGit)}>no git remote</span>
        )}
      </span>
      {view.commitRef && (
        <span {...stylex.props(s.ref)}>
          last write <b {...stylex.props(s.refValue)}>{view.commitRef}</b>
        </span>
      )}
    </span>
  );
}

export function DeleteDialog(props: {
  entityId: string;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <ConfirmDialog
      mark="×"
      title="Delete this entry?"
      titleId="delete-title"
      cancelLabel="Keep entry"
      confirmLabel={props.deleting ? "Deleting…" : "Delete entry"}
      pending={props.deleting === true}
      confirmVariant="danger"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p>
        The exported file for <code>{props.entityId}</code> will be removed. Its
        history remains recoverable in git.
      </p>
    </ConfirmDialog>
  );
}
