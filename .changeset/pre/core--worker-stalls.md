---
"@rizom/brain": patch
---

A brain no longer stalls its worker for seconds at a time under heavy content changes, which on a small server let the supervisor take the worker for hung and stop the brain. The local database client gives the event loop a turn whenever a run of statements has kept it for 50 ms, so timers and the worker's heartbeat keep running; deleting an entity removes its keyword-search row by rowid instead of reading the whole search index; a job deduplicated by key reads only that key's active jobs, through a new index; the embedding backfill runs once the brain is serving instead of holding up its start; and removing entities whose files are gone checks every entity of a type, not only the first 1,000.
