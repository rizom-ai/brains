---
"@brains/entity-service": minor
"@brains/plugins": minor
"@brains/contracts": minor
"@brains/studio": minor
"@brains/blog": minor
"@brains/series": minor
"@rizom/brain": minor
---

A post joins a series through the Series group.

- A post holds `series`, a list of one series name, in place of `seriesName` and `seriesIndex`. Content with the old fields must be converted: `seriesName: X` becomes `series: [X]`, and `seriesIndex` is removed. The old fields are no longer read.
- A post's place in its series is worked out, not stored: published posts in order of publication, then drafts in the order they were made. The series page, "Part X of N", the blog lists and the Bluesky record all use this order.
- A collection type can bring its own group with `memberGroup`. The series type brings Series, offered over the types that declare `series` as a list of names, so Studio lists each series with its member count, and choosing a post's series is the same as choosing any group.
- A type's `list` view can read other entries, so a listed post knows its place in its series.
