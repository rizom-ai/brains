import type { DataSource } from "@brains/plugins";

/** A data source with its optional fetch narrowed to present. */
export type FetchableDataSource = DataSource & {
  fetch: NonNullable<DataSource["fetch"]>;
};

/**
 * A data source a test can actually call.
 *
 * `fetch` is optional on the interface because a source may only render, so
 * every test that fetches otherwise repeats the same non-null assertion.
 */
export function fetchable(source: DataSource): FetchableDataSource {
  if (!source.fetch) {
    throw new Error(`Data source "${source.id}" does not implement fetch`);
  }
  return { ...source, fetch: source.fetch.bind(source) };
}
