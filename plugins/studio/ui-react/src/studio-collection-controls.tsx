/** @jsxImportSource react */
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button, NativeSelect } from "@brains/app-ui-react";
import {
  studioCollectionQuerySchema,
  type StudioCollectionQuery,
} from "../../src/collection-query";
import type { FieldDescriptor } from "./api";
import { editorClassName } from "./studio-editor.styles";
import { collectionControlStyles as styles } from "./studio-collection-controls.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioSearchField } from "./studio-search-field";

/** Presentation only: Library and Chat retain their own query contracts. */
export function StudioCollectionBar(props: {
  label: string;
  searchLabel: string;
  search: string;
  onSearch: (value: string) => void;
  filterLabel: string;
  filterCount: number;
  filtered: boolean;
  matchingCount?: number;
  onClear: () => void;
  children: ReactNode;
}): ReactElement {
  const filters = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // Dialogs listen on document capture; this inner disclosure owns Escape
    // first, but only when the event originated inside its open controls.
    const dismiss = (event: KeyboardEvent): void => {
      const details = filters.current;
      if (
        event.key !== "Escape" ||
        !details?.open ||
        !(event.target instanceof Node) ||
        !details.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    window.addEventListener("keydown", dismiss, true);
    return (): void => window.removeEventListener("keydown", dismiss, true);
  }, []);
  return (
    <section
      className={editorClassName("studio-collection-controls", styles.controls)}
      aria-label={props.label}
    >
      <div className={editorClassName("", styles.row)}>
        <StudioSearchField
          label={props.searchLabel}
          placeholder={props.searchLabel}
          value={props.search}
          wide
          onChange={props.onSearch}
        />
        <details
          ref={filters}
          className={editorClassName("", styles.filters)}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary
            className={editorClassName(
              "",
              styles.summary,
              props.filterCount > 0 && styles.open,
            )}
          >
            {props.filterLabel}
            {props.filterCount > 0 ? ` · ${props.filterCount}` : ""}
          </summary>
          <div className={editorClassName("", styles.panel)}>
            {props.children}
          </div>
        </details>
        {props.filtered && (
          <>
            {props.matchingCount !== undefined && (
              <span className={editorClassName("", styles.state)}>
                {props.matchingCount}{" "}
                {props.matchingCount === 1 ? "match" : "matches"}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              aria-label="Clear search and filters"
              onClick={props.onClear}
            >
              Clear
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Unknown totals stay unknown (Chat only provides one page at a time). */
export function StudioCollectionPager(props: {
  label: string;
  offset: number;
  count: number;
  total?: number;
  loading: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}): ReactElement {
  const range =
    props.count > 0
      ? `${props.offset + 1}–${props.offset + props.count}${props.total === undefined ? "" : ` of ${props.total}`}`
      : "No results on this page";
  return (
    <nav
      className={editorClassName("listing-pagination", library.pagination)}
      aria-label={props.label}
      aria-busy={props.loading}
    >
      <span className={editorClassName("", library.range)} aria-live="polite">
        {props.loading ? "Loading…" : range}
      </span>
      <span className={editorClassName("", library.pager)}>
        <Button
          type="button"
          variant="ghost"
          disabled={props.loading || props.offset === 0}
          onClick={props.onPrevious}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={props.loading || !props.hasNext}
          onClick={props.onNext}
        >
          Next
        </Button>
      </span>
    </nav>
  );
}

const SEARCH_DEBOUNCE_MS = 250;

export function StudioCollectionControls(props: {
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
  // Filters use the committed query, never an unsettled input value.
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
    <StudioCollectionBar
      label="Collection search and filters"
      searchLabel="Search title or content"
      search={search}
      onSearch={setSearch}
      filterLabel="Filter and sort"
      filterCount={filterCount}
      filtered={filtered}
      matchingCount={props.total}
      onClear={() => {
        setSearch("");
        props.onChange(
          studioCollectionQuerySchema.parse({ limit: props.query.limit }),
        );
      }}
    >
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
    </StudioCollectionBar>
  );
}
