/** @jsxImportSource react */
import {
  Fragment,
  useId,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { EntityIdPath } from "@brains/plugins";
import type { StudioCollectionQuery } from "../../src/collection-query";
import {
  ApiError,
  type DestinationPreview,
  type EntityFolder,
  type ValidationIssue,
} from "./api";
import { collectionSearch } from "./collection-url-query";
import { editorClassName } from "./studio-editor.styles";
import { libraryStyles } from "./studio-library.styles";
import { hierarchyStyles as styles } from "./studio-hierarchy.styles";

/** A display label only — it never participates in stored identity or routing. */
export function folderLabel(segment: string): string {
  if (!segment) return "(empty segment)";
  return segment
    .replace(/[-_]/g, " ")
    .replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

export type HierarchyKind = "page" | "folder";

interface FolderNavigationProps {
  kind?: HierarchyKind;
  collectionPath: string;
  query: StudioCollectionQuery;
  onNavigate: (prefix: EntityIdPath | null) => void;
}

function folderHref(
  props: FolderNavigationProps,
  prefix: EntityIdPath | null,
): string {
  return `${props.collectionPath}${collectionSearch({ ...props.query, prefix, offset: 0 })}`;
}

function navigateFolder(
  event: MouseEvent<HTMLAnchorElement>,
  props: FolderNavigationProps,
  prefix: EntityIdPath | null,
): void {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  props.onNavigate(prefix);
}

export function StudioFolderTrail(
  props: FolderNavigationProps & { collectionLabel: string; fixed?: boolean },
): ReactElement | null {
  const prefix = props.query.prefix;
  if (!prefix) return null;
  return (
    <nav
      aria-label={props.kind === "page" ? "Page trail" : "Folder trail"}
      className={editorClassName("", styles.trail)}
    >
      {props.fixed ? (
        <span className={editorClassName("", styles.crumb)}>
          {props.collectionLabel}
        </span>
      ) : (
        <a
          className={editorClassName("", styles.crumb, styles.link)}
          href={folderHref(props, null)}
          onClick={(event) => navigateFolder(event, props, null)}
        >
          {props.collectionLabel}
        </a>
      )}
      {prefix.map((segment, index) => {
        const path: EntityIdPath = [prefix[0], ...prefix.slice(1, index + 1)];
        const current = index === prefix.length - 1;
        return (
          <span key={index}>
            <span aria-hidden="true"> / </span>
            {current || props.fixed ? (
              <span
                aria-current={current ? "page" : undefined}
                className={editorClassName("", styles.crumb)}
              >
                {folderLabel(segment)}
              </span>
            ) : (
              <a
                className={editorClassName("", styles.crumb, styles.link)}
                href={folderHref(props, path)}
                onClick={(event) => navigateFolder(event, props, path)}
              >
                {folderLabel(segment)}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function StudioFolderRows(
  props: FolderNavigationProps & { folders: EntityFolder[] },
): ReactElement | null {
  if (!props.folders.length) return null;
  const heading = props.kind === "page" ? "Pages" : "Folders";
  return (
    <section
      aria-label={`${heading} (complete list)`}
      className={editorClassName("", styles.group)}
    >
      <div className={editorClassName("", styles.label)}>
        <span>{heading}</span>
        <span>complete · not paged</span>
      </div>
      {props.folders.map((folder) => (
        <a
          key={JSON.stringify(folder.path)}
          data-studio-folder
          className={editorClassName("", libraryStyles.row, styles.folder)}
          href={folderHref(props, folder.path)}
          onClick={(event) => navigateFolder(event, props, folder.path)}
        >
          <span
            aria-hidden="true"
            className={editorClassName("", libraryStyles.index)}
          >
            /
          </span>
          <span className={editorClassName("", styles.folderTitle)}>
            {folderLabel(folder.name)}
          </span>
          <span className={editorClassName("", styles.count)}>
            {folder.descendantCount}{" "}
            {folder.descendantCount === 1 ? "entry" : "entries"}
            <span aria-hidden="true">›</span>
          </span>
        </a>
      ))}
    </section>
  );
}

export function StudioCreationLayout(props: {
  active: boolean;
  split: boolean;
  children: ReactNode;
}): ReactElement {
  return props.active ? (
    <div
      data-studio-creation-layout
      className={editorClassName(
        "",
        styles.creationBody,
        props.split && styles.creationBodySplit,
      )}
    >
      {props.children}
    </div>
  ) : (
    <>{props.children}</>
  );
}

function emphasizeRange(
  text: string,
  range: DestinationPreview["fileLeaf"],
): string | ReactElement {
  if (
    !range ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > text.length
  )
    return text;
  return (
    <>
      {text.slice(0, range.start)}
      <strong>{text.slice(range.start, range.end)}</strong>
      {text.slice(range.end)}
    </>
  );
}

export function StudioDestination(props: {
  kind?: HierarchyKind;
  segment: string;
  onSegmentChange: (segment: string) => void;
  preview: DestinationPreview | null;
  pending: boolean;
  error: Error | null;
  issues?: ValidationIssue[] | undefined;
}): ReactElement {
  const id = useId();
  const issues =
    props.error instanceof ApiError ? props.error.issues : props.issues;
  const issue = issues?.find(
    (item) => item.path[0] === "segment" || item.path[0] === "prefix",
  );
  const error =
    issue?.path[0] === "prefix"
      ? `Cannot create in this ${props.kind ?? "folder"}: ${issue.message}`
      : (issue?.message ??
        (issues?.length
          ? issues.map((item) => item.message).join(" ")
          : props.error?.message));
  const segmentInvalid =
    issue?.path[0] === "segment" || (!issues?.length && Boolean(props.error));
  const preview = !props.pending && !props.error ? props.preview : null;
  return (
    <section
      aria-label="New entry destination"
      className={editorClassName("", styles.destination)}
    >
      <label className={editorClassName("", styles.segment)}>
        Segment
        <input
          name="segment"
          className={editorClassName("", styles.input)}
          value={props.segment}
          onChange={(event) => props.onSegmentChange(event.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          aria-invalid={segmentInvalid}
          aria-describedby={`${id}-help${segmentInvalid ? ` ${id}-error` : ""}`}
        />
        <small id={`${id}-help`}>
          One segment in the selected {props.kind ?? "folder"}. No separators or
          traversal.
        </small>
      </label>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className={editorClassName("", styles.error)}
        >
          {error}
        </p>
      )}
      {props.pending && props.segment && (
        <p role="status" className={editorClassName("", styles.context)}>
          Checking destination…
        </p>
      )}
      {preview && (
        <dl className={editorClassName("", styles.preview)}>
          <dt>Path</dt>
          <dd className={editorClassName("", styles.value)}>
            [
            {preview.idPath.map((segment, index) => (
              <Fragment key={index}>
                {index > 0 ? ", " : ""}
                {index === preview.idPath.length - 1 ? (
                  <strong>{JSON.stringify(segment)}</strong>
                ) : (
                  JSON.stringify(segment)
                )}
              </Fragment>
            ))}
            ]
          </dd>
          <dt>Stored ID</dt>
          <dd className={editorClassName("", styles.value)}>
            {emphasizeRange(preview.entityId, preview.entityLeaf)}
          </dd>
          <dt>File</dt>
          <dd className={editorClassName("", styles.value)}>
            {preview.filePath === null
              ? "File preview unavailable"
              : emphasizeRange(preview.filePath, preview.fileLeaf)}
          </dd>
        </dl>
      )}
    </section>
  );
}
