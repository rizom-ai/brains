---
"@brains/db": patch
"@brains/job-queue": patch
"@brains/conversation-service": patch
"@brains/runtime-state": patch
"@brains/entity-service": patch
"@brains/auth-service": patch
---

Declare the drizzle column-annotation aliases once, in `@brains/db`.

`isolatedDeclarations` makes exported tables carry explicit column types, and
five packages had each hand-written the same sixteen-key `SQLiteColumn` config
literal per column kind — ~420 lines of identical type machinery across seven
schema files, drifting on which axes they exposed. The literals now live once in
`@brains/db` (`SqliteTextColumn`, `SqliteIntegerColumn`, `SqliteJsonColumn`,
`SqliteBooleanColumn`, `SqliteTable`) with every axis the schemas vary on as a
parameter; schema files keep one-line local aliases that bind their table name.
