---
"@rizom/brain": patch
---

A site that declares more than one language is built in each of them. Every route is built in the default language at its own path, and again under each other language's path (`/zh-tw/about`) from copy saved for that language as `site-content/<tag>/<route>/<section>.md`. A page is built in a language only once every section on it has copy in that language, never from the default language's copy; routes fed by a datasource stay in the default language. Each page's `<html lang>` is its language.
