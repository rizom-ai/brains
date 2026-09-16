/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Button, NativeSelect } from "@brains/app-ui-react";
import {
  studioCollectionQuerySchema,
  type StudioCollectionQuery,
} from "../../src/collection-query";
import type { FieldDescriptor } from "./api";
import { editorClassName } from "./studio-editor.styles";
import { collectionControlStyles as styles } from "./studio-collection-controls.styles";
import { StudioSearchField } from "./studio-search-field";
import type { HierarchyKind } from "./studio-hierarchy";

/** Matches the Chat session index, so a query settles at the same pace. */
const SEARCH_DEBOUNCE_MS = 250;

export function StudioCollectionControls(props: {
  kind?: HierarchyKind;
  query: StudioCollectionQuery;
  fields: FieldDescriptor[];
  total: number;
  onChange: (query: StudioCollectionQuery) => void;
}): ReactElement {
  const [search, setSearch] = useState(props.query.q);
  useEffect(() => setSearch(props.query.q), [props.query.q]);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const committed = useRef(props.query);
  committed.current = props.query;
  // Typing settles on its own; a filter never carries an unsettled query with
  // it, because both commit from the same debounced value.
  useEffect(() => {
    if (search === committed.current.q) return;
    const timer = window.setTimeout(() => {
      const parsed = studioCollectionQuerySchema.safeParse({
        ...committed.current,
        q: search,
        offset: 0,
      });
      if (parsed.success) onChange.current(parsed.data);
    }, SEARCH_DEBOUNCE_MS);
    return (): void => window.clearTimeout(timer);
  }, [search]);
  const commit = (change: Record<string, unknown>): void => {
    const parsed = studioCollectionQuerySchema.safeParse({
      ...props.query,
      ...change,
      offset: 0,
    });
    if (parsed.success) props.onChange(parsed.data);
  };
  const statuses = [
    ...new Set(
      [
        ...(props.fields.find((field) => field.name === "status")?.options ??
          []),
        props.query.status,
      ].filter(Boolean),
    ),
  ];
  const filterCount =
    (props.query.visibility === "all" ? 0 : 1) + (props.query.status ? 1 : 0);
  const filtered =
    Boolean(props.query.q) ||
    filterCount > 0 ||
    props.query.sort !== "updated-desc";
  return (
    <section
      className={editorClassName("studio-collection-controls", styles.controls)}
      aria-label="Collection search and filters"
    >
      <div className={editorClassName("", styles.row)}>
        <StudioSearchField
          label="Search title or content"
          placeholder="Search title or content"
          value={search}
          wide
          onChange={setSearch}
        />
        <details className={editorClassName("", styles.filters)}>
          <summary
            className={editorClassName(
              "",
              styles.summary,
              filterCount > 0 && styles.open,
            )}
          >
            Filter and sort
            {filterCount > 0 ? ` · ${filterCount}` : ""}
          </summary>
          <div className={editorClassName("", styles.panel)}>
            <label>
              Visibility
              <NativeSelect
                value={props.query.visibility}
                onChange={(event) => commit({ visibility: event.target.value })}
              >
                <option value="all">All available</option>
                <option value="public">Public</option>
                <option value="shared">Shared</option>
                <option value="restricted">Restricted</option>
              </NativeSelect>
            </label>
            {statuses.length > 0 && (
              <label>
                Status
                <NativeSelect
                  value={props.query.status}
                  onChange={(event) => commit({ status: event.target.value })}
                >
                  <option value="">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <label>
              Sort
              <NativeSelect
                value={props.query.sort}
                onChange={(event) => commit({ sort: event.target.value })}
              >
                <option value="updated-desc">Recently updated</option>
                <option value="updated-asc">Least recently updated</option>
                <option value="created-desc">Newest created</option>
                <option value="created-asc">Oldest created</option>
              </NativeSelect>
            </label>
          </div>
        </details>
        {filtered && (
          <>
            <span className={editorClassName("", styles.state)}>
              {props.total} {props.total === 1 ? "match" : "matches"}
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label="Clear search and filters"
              onClick={() => {
                setSearch("");
                props.onChange(
                  studioCollectionQuerySchema.parse({
                    limit: props.query.limit,
                    prefix: props.query.prefix,
                    scope: props.query.scope,
                  }),
                );
              }}
            >
              Clear
            </Button>
          </>
        )}
      </div>
      {(props.query.prefix !== null || props.query.scope === "collection") && (
        <div
          role="group"
          aria-label="Search scope"
          className={editorClassName("", styles.scope)}
        >
          <span>Search</span>
          <button
            type="button"
            aria-pressed={props.query.scope === "folder"}
            className={editorClassName("", styles.scopeChoice)}
            onClick={() => commit({ scope: "folder" })}
          >
            This {props.kind ?? "folder"}
          </button>
          <button
            type="button"
            aria-pressed={props.query.scope === "collection"}
            className={editorClassName("", styles.scopeChoice)}
            onClick={() => commit({ scope: "collection" })}
          >
            Whole collection
          </button>
        </div>
      )}
    </section>
  );
}
