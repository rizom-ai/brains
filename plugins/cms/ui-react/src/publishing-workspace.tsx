import { useCallback, useState, type ReactElement } from "react";
import type {
  PublicationPipelineSnapshot,
  PublishingAction,
  PublishingActionResult,
  PublishConfirmationArgs,
} from "./api";
import { errorMessage, publicationLabel } from "./ui-utils";

function publicationSchedule(value: string | undefined): string {
  if (!value) return "next dispatch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isPublishingActionError(
  result: PublishingActionResult,
): result is Extract<PublishingActionResult, { success: false }> {
  return "success" in result && result.success === false;
}

export function isPublishConfirmation(
  result: PublishingActionResult,
): result is Extract<PublishingActionResult, { needsConfirmation: true }> {
  return "needsConfirmation" in result && result.needsConfirmation === true;
}

export function PublishConfirmationDialog(props: {
  title: string;
  preview: string;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={props.confirming ? undefined : props.onCancel}
    >
      <section
        className="delete-modal publication-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="publish-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="modal-mark" aria-hidden="true">
          ↑
        </span>
        <h3 id="publish-confirm-title">Publish {props.title} now?</h3>
        <p>{props.preview}</p>
        <p className="publication-confirm-warning">
          This sends the current saved version to an external public provider.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            autoFocus
            disabled={props.confirming}
            onClick={props.onCancel}
          >
            Review again
          </button>
          <button
            type="button"
            className="btn publish-confirm"
            disabled={props.confirming}
            onClick={props.onConfirm}
          >
            {props.confirming ? "Publishing…" : "Confirm publication"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PublicationActions(props: {
  entityType: string;
  entityId: string;
  title: string;
  status: string;
  unsaved: boolean;
  onAction: (action: PublishingAction) => Promise<PublishingActionResult>;
}): ReactElement {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    args: PublishConfirmationArgs;
    preview: string;
  } | null>(null);
  const target = {
    entityType: props.entityType,
    entityId: props.entityId,
  };
  const disabled = props.unsaved || busy !== null;

  const execute = useCallback(
    async (action: PublishingAction, key: string): Promise<void> => {
      setBusy(key);
      setError(null);
      try {
        const result = await props.onAction(action);
        if (isPublishingActionError(result)) throw new Error(result.error);
        if (isPublishConfirmation(result)) {
          setConfirmation({
            args: result.args,
            preview:
              result.preview ??
              `This will publish ${props.entityType}:${props.entityId} publicly.`,
          });
        } else if (action.type === "publish") {
          setConfirmation(null);
        }
      } catch (actionError: unknown) {
        setError(errorMessage(actionError));
      } finally {
        setBusy(null);
      }
    },
    [props],
  );

  const lifecycleAction =
    props.status === "queued"
      ? ({ type: "remove", ...target } as const)
      : props.status === "failed"
        ? ({ type: "retry", ...target } as const)
        : ({ type: "queue", ...target } as const);
  const lifecycleLabel =
    props.status === "queued"
      ? "Remove from queue"
      : props.status === "failed"
        ? "Retry"
        : "Add to queue";

  return (
    <section className="publication-actions" aria-label="Publication actions">
      <header>
        <span>Publication</span>
        <b className={`publication-state publication-state--${props.status}`}>
          {props.status}
        </b>
      </header>
      <p>
        Operates on the saved entity. Publication state is separate from the
        save pipeline below.
      </p>
      {props.unsaved && (
        <p className="publication-action-note">
          Save changes before changing publication state.
        </p>
      )}
      {props.status !== "published" && (
        <div className="publication-action-buttons">
          <button
            type="button"
            className="btn ghost"
            disabled={disabled}
            onClick={() => void execute(lifecycleAction, "lifecycle")}
          >
            {busy === "lifecycle" ? "Working…" : lifecycleLabel}
          </button>
          <button
            type="button"
            className="btn publication-publish-now"
            disabled={disabled}
            onClick={() =>
              void execute({ type: "publish", ...target }, "publish")
            }
          >
            {busy === "publish" ? "Preparing…" : "Publish now"}
          </button>
        </div>
      )}
      {props.status === "published" && (
        <p className="publication-action-complete">Published externally.</p>
      )}
      {error && <p className="status status-error">{error}</p>}
      {confirmation && (
        <PublishConfirmationDialog
          title={props.title}
          preview={confirmation.preview}
          confirming={busy === "confirm"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() =>
            void execute(
              {
                type: "publish",
                ...target,
                confirmation: confirmation.args,
              },
              "confirm",
            )
          }
        />
      )}
    </section>
  );
}

export function PublishingWorkspace(props: {
  data: PublicationPipelineSnapshot;
  onOpenEntity: (entityType: string, entityId: string) => void;
  onAction: (action: PublishingAction) => Promise<PublishingActionResult>;
}): ReactElement {
  const { data } = props;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const execute = useCallback(
    async (action: PublishingAction, key: string): Promise<void> => {
      setPendingAction(key);
      setActionError(null);
      try {
        const result = await props.onAction(action);
        if (isPublishingActionError(result)) throw new Error(result.error);
      } catch (error: unknown) {
        setActionError(errorMessage(error));
      } finally {
        setPendingAction(null);
      }
    },
    [props],
  );

  return (
    <main className="publishing-workspace">
      <header className="publishing-head">
        <div>
          <span className="publishing-kicker">Publication operations</span>
          <h2>Publishing desk</h2>
          <p>
            Review intent, inspect dispatch order, and resolve publication
            failures beside the content they belong to.
          </p>
        </div>
        <span className="publishing-online">Pipeline online</span>
      </header>

      <section className="publishing-vitals" aria-label="Pipeline summary">
        <div>
          <span>Queued</span>
          <b>{data.summary.queued}</b>
        </div>
        <div>
          <span>Generating</span>
          <b>{data.summary.generating}</b>
        </div>
        <div className={data.summary.needsOperator > 0 ? "needs" : ""}>
          <span>Needs attention</span>
          <b>{data.summary.needsOperator}</b>
        </div>
        <div>
          <span>Published</span>
          <b>{data.summary.published}</b>
        </div>
      </section>

      {actionError && (
        <p className="status status-error publishing-action-error">
          {actionError}
        </p>
      )}
      <div className="publishing-grid">
        <section className="dispatch-section">
          <header className="publishing-section-head">
            <h3>Dispatch queue</h3>
            <span>ordered within each destination</span>
          </header>
          {data.queue.length === 0 ? (
            <p className="publishing-empty">
              Nothing is queued for publication.
            </p>
          ) : (
            <ol className="dispatch-list">
              {data.queue.map((item, index) => {
                const destinationCount = data.queue.filter(
                  (candidate) => candidate.entityType === item.entityType,
                ).length;
                const key = `${item.entityType}:${item.entityId}`;
                return (
                  <li className="dispatch-row" key={key}>
                    <button
                      type="button"
                      className="dispatch-entity"
                      onClick={() =>
                        props.onOpenEntity(item.entityType, item.entityId)
                      }
                    >
                      <span className="dispatch-position">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="dispatch-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {item.entityType}/{item.entityId}
                        </small>
                      </span>
                      <span className="dispatch-destination">
                        {publicationLabel(item.destination)}
                      </span>
                      <time>{publicationSchedule(item.scheduledFor)}</time>
                      <span className="dispatch-open">open →</span>
                    </button>
                    <span className="dispatch-actions">
                      <button
                        type="button"
                        aria-label={`Move ${item.title} earlier`}
                        disabled={item.position <= 1 || pendingAction !== null}
                        onClick={() =>
                          void execute(
                            {
                              type: "reorder",
                              entityType: item.entityType,
                              entityId: item.entityId,
                              position: item.position - 1,
                            },
                            `${key}:earlier`,
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.title} later`}
                        disabled={
                          item.position >= destinationCount ||
                          pendingAction !== null
                        }
                        onClick={() =>
                          void execute(
                            {
                              type: "reorder",
                              entityType: item.entityType,
                              entityId: item.entityId,
                              position: item.position + 1,
                            },
                            `${key}:later`,
                          )
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="dispatch-remove"
                        aria-label={`Remove ${item.title} from queue`}
                        disabled={pendingAction !== null}
                        onClick={() =>
                          void execute(
                            {
                              type: "remove",
                              entityType: item.entityType,
                              entityId: item.entityId,
                            },
                            `${key}:remove`,
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="publishing-aside">
          <section className="publishing-card">
            <header>Generating now</header>
            {data.generating.length === 0 ? (
              <p>No publication assets are being generated.</p>
            ) : (
              data.generating.map((job) => (
                <button
                  type="button"
                  className="publication-job"
                  key={job.id}
                  onClick={() => {
                    const [entityType, ...id] = job.target.split("/");
                    if (entityType && id.length > 0) {
                      props.onOpenEntity(entityType, id.join("/"));
                    }
                  }}
                >
                  <strong>{publicationLabel(job.label)}</strong>
                  <span>
                    {job.target} · {job.status}
                  </span>
                  <i aria-hidden="true" />
                </button>
              ))
            )}
          </section>

          <section className="publishing-card publishing-card--attention">
            <header>Needs attention</header>
            {data.failures.length === 0 ? (
              <p>No failed publications.</p>
            ) : (
              data.failures.map((failure) => {
                const key = `${failure.entityType}:${failure.entityId}`;
                return (
                  <div className="publication-failure" key={key}>
                    <button
                      type="button"
                      className="publication-failure-open"
                      onClick={() =>
                        props.onOpenEntity(failure.entityType, failure.entityId)
                      }
                    >
                      <strong>{failure.title}</strong>
                      <span>
                        {failure.entityType}/{failure.entityId}
                      </span>
                      <small>{failure.error}</small>
                    </button>
                    <button
                      type="button"
                      className="publication-retry"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        void execute(
                          {
                            type: "retry",
                            entityType: failure.entityType,
                            entityId: failure.entityId,
                          },
                          `${key}:retry`,
                        )
                      }
                    >
                      {pendingAction === `${key}:retry` ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
