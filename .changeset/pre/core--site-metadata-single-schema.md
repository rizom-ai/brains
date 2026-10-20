---
"@brains/site-builder-plugin": patch
"@brains/site-composition": patch
---

Validate site metadata against one schema on every route.

Site-builder kept its own copy of the site metadata schema for plugin config and
build-job payloads. The copy omitted `represents`, so a site configured as
`represents: "brain"` had the field stripped on that route and fell back to
`"anchor"` at layout time, while the message-bus route preserved it. Both routes
now use `siteMetadataSchema` from `@brains/site-composition`, and
`siteLayoutInfoSchema` derives from it instead of restating its ten fields.
