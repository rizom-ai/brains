/** @jsxImportSource react */
import { useEffect, useState, type ReactElement } from "react";
import { Button } from "@brains/app-ui-react";
import {
  studioCollectionQuerySchema,
  type StudioCollectionQuery,
} from "../../src/collection-query";
import type { FieldDescriptor } from "./api";
import { editorClassName } from "./studio-editor.styles";
import { collectionControlStyles as styles } from "./studio-collection-controls.styles";

export function StudioCollectionControls(props: {
  query: StudioCollectionQuery;
  fields: FieldDescriptor[];
  onChange: (query: StudioCollectionQuery) => void;
}): ReactElement {
  const [search, setSearch] = useState(props.query.q);
  useEffect(() => setSearch(props.query.q), [props.query.q]);
  const commit = (change: Record<string, unknown>): void => {
    const parsed = studioCollectionQuerySchema.safeParse({
      ...props.query,
      q: search,
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
  const filtered =
    props.query.q ||
    props.query.status ||
    props.query.visibility !== "all" ||
    props.query.sort !== "updated-desc";
  return (
    <section
      className={editorClassName("studio-collection-controls", styles.controls)}
      aria-label="Collection search and filters"
    >
      <form
        className={editorClassName("", styles.search)}
        onSubmit={(event) => {
          event.preventDefault();
          commit({});
        }}
      >
        <label className={editorClassName("", styles.searchLabel)}>
          Search title or content
          <input
            className={editorClassName("", styles.input)}
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <details>
        <summary className={editorClassName("", styles.summary)}>
          Filter and sort
          {props.query.visibility !== "all" || props.query.status
            ? " · filters active"
            : ""}
        </summary>
        <div className={editorClassName("", styles.fields)}>
          <label>
            Visibility
            <select
              className={editorClassName("", styles.input)}
              value={props.query.visibility}
              onChange={(event) => commit({ visibility: event.target.value })}
            >
              <option value="all">All available</option>
              <option value="public">Public</option>
              <option value="shared">Shared</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          {statuses.length > 0 && (
            <label>
              Status
              <select
                className={editorClassName("", styles.input)}
                value={props.query.status}
                onChange={(event) => commit({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Sort
            <select
              className={editorClassName("", styles.input)}
              value={props.query.sort}
              onChange={(event) => commit({ sort: event.target.value })}
            >
              <option value="updated-desc">Recently updated</option>
              <option value="updated-asc">Least recently updated</option>
              <option value="created-desc">Newest created</option>
              <option value="created-asc">Oldest created</option>
            </select>
          </label>
        </div>
      </details>
      {filtered && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setSearch("");
            props.onChange(
              studioCollectionQuerySchema.parse({ limit: props.query.limit }),
            );
          }}
        >
          Clear search and filters
        </Button>
      )}
    </section>
  );
}
