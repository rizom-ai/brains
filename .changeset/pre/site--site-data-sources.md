---
"@rizom/site": patch
---

A site lists the data its sections are drawn from in `dataSources`: fetching sources declared with `defineDataSource` from `@rizom/brain/entities`. A section names one with `dataSource` in its metadata, and what the source answers is the section's content. `defineSite` refuses two sources with one id, a section naming a source the site does not declare, and anything but a fetching source.
