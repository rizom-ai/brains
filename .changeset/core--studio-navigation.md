---
"@brains/plugins": minor
"@brains/studio": minor
"@brains/admin": patch
"@brains/unified-inbox": patch
"@brains/action-board": patch
"@brains/content-pipeline": patch
"@brains/site-builder-plugin": patch
"@brains/analytics": patch
"@brains/linkedin-import": patch
"@brains/directory-sync": patch
"@rizom/brain": minor
---

Studio's navigation is one sidebar with five sections: Home, Library, Publish, Chat and Brain.

- A Studio workspace names its section with `section` (`home`, `library`, `publish`, `chat` or `brain`). It is Brain when none is named, and an unknown section is refused, so plugins place their pages without adding sections:
  - Inbox and Board are in Home.
  - Publishing, Site and Traffic are in Publish.
  - LinkedIn import is in Library.
  - Content sync and Administration are in Brain.
- The section you are in lists its destinations under its heading. Library, Publish and Brain open in place to browse without leaving the page; Home and Chat open their pages. The ordinals and the second column are gone, and Administration is no longer a special case.
- Library lists the types that hold something, the ones opened most recently first. Empty types are under All types.
