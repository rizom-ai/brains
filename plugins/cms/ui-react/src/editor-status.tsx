import type { ReactElement } from "react";
import type { GitSyncState } from "./api";
import type { SaveState } from "./editor-workflow";

export function SaveStateNotice(props: {
  state: SaveState;
  onReload: () => void;
}): ReactElement | null {
  const { state, onReload } = props;
  if (state.kind === "saved") {
    return state.noop ? (
      <p className="status status-ok">No changes — already saved.</p>
    ) : (
      <p className="status status-ok">Saved through the entity service.</p>
    );
  }
  if (state.kind === "conflict") {
    return (
      <section className="conflict" role="alert">
        <h4>The manuscript changed elsewhere</h4>
        <p>{state.message}</p>
        <button type="button" className="btn ghost reload" onClick={onReload}>
          Reload latest
        </button>
      </section>
    );
  }
  if (state.kind === "error") {
    return <p className="status status-error">{state.message}</p>;
  }
  return null;
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
  const className =
    props.state === "pending" ? "station" : `station ${props.state}`;
  return (
    <span className={className}>
      <span className="dot" />
      {props.label}
    </span>
  );
}

function Track(props: { flowing: boolean }): ReactElement {
  return (
    <span className={props.flowing ? "track flowing" : "track"}>
      <span className="flow" />
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
    <span className="stations-wrap">
      <span className="stations">
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
          <span className="station no-git">no git remote</span>
        )}
      </span>
      {view.commitRef && (
        <span className="commit-ref">
          last write <b>{view.commitRef}</b>
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
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={props.deleting ? undefined : props.onCancel}
    >
      <section
        className="delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="modal-mark" aria-hidden="true">
          ×
        </span>
        <h3 id="delete-title">Delete this entry?</h3>
        <p>
          The exported file for <code>{props.entityId}</code> will be removed.
          Its history remains recoverable in git.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            autoFocus
            disabled={props.deleting}
            onClick={props.onCancel}
          >
            Keep entry
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={props.deleting}
            onClick={props.onConfirm}
          >
            {props.deleting ? "Deleting…" : "Delete entry"}
          </button>
        </div>
      </section>
    </div>
  );
}
