---
"@brains/atproto": patch
"@brains/atproto-client": patch
"@brains/atproto-contracts": patch
"@brains/plugins": patch
---

A brain's AT Protocol records are kept complete on every start. Once startup content is in place, the brain lists its own records, writes the ones that are missing or no longer match their entity, and deletes the ones whose entity is gone or no longer public and published. Entities published before the projection existed now get their records without being touched.

The PDS client and the read path to another brain's public repo move into `@brains/atproto-client`, so an entity package can read a repo's records without importing the atproto plugin. Reading a peer's repo no longer hands the client this brain's credentials.
