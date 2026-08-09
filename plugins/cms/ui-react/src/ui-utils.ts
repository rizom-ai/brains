import { useCallback, useRef, useState } from "react";
import { ApiError, type EntitySummary, type FieldDescriptor } from "./api";
import { getErrorMessage } from "@brains/utils/error";

/** Pick the list-row label for an entity: frontmatter title, else id. */
export function entityTitle(entity: EntitySummary): string {
  const title = entity.frontmatter["title"];
  return typeof title === "string" && title.length > 0 ? title : entity.id;
}

/** Initial frontmatter draft for a new entity: descriptor defaults only. */
export function emptyDraft(fields: FieldDescriptor[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) draft[field.name] = field.default;
  }
  return draft;
}

export function datetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function entityPublicationState(
  entity: EntitySummary,
): "draft" | "published" {
  const status = entity.frontmatter["status"];
  if (status === "published") return "published";
  return entity.frontmatter["published"] === true ? "published" : "draft";
}

export function singularLabel(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

export function publicationLabel(value: string): string {
  return value
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) =>
      part.length <= 3
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.issues.length > 0) {
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }
  return getErrorMessage(error);
}

export interface WorkspaceActionState<Result> {
  pendingKey: string | null;
  error: string | null;
  clearError: () => void;
  run: (key: string, action: () => Promise<Result>) => Promise<Result | null>;
}

/**
 * The keyed pending/error loop every workspace renderer needs around its
 * action calls. `run` resolves null when the call failed (the message lands
 * in `error`) or when another action is already in flight — the ref, not the
 * async pending state, is what makes the double-submit guard synchronous.
 */
export function useWorkspaceAction<Result>(): WorkspaceActionState<Result> {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const clearError = useCallback((): void => setError(null), []);
  const run = useCallback(
    async (
      key: string,
      action: () => Promise<Result>,
    ): Promise<Result | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPendingKey(key);
      setError(null);
      try {
        return await action();
      } catch (cause) {
        setError(errorMessage(cause));
        return null;
      } finally {
        inFlight.current = false;
        setPendingKey(null);
      }
    },
    [],
  );

  return { pendingKey, error, clearError, run };
}
