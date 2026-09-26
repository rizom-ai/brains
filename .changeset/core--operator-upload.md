---
"@brains/plugins": minor
---

Add `upload` to `operatorEntities`: a file becomes an entity of whichever type declared it takes that kind of file.

The console never decides what the file becomes. The runtime asks the registry which type's upload handler accepts the media type, asks the entity-action policy whether this caller may create that type, stages the bytes, and hands the staged upload to the type's own handler as the person who sent it — `createRouted`'s shape, for uploads. What came back is reported as it is: created, refused by the handler with its reason, or denied before it was reached.

`createOperatorEntities` now takes the declaring package's id, which is what an upload says it came through.

The mock registry now replaces a type's upload handler on re-registration, as the real one does; it appended and answered the first, so a test that re-registered one would never have seen it.

Named consumer: @brains/studio.
