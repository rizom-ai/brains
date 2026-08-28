# SQLite Durable Asset Benchmark — yeehaa.io-local

Generated: 2026-08-28T07:10:42.848Z

## Scope

Read-only source: a stopped local yeehaa.io-local database and image corpus. The
benchmark copied the database before opening SQLite and mutated only temporary copies.
Absolute timings are machine-specific; storage, integrity, transaction, and memory results
are the decision evidence.

Runtime: Bun 1.4.0, linux/x64.

## Reproduce

    bun scripts/benchmark-sqlite-assets.ts \
      --source-db <stopped-instance>/data/brain.db \
      --corpus-dir <stopped-instance>/brain-data/image \
      --output-dir <temporary-output> \
      --result-json <evidence.json> \
      --result-markdown <evidence.md> \
      --source-label <non-sensitive-label> \
      --probe-sizes-mb 5,25,50,100

The command refuses a non-empty source WAL, copies the database before opening SQLite,
and removes temporary database/backup artifacts unless `--keep-artifacts` is supplied.

## Source corpus

- Database snapshot: 1.33 GiB
- Image entities: 156
- Image FTS rows: 156
- Encoded entity content: 410.29 MiB
- Decoded entity bytes: 307.72 MiB
- Unique database payloads: 154
- Synced image files: 160 (305.70 MiB)
- Unique synced payloads: 158
- Database payloads absent from synced corpus: 4
- Synced payloads absent from database: 8
- Largest decoded database image: 3.50 MiB

The committed evidence records only aggregate sizes and SHA-256 inventory comparisons,
never image bytes, data URLs, filenames, or the local source path.

## Full-database variants

Each variant starts from the same database snapshot, uses WAL with `synchronous=FULL`,
checkpoints, vacuums, creates a SQLite-safe `VACUUM INTO` backup, reopens it read-only,
runs `PRAGMA quick_check`, and verifies binary digests.

| Variant             | Compact DB | Change vs current |     Backup | Migration WAL | Entity list payload |   Peak RSS | Mutation | Backup + verify |
| ------------------- | ---------: | ----------------: | ---------: | ------------: | ------------------: | ---------: | -------: | --------------: |
| current-base64-fts  |   1.31 GiB |              0.0% |   1.31 GiB |           0 B |          410.29 MiB | 755.65 MiB |  0.00 ms |          5.43 s |
| base64-no-image-fts | 426.23 MiB |            -68.3% | 426.23 MiB |    539.89 MiB |          410.29 MiB | 765.40 MiB |  13.54 s |          1.23 s |
| sqlite-blob         | 323.14 MiB |            -76.0% | 323.14 MiB |      2.03 GiB |           12.04 KiB | 201.38 MiB |  31.07 s |          1.03 s |

### Integrity

| Variant             | quick_check | Digests | Missing refs | Asset rows | Deduplicated references | Atomic rollback |
| ------------------- | ----------- | ------- | -----------: | ---------: | ----------------------: | --------------- |
| current-base64-fts  | ok          | pass    |            0 |          0 |                       0 | n/a             |
| base64-no-image-fts | ok          | pass    |            0 |          0 |                       0 | n/a             |
| sqlite-blob         | ok          | pass    |            0 |        154 |                       2 | pass            |

Removing image FTS changes the compact database by -68.3%. Replacing base64 entity content with same-database BLOB assets changes it by -76.0% while reducing the ordinary image-list content payload from 410.29 MiB to 12.04 KiB.

FTS5 deletion appends tombstone segments. The benchmark therefore runs the FTS5
`optimize` command before `VACUUM`; without it, deleting image rows retained the old
term segments and temporarily enlarged the index.

The benchmark disables automatic WAL checkpoints to expose worst-case migration disk
pressure. The SQLite BLOB migration reached
2.03 GiB of WAL, so production tooling must checkpoint
between bounded groups of already-committed entity migrations rather than allowing the
whole corpus to accumulate in WAL.

## BLOB size probes

Each probe binds deterministic bytes, inserts the asset and entity reference in one
transaction, checkpoints, rereads and hashes the BLOB, and separately proves rollback
removes both rows.

|       BLOB |    Insert | Checkpoint |    Verify |        WAL |         DB |   Peak RSS | Result |
| ---------: | --------: | ---------: | --------: | ---------: | ---------: | ---------: | ------ |
|   5.00 MiB |  15.43 ms |   11.70 ms |   5.04 ms |   5.05 MiB |   5.02 MiB | 129.89 MiB | pass   |
|  25.00 MiB |  69.26 ms |   48.28 ms |  36.99 ms |  25.19 MiB |  25.04 MiB | 129.89 MiB | pass   |
|  50.00 MiB | 165.44 ms |   93.59 ms |  72.79 ms |  50.36 MiB |  50.07 MiB | 187.57 MiB | pass   |
| 100.00 MiB | 291.81 ms |  190.27 ms | 148.42 ms | 100.70 MiB | 100.12 MiB | 338.04 MiB | pass   |

## Decision gate

- Full database variants pass integrity and backup verification: **yes**
- Asset/entity rollback is atomic: **yes**
- All configured BLOB size probes pass: **yes**
- Largest tested BLOB: **100.00 MiB**
- Database and synced-corpus digest inventories match: **NO**

The benchmark supports proceeding to the same-database SQLite asset foundation. It does not authorize a yeehaa.io migration: preflight must first reconcile 4 database payloads absent from the synced corpus and 8 synced payloads absent from the database. The implementation must retain the measured byte limit, transaction boundary, FTS optimization, bounded WAL checkpoints, and verified single-database backup/restore checks.
