/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@brains/app-ui-react";
import { getErrorMessage } from "@brains/utils/error";
import type { EntityDetail } from "./api";
import { useStudioApi } from "./studio-api-context";
import { StudioStatus } from "./studio-status";

import { recoveryStyles as styles } from "./studio-recovery.styles";

/** A lossless rescue copy, including metadata that isn't part of a raw body. */
export function rescueVersion(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  return JSON.stringify({ frontmatter, body }, null, 2);
}

export function StudioConflictRecovery(props: {
  entity: EntityDetail;
  draft: Record<string, unknown>;
  body: string;
  onUseLatest: (entity: EntityDetail) => void;
}): ReactElement {
  const api = useStudioApi();
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const request = useRef(0);
  const trigger = useRef<HTMLSpanElement | null>(null);
  useEffect(
    () => (): void => {
      request.current += 1;
    },
    [],
  );
  const localVersion = rescueVersion(props.draft, props.body);
  useEffect(() => setCopied(false), [localVersion]);
  const copy = async (): Promise<void> => {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(localVersion);
      setCopied(true);
    } catch {
      // Clipboard may be missing or denied; keep a selectable rescue copy.
      setError("Copy unavailable. Select Your version manually.");
      setOpen(true);
    }
  };
  const load = async (): Promise<void> => {
    const generation = ++request.current;
    setLoading(true);
    setLatest(null);
    setError(null);
    try {
      const entity = await api.fetchEntity(
        props.entity.entityType,
        props.entity.id,
      );
      if (request.current === generation) setLatest(entity);
    } catch (cause) {
      if (request.current === generation)
        setError(
          getErrorMessage(cause, "Latest version could not be loaded") ||
            "Latest version could not be loaded",
        );
    } finally {
      if (request.current === generation) setLoading(false);
    }
  };
  return (
    <>
      <div {...stylex.props(styles.actions)}>
        <span ref={trigger}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(true);
              void load();
            }}
          >
            Compare changes
          </Button>
        </span>
        <Button type="button" variant="ghost" onClick={() => void copy()}>
          Copy my version
        </Button>
      </div>
      {copied && (
        <StudioStatus>
          Version copied, including properties and body.
        </StudioStatus>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setConfirm(false);
            request.current += 1;
            setLoading(false);
          }
        }}
      >
        <DialogContent
          aria-describedby="conflict-comparison-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.querySelector("button")?.focus();
          }}
        >
          <DialogTitle>Compare changes</DialogTitle>
          <p id="conflict-comparison-description">
            Your draft is unchanged. Review both versions before choosing to
            replace it.
          </p>
          {error && <StudioStatus tone="error">{error}</StudioStatus>}
          <div {...stylex.props(styles.versions)}>
            <label>
              Your version
              <textarea
                {...stylex.props(styles.version)}
                readOnly
                value={localVersion}
              />
            </label>
            <label>
              Latest saved version
              <textarea
                {...stylex.props(styles.version)}
                readOnly
                value={
                  latest
                    ? rescueVersion(latest.frontmatter, latest.body)
                    : "Not loaded"
                }
              />
            </label>
          </div>
          <div {...stylex.props(styles.actions)}>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? "Loading latest…" : "Retry latest"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Keep editing my version
            </Button>
            <Button
              type="button"
              disabled={!latest || loading || error !== null}
              onClick={() => setConfirm(true)}
            >
              Use latest version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirm && latest && (
        <ConfirmDialog
          title="Replace your local draft?"
          titleId="replace-conflicted-draft"
          mark="↩"
          cancelLabel="Keep my draft"
          confirmLabel="Replace with latest"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            props.onUseLatest(latest);
            setConfirm(false);
            setOpen(false);
          }}
        >
          <p>
            This discards your local edits. Copy your version first if you want
            to keep it. Nothing is written to the server.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
