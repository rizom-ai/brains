# Bug Plan: Post Series Metadata Projection Not Persisting

## Summary

There appears to be a bug in the entity metadata update/projection for posts. A post has `seriesName` and `seriesIndex` present in its markdown frontmatter, but those fields are not reflected in the entity metadata returned by `system_get`. Because series overview pages appear to rely on entity metadata rather than parsing content frontmatter, the post does not appear in its series overview.

## Affected Entity

- Entity type: `post`
- ID: `Heroics Are Not Infrastructure`
- Slug: `heroics-are-not-infrastructure`
- Series: `New Institutions`
- Expected series index: `2`

## Observed Content Frontmatter

The post content/frontmatter contains:

```yaml
seriesName: New Institutions
seriesIndex: 2
```

## Observed Metadata

However, `system_get` returns metadata without those fields:

```json
"metadata": {
  "title": "Heroics Are Not Infrastructure",
  "status": "published",
  "publishedAt": "2026-05-17T07:09:28.701Z",
  "slug": "heroics-are-not-infrastructure"
}
```

## Update Attempt

Metadata was updated multiple times via `system_update`, for example:

```json
{
  "entityType": "post",
  "id": "Heroics Are Not Infrastructure",
  "fields": {
    "title": "Heroics Are Not Infrastructure",
    "slug": "heroics-are-not-infrastructure",
    "status": "published",
    "publishedAt": "2026-05-17T07:09:28.701Z",
    "seriesName": "New Institutions",
    "seriesIndex": 2
  },
  "confirmed": true,
  "contentHash": "915e85e07b794fc0dd761f0f412a90c9c4431ba3b860139c4b5c8945254dc03d"
}
```

The tool returned success:

```json
{ "success": true, "data": { "updated": "Heroics Are Not Infrastructure" } }
```

But reading the entity immediately afterward still showed metadata without `seriesName` / `seriesIndex`.

## Impact

The post does not appear in the **New Institutions** series overview, presumably because the series overview uses entity metadata rather than parsing frontmatter from content.

Other posts in the same series do have metadata correctly set, for example:

- `Urging New Institutions`: `seriesName: New Institutions`, `seriesIndex: 1`
- `Hiding in Plain Sight`: `seriesName: New Institutions`, `seriesIndex: 3`

## Expected Behavior

After update/import, `system_get` for `Heroics Are Not Infrastructure` should return:

```json
"metadata": {
  "title": "Heroics Are Not Infrastructure",
  "status": "published",
  "publishedAt": "2026-05-17T07:09:28.701Z",
  "slug": "heroics-are-not-infrastructure",
  "seriesName": "New Institutions",
  "seriesIndex": 2
}
```

And the post should appear in the **New Institutions** series overview between index 1 and 3.

## Likely Areas to Investigate

- Frontmatter-to-metadata projection/import pipeline
- Allowed metadata field schema for existing post entities
- `system_update` filtering unknown/non-whitelisted fields
- Stale metadata cache/index not invalidated
- Mismatch between entity ID/title/slug causing update to content but not metadata projection
- Series overview query relying on metadata fields that are inconsistently populated

## Suggested Debug Steps

1. Retrieve `Heroics Are Not Infrastructure` via `system_get` and confirm metadata lacks `seriesName` / `seriesIndex`.
2. Compare with `Urging New Institutions` and `Hiding in Plain Sight`, which do expose series fields in metadata.
3. Inspect post entity schema and metadata projection logic for `seriesName` / `seriesIndex`.
4. Verify whether `system_update.fields` persists these keys or silently filters them.
5. Trigger/import frontmatter projection manually and check whether metadata updates.
6. Inspect any search/index/cache layer used by series overview pages.
7. Fix persistence/projection so frontmatter and metadata remain consistent.
