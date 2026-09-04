import { useCallback, useState, type ReactElement } from "react";
import type {
  PublishingAction,
  PublishingActionResult,
  PublishConfirmationArgs,
} from "./api";
import { Button, ConfirmDialog } from "@brains/app-ui-react";
import { errorMessage } from "./ui-utils";

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
    <ConfirmDialog
      mark="↑"
      title={`Publish ${props.title} now?`}
      titleId="publish-confirm-title"
      cancelLabel="Review again"
      confirmLabel={props.confirming ? "Publishing…" : "Confirm publication"}
      pending={props.confirming}
      sectionClassName="publication-modal"
      confirmVariant="primary"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p>{props.preview}</p>
      <p className="publication-confirm-warning">
        This sends the current saved version to an external public provider.
      </p>
    </ConfirmDialog>
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

  const lifecycleAction: PublishingAction =
    props.status === "queued"
      ? { type: "remove", ...target }
      : props.status === "failed"
        ? { type: "retry", ...target }
        : { type: "queue", ...target };
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
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => void execute(lifecycleAction, "lifecycle")}
          >
            {busy === "lifecycle" ? "Working…" : lifecycleLabel}
          </Button>
          <Button
            type="button"
            className="publication-publish-now"
            disabled={disabled}
            onClick={() =>
              void execute({ type: "publish", ...target }, "publish")
            }
          >
            {busy === "publish" ? "Preparing…" : "Publish now"}
          </Button>
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
