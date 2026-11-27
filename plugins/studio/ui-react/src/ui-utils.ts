import { useCallback, useRef, useState } from "react";
import { ApiError, type EntitySummary, type FieldDescriptor } from "./api";
import { getErrorMessage } from "@brains/utils/error";
import { capitalize } from "@brains/utils/string-utils";

/** Prefer an authored title, then the supplied display fallback or durable ID. */
export function entityTitle(entity: EntitySummary, fallback?: string): string {
  const title = entity.frontmatter["title"];
  const projected = entity.displayTitle?.trim();
  if (projected) return projected;
  if (typeof title === "string" && title.trim().length > 0) return title;
  return fallback?.length ? fallback : entity.id;
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
  if (elapsed < 0)
    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes === 0) return "Just now";
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatDay(iso);
}

/** A calendar day: "Nov 20, 2025". */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A row's date in words: the day it was published ("Nov 20, 2025"), which its
 * status already names, or when it was edited ("Edited 2 minutes ago").
 */
export function rowDateText(date: {
  kind: "published" | "edited";
  iso: string;
}): string {
  if (date.kind === "published") return formatDay(date.iso);
  const edited = formatUpdated(date.iso);
  return `Edited ${edited.charAt(0).toLowerCase()}${edited.slice(1)}`;
}

export function entityPublicationState(
  entity: EntitySummary,
): "draft" | "published" {
  const status = entity.frontmatter["status"];
  if (status === "published") return "published";
  return entity.frontmatter["published"] === true ? "published" : "draft";
}

/**
 * The status a Library row states: the entry's own status value, or draft and
 * published for a type with a published switch. Generating and failed are
 * left to the row's generation marker.
 */
export function entityRowStatus(
  entity: EntitySummary,
  fields: readonly FieldDescriptor[],
): string | null {
  const status = entity.frontmatter["status"];
  const statusField = fields.find((field) => field.name === "status");
  if (
    typeof status === "string" &&
    statusField?.options?.includes(status) === true
  )
    return status === "generating" || status === "failed" ? null : status;
  if (fields.some((field) => field.name === "published"))
    return entity.frontmatter["published"] === true ? "published" : "draft";
  return null;
}

/** The image a row shows as its cover, from the field its type names for it. */
export function entityRowCover(
  entity: EntitySummary,
  fields: readonly FieldDescriptor[],
): string | null {
  const field = fields.find((candidate) => candidate.column === "cover");
  const value = field ? entity.frontmatter[field.name] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What the entry is about, from the field its type shows as a row's excerpt. */
export function entityRowExcerpt(
  entity: EntitySummary,
  fields: readonly FieldDescriptor[],
): string | null {
  const field = fields.find((candidate) => candidate.column === "excerpt");
  const value = field ? entity.frontmatter[field.name] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The date that means something for a row: when it was published, else edited. */
export function entityRowDate(
  entity: EntitySummary,
  fields: readonly FieldDescriptor[],
): { kind: "published" | "edited"; iso: string } {
  const dateField = fields.find((field) => field.column === "date");
  const published = dateField ? entity.frontmatter[dateField.name] : undefined;
  return entityPublicationState(entity) === "published" &&
    typeof published === "string" &&
    !Number.isNaN(Date.parse(published))
    ? { kind: "published", iso: published }
    : { kind: "edited", iso: entity.updated };
}

/**
 * Where an entry the brain writes stands: still being written, or failed.
 * An entry that was written, or never generated, has no such state.
 */
export function entityGenerationState(
  entity: EntitySummary,
): "generating" | "failed" | null {
  const status = entity.frontmatter["status"];
  return status === "generating" || status === "failed" ? status : null;
}

/** A label as it reads mid-sentence: "New social post", "New FAQ". */
export function sentenceLabel(label: string): string {
  return label
    .split(" ")
    .map((word) => (/[A-Z].*[A-Z]/.test(word) ? word : word.toLowerCase()))
    .join(" ");
}

/** A stored option value as people read it; the value itself is unchanged. */
export function optionLabel(value: string): string {
  if (/[A-Z]/.test(value)) return value;
  const words = value.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function singularLabel(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

export function publicationLabel(value: string): string {
  return value
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : capitalize(part)))
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
