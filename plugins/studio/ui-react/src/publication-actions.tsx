import { useCallback, useState, type ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import { publicationStyles as s } from "./studio-publication.styles";
import { StudioStatus } from "./studio-status";
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
      confirmVariant="primary"
      onCancel={props.onCancel}
      onConfirm={props.onConfirm}
    >
      <p>{props.preview}</p>
      <p {...stylex.props(s.confirmation)}>
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
    <section {...stylex.props(s.root)} aria-label="Publication actions">
      <header {...stylex.props(s.head)}>
        <span>Publication</span>
        <b
          {...stylex.props(
            s.state,
            props.status === "queued" && s.warning,
            props.status === "failed" && s.error,
            props.status === "published" && s.good,
          )}
        >
          {props.status}
        </b>
      </header>
      <p {...stylex.props(s.copy)}>
        Operates on the saved entity. Publication state is separate from the
        save pipeline below.
      </p>
      {props.unsaved && (
        <p {...stylex.props(s.copy, s.warning)}>
          Save changes before changing publication state.
        </p>
      )}
      {props.status !== "published" && (
        <div {...stylex.props(s.actions)}>
          <Button
            type="button"
            variant="ghost"
            xstyle={s.button}
            disabled={disabled}
            onClick={() => void execute(lifecycleAction, "lifecycle")}
          >
            {busy === "lifecycle" ? "Working…" : lifecycleLabel}
          </Button>
          <Button
            type="button"
            xstyle={[s.button, s.publish]}
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
        <p {...stylex.props(s.copy, s.complete)}>Published externally.</p>
      )}
      {error && <StudioStatus tone="error">{error}</StudioStatus>}
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
