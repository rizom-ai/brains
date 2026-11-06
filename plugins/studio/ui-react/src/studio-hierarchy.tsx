/** @jsxImportSource react */
import {
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
  props: FolderNavigationProps & {
    collectionLabel: string;
    fixed?: boolean;
    /** Titles for prefix segments that name a container. */
    trail?: ReadonlyArray<string | null> | undefined;
  },
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
                {props.trail?.[index] ?? folderLabel(segment)}
              </span>
            ) : (
              <a
                className={editorClassName("", styles.crumb, styles.link)}
                href={folderHref(props, path)}
                onClick={(event) => navigateFolder(event, props, path)}
              >
                {props.trail?.[index] ?? folderLabel(segment)}
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
    <section aria-label={heading} className={editorClassName("", styles.group)}>
      <div className={editorClassName("", styles.label)}>
        <span>{heading}</span>
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
            {folder.title ?? folderLabel(folder.name)}
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

/** Path rules as an author reads them; other messages pass through. */
const SEGMENT_MESSAGES: ReadonlyArray<[RegExp, string]> = [
  [
    /path separators|cannot contain ':'/,
    "Leave out slashes: the file name is a single name, not a path.",
  ],
  [/dot segments/, "Use a name other than “.” or “..”."],
  [/null bytes/, "Remove the hidden control character from the name."],
];

function segmentMessage(message: string): string {
  return (
    SEGMENT_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? message
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
      : issue
        ? segmentMessage(issue.message)
        : issues?.length
          ? issues.map((item) => segmentMessage(item.message)).join(" ")
          : props.error?.message;
  const segmentInvalid =
    issue?.path[0] === "segment" || (!issues?.length && Boolean(props.error));
  const preview = !props.pending && !props.error ? props.preview : null;
  return (
    <section
      aria-label="New entry destination"
      className={editorClassName("", styles.destination)}
    >
      <label className={editorClassName("", styles.segment)}>
        File name
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
          Names the file inside this {props.kind ?? "folder"}: letters, numbers
          and hyphens work best, and no slashes.
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
        <p className={editorClassName("", styles.saveAs)}>
          Saves as{" "}
          <span className={editorClassName("", styles.value)}>
            {preview.filePath === null
              ? emphasizeRange(preview.entityId, preview.entityLeaf)
              : emphasizeRange(preview.filePath, preview.fileLeaf)}
          </span>
        </p>
      )}
    </section>
  );
}
