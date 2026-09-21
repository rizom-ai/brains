/** @jsxImportSource react */
import { groupingValueLabel } from "./grouping-value";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, NativeSelect } from "@brains/app-ui-react";
import type { StudioGrouping } from "../../src/grouping-vocabulary-contract";
import { GroupingValue } from "./grouping-vocabulary-fields";
import { formatLabel } from "@brains/utils/string-utils";
import {
  studioGroupingQuerySchema,
  type StudioGroupingQuery,
} from "../../src/grouping-query";
import type { EntityTypeInfo, GroupingPage } from "./api";
import { useStudioApi } from "./studio-api-context";
import {
  groupingQueryOptions,
  isGroupingsInitializing,
} from "./grouping-queries";
import { StudioPageHead, studioAccessRequirement } from "./studio-page-head";
import { StudioStatus } from "./studio-status";
import {
  StudioCollectionBar,
  StudioCollectionPager,
} from "./studio-collection-controls";
import { editorClassName, editorStyles } from "./studio-editor.styles";
import { libraryStyles } from "./studio-library.styles";
import { groupingStyles } from "./studio-groupings.styles";
import { headStyles } from "./studio-page-head.styles";
import { entityTitle, formatUpdated, singularLabel } from "./ui-utils";
import { studioGroupingPath } from "../../src/studio-paths";
import { groupingSearch } from "./grouping-url-query";

/** Studio calls these groups and entries; "collection" belongs to entity types. */
function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** A correction the reader did not ask for must not become a Back step. */
export interface GroupingChangeOptions {
  replace?: boolean;
}

interface GroupingViewProps {
  grouping: StudioGrouping;
  /** Studio's base path, so each group row can carry a real href. */
  basePath: string;
  types: EntityTypeInfo[];
  query: StudioGroupingQuery;
  onChange: (
    query: StudioGroupingQuery,
    options?: GroupingChangeOptions,
  ) => void;
  onOpen: (entityType: string, id: string) => void;
}
export function StudioGroupingView(props: GroupingViewProps): ReactElement {
  const api = useStudioApi();
  const options = useMemo(
    () => groupingQueryOptions(api, props.grouping.key, props.query),
    [api, props.grouping.key, props.query],
  );
  const result = useQuery(options);
  useEffect(() => {
    if (!result.isSuccess || result.isFetching) return;
    const last =
      Math.floor(Math.max(0, result.data.total - 1) / props.query.limit) *
      props.query.limit;
    if (props.query.offset > last)
      // Clamping an out-of-range page is a repair of the current URL, so Back
      // still leaves the collection instead of returning to the empty page.
      props.onChange({ ...props.query, offset: last }, { replace: true });
  }, [
    result.isSuccess,
    result.isFetching,
    result.data,
    props.query,
    props.onChange,
  ]);
  return (
    <StudioGroupingContent
      {...props}
      page={result.data ?? null}
      loading={result.isPending}
      initializing={
        !result.isError && isGroupingsInitializing(result.failureReason)
      }
      error={result.isError ? result.error.message : null}
      onRetry={() => {
        void result.refetch();
      }}
    />
  );
}

export function StudioGroupingContent(
  props: GroupingViewProps & {
    page: GroupingPage | null;
    loading: boolean;
    initializing: boolean;
    error: string | null;
    onRetry: () => void;
  },
): ReactElement {
  const { query } = props;
  const blocked = props.loading || props.initializing || props.error !== null;
  const page = blocked ? null : props.page;
  const grouping = page?.grouping ?? props.grouping;
  const catalog = query.value === null;
  const title =
    query.value === null ? grouping.label : groupingValueLabel(query.value);
  const total = page?.total ?? 0;
  const [search, setSearch] = useState(query.q);
  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);
  useEffect(() => {
    if (search === query.q) return;
    // Typing is continuous; each keystroke must not become its own Back step.
    const timer = setTimeout(
      () =>
        props.onChange({ ...query, q: search, offset: 0 }, { replace: true }),
      250,
    );
    return (): void => clearTimeout(timer);
  }, [search, query, props.onChange]);
  const change = (patch: Partial<StudioGroupingQuery>): void =>
    props.onChange(
      studioGroupingQuerySchema.parse({ ...query, ...patch, offset: 0 }),
    );
  const rows = page?.kind === "catalog" ? page.values : (page?.entities ?? []);
  const filtered = Boolean(
    query.type || query.q || query.sort !== "updated-desc",
  );
  const membershipWarning =
    query.value !== null &&
    grouping.vocabulary &&
    !grouping.vocabulary.values.includes(query.value)
      ? " · not in list"
      : "";
  const groupHref = (value: string): string =>
    `${studioGroupingPath(props.basePath, grouping.key)}${groupingSearch(
      studioGroupingQuerySchema.parse({ value }),
    )}`;
  return (
    <main
      className={editorClassName(
        "studio-grouping",
        libraryStyles.listing,
        headStyles.inset,
      )}
      aria-label={grouping.label}
    >
      <StudioPageHead
        model={{
          kicker: "Content library",
          access: studioAccessRequirement("trusted"),
          title,
          metadata: page
            ? [
                `${total} ${countLabel(
                  total,
                  catalog ? "group" : "entry",
                  catalog ? "groups" : "entries",
                )}${membershipWarning}`,
              ]
            : [],
          totals: [],
        }}
        {...(!catalog && {
          navigation: (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                props.onChange(studioGroupingQuerySchema.parse({}))
              }
            >
              ← {grouping.label}
            </Button>
          ),
        })}
      />
      {catalog ? (
        <p className={editorClassName("", groupingStyles.hint)}>
          Content grouped by its {grouping.label} property.{" "}
          {grouping.vocabulary?.multiple === false
            ? "New saves may carry at most one value; existing memberships are preserved."
            : "An entry can belong to more than one group."}
        </p>
      ) : (
        <StudioCollectionBar
          label="Group controls"
          searchLabel="Search title or content"
          search={search}
          onSearch={setSearch}
          filterLabel="Filter and sort"
          filterCount={
            Number(Boolean(query.type)) + Number(query.sort !== "updated-desc")
          }
          filtered={filtered}
          onClear={() => {
            setSearch("");
            change({ type: "", q: "", sort: "updated-desc" });
          }}
        >
          <label>
            Type
            <NativeSelect
              value={query.type}
              onChange={(event) => change({ type: event.target.value })}
            >
              <option value="">All types</option>
              {grouping.types.map((type) => (
                <option key={type} value={type}>
                  {props.types.find((entry) => entry.entityType === type)
                    ?.label ?? formatLabel(type)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Sort
            <NativeSelect
              value={query.sort}
              onChange={(event) =>
                props.onChange(
                  studioGroupingQuerySchema.parse({
                    ...query,
                    sort: event.target.value,
                    offset: 0,
                  }),
                )
              }
            >
              <option value="updated-desc">Recently updated</option>
              <option value="updated-asc">Least recently updated</option>
              <option value="created-desc">Newest created</option>
              <option value="created-asc">Oldest created</option>
            </NativeSelect>
          </label>
        </StudioCollectionBar>
      )}
      {props.error ? (
        <StudioStatus tone="error">
          {props.error}
          <Button type="button" variant="ghost" onClick={props.onRetry}>
            Retry
          </Button>
        </StudioStatus>
      ) : props.initializing ? (
        <StudioStatus>
          <strong>Preparing groups</strong>
          <br />
          <span>
            Checking existing content. This view will update automatically when
            the complete group is ready.
          </span>
        </StudioStatus>
      ) : props.loading ? (
        <StudioStatus>Loading group…</StudioStatus>
      ) : (
        <>
          {total > 0 && (
            <StudioCollectionPager
              label={`${grouping.label} pagination`}
              offset={query.offset}
              count={rows.length}
              total={total}
              loading={false}
              hasNext={query.offset + query.limit < total}
              onPrevious={() =>
                props.onChange({
                  ...query,
                  offset: Math.max(0, query.offset - query.limit),
                })
              }
              onNext={() =>
                props.onChange({ ...query, offset: query.offset + query.limit })
              }
            />
          )}
          {page?.kind === "catalog" &&
            page.values.map((entry, index) => (
              // A group is a place, so it opens in a new tab like any link.
              <a
                key={entry.value}
                href={groupHref(entry.value)}
                data-studio-grouping-value=""
                className={editorClassName(
                  "",
                  libraryStyles.row,
                  editorStyles.listingRow,
                  groupingStyles.valueLink,
                )}
                onClick={(event) => {
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  props.onChange(
                    studioGroupingQuerySchema.parse({ value: entry.value }),
                  );
                }}
              >
                <span className={editorClassName("", libraryStyles.index)}>
                  {String(query.offset + index + 1).padStart(2, "0")}
                </span>
                <span className={editorClassName("", libraryStyles.title)}>
                  <GroupingValue
                    value={entry.value}
                    vocabulary={grouping.vocabulary}
                  />
                </span>
                <span className={editorClassName("", libraryStyles.updated)}>
                  {entry.count} {countLabel(entry.count, "entry", "entries")} →
                </span>
              </a>
            ))}
          {page?.kind === "members" &&
            page.entities.map((entity, index) => (
              <button
                type="button"
                key={JSON.stringify([entity.entityType, entity.id])}
                data-studio-record=""
                className={editorClassName(
                  "",
                  libraryStyles.row,
                  editorStyles.listingRow,
                )}
                onClick={() => props.onOpen(entity.entityType, entity.id)}
              >
                <span className={editorClassName("", libraryStyles.index)}>
                  {String(query.offset + index + 1).padStart(2, "0")}
                </span>
                <span
                  className={editorClassName("", libraryStyles.title)}
                  title={entity.id}
                >
                  {entityTitle(entity, entity.path?.at(-1))}
                  <span className={editorClassName("", groupingStyles.badge)}>
                    {singularLabel(
                      props.types.find(
                        (type) => type.entityType === entity.entityType,
                      )?.label ?? formatLabel(entity.entityType),
                    )}
                  </span>
                </span>
                <time
                  className={editorClassName("", libraryStyles.updated)}
                  dateTime={entity.updated}
                >
                  {formatUpdated(entity.updated)}
                </time>
              </button>
            ))}
          {page && total === 0 && (
            <StudioStatus className={editorClassName("", libraryStyles.empty)}>
              {catalog ? (
                <>
                  <strong>No {grouping.label.toLowerCase()} here yet</strong>
                  <br />
                  <span>
                    Add {grouping.label} through an entry’s Properties or
                    frontmatter. Values appear here when you can read their
                    entries.
                  </span>
                </>
              ) : filtered ? (
                "No entries in this group match the current filters."
              ) : (
                "No entries in this group are available to you."
              )}
            </StudioStatus>
          )}
        </>
      )}
    </main>
  );
}
