# Turso offline backup and restore (0.3)

The 0.3 backup path deliberately accepts downtime. It does **not** open live
Turso files through another SQLite engine. This replaces authentication replica
recovery with a verified point-in-time snapshot, not continuous replication or
automatic failover. The recovery point is the last successful snapshot.

Implementation tests and an isolated local Docker protocol rehearsal pass. The
Docker fixture uses the real migration chain and auth stores: restored sessions,
signing keys/signatures, encrypted settings, passkey counters, asset-backed PNG
bytes/references/metadata, and a controlled job transition survive recovery and
restart. It is not a canonical brain boot,
browser passkey login, or real plugin job replay. Rover and real-instance checks
still gate release. The remote command requires a
**0.3 source version**. It must not run against 0.2: use the retained 0.2 tooling
for those backups and the separate importer for database migration.

## Capture

The generated `deploy/scripts/create-predeploy-backup.ts` command uses the
existing `SERVER_IP`, `TARGET_HANDLE`, `TARGET_VERSION`, `SERVICE_NAME`, and
optional `SSH_USER` settings. It supports the canonical deployment mounts;
noncanonical mounts require a dedicated backup configuration rather than guesses.

1. Acquire host backup and watchdog locks. Refuse unfinished prior maintenance,
   ambiguous owners, unknown service roles, unhealthy readiness, busy queues,
   missing databases, or insufficient staging/rehearsal space.
2. Save private deployment evidence, including the owner's complete environment
   and any worker container environments. Environment values never go to logs.
3. Request graceful shutdown of workers, then the web owner. The canonical web
   container's supervisor also owns its worker and Git broker processes. Wait for
   process termination, without a backup-imposed kill deadline. Refuse unclean
   exits; the copied queue must also contain no processing jobs.
4. Run the capture bundle in the **original image**, with networking disabled,
   source volumes read-only, and only the new snapshot staging directory writable.
5. Copy all five database files and any committed Turso WALs. Open only copies
   with native Turso, check integrity/foreign keys, checkpoint, and close. Verify
   that fresh restored copies reopen with identical database hashes. Consolidated
   embeddings and image asset BLOBs are included in `brain.db`; `embeddings.db`
   is not required.
6. Capture Git refs/history, staged and unstaged binary patches, untracked and
   ignored files, executable bits, and symlinks. Capture `brain.yaml`, `/config`,
   and the exact JSON environment, including the account-settings encryption key.
7. Reconstruct databases, checkout, configuration, and environment in an isolated
   directory and compare them with the snapshot evidence. Recheck source stability.
   Only successful restoration produces a verified manifest.
8. Restart original containers, observe Docker health events, and check readiness.
   Publish the snapshot atomically, then prune only checksum-verified Turso
   snapshots above the retention count (default five). Retained 0.2 rollback
   backups and incomplete captures are not pruned.

All backups contain credentials and private content. Keep snapshot directories
`0700` and files `0600`. Arrange encrypted off-host storage and a retention policy;
this command does not upload backups. Keep the exact source image available by
immutable digest or an independently verified image archive. Image IDs and available registry digests
are recorded; image layers are not part of the snapshot.

Stopping processes fences ingress; a request racing shutdown may fail and must
be retried by its caller. This is not a zero-downtime application maintenance
protocol. Do not run another deployment or manually start writers during capture.
The host locks coordinate backups and the watchdog, not arbitrary operators.

## Restore into a new directory

Restore **trusted** snapshots only. Checksums detect corruption, not malicious
replacement of both a snapshot and its checksum manifest. Never restore over a
live directory or start the application against `.incomplete` output.

Build the self-contained restore program from the matching generated deploy
scripts. Shared Zod validation is supplied by the public deploy helper; no extra
Zod dependency is installed in the copied scripts.

```sh
bun build --target=bun --external @tursodatabase/database \
  deploy/scripts/create-predeploy-backup.ts --outfile /tmp/turso-restore.js
```

Use the original image recorded in `manifest.json`, not a newer engine selected
by convenience. Set `SNAPSHOT`, `RESTORE_PARENT`, and `SOURCE_IMAGE_ID` to verified
local paths/the retained image. The destination `new-state` must not exist.

```sh
install -d -m 700 "$RESTORE_PARENT"
docker run --rm -i --network none --user 0:0 \
  --no-healthcheck --label ai.rizom.brain.watchdog=false \
  --volume "$SNAPSHOT:/backup:ro" \
  --volume "$RESTORE_PARENT:/restore:rw" \
  -e BACKUP_DIR=/backup -e RESTORE_DIR=/restore/new-state \
  --entrypoint bun "$SOURCE_IMAGE_ID" run - --restore < /tmp/turso-restore.js
```

The verified result contains:

- `data/brain.db`, `data/brain-jobs.db`, `data/conversations.db`,
  `data/runtime-state.db`, and `data/auth/auth.db`;
- `content/`, including saved branches/stashes and the exact dirty worktree;
- `config/`, `brain.yaml`, and private `runtime-environment.json`;
- `deployment/` evidence and `restore-manifest.json` provenance.

The restored checkout has **no configured remote**. Saved tracking refs remain,
so operators can reattach the approved content remote/upstream after verification.
The restore command does not start containers, change mounts, or replay jobs.

Before promoting the restore:

1. Fence traffic and stop all original writers. Preserve the original directories.
2. Use the recorded source binary, configuration and secrets. Map the restored
   database directory to `/data`, `data/auth` to `/app/data/auth`, content to
   `/app/brain-data`, configuration to `/config`, and `brain.yaml` to
   `/app/brain.yaml`. Use a separate fresh `/app/data` runtime directory for other
   runtime files. Review all mounts before starting.
3. Restore environment values through the deployment/secret-management surface.
   JSON preserves multiline values: it is **not** a shell script or Docker
   `--env-file`. Never `source` it, print it in CI, or reconstruct it with unsafe
   shell evaluation. Preserve `ACCOUNT_SETTINGS_ENCRYPTION_KEY` exactly.
4. With external traffic still fenced, verify readiness, account-settings
   decryption, authentication/signing keys and passkey login on the configured RP
   origin, conversations, content, embeddings/search and durable job recovery.
5. Reconnect the approved Git remote/upstream and open traffic only after these
   checks. Monitor jobs and authentication after reopening.

Restoration preserves queued jobs but does not establish that every external
side effect is safe to replay. Processing jobs make capture fail; reconcile them
on the original runtime, then take a new snapshot. Restoring an older snapshot
loses newer database state and may replay previously pending external work. Agree
this recovery policy before accepting writes. Never roll back by opening Turso
files with libSQL.

## Local Docker rehearsal

From `packages/brain-cli`, run `bun run test:backup-docker`. This opt-in harness
uses only the local Docker socket and fresh, privately scoped fixture directories
and containers. It builds a synthetic owner image, runs the actual backup/restore
Docker protocol, checks restored auth and image data and a controlled job transition, and
injects a capture failure to verify restart cleanup. It deletes its own containers,
image tag and data, leaving a private JSON report in `/tmp`. It never contacts a
fleet host or relabels a canonical runtime as 0.3.

The first real run exposed an ArrayBuffer-to-text binding bug in the Turso adapter
and stale health events from the previous container run. Regression coverage now
checks blob argument normalization and filters health events by Docker's exact
start generation, rather than trusting a coarse `--since` boundary.

## Failure and interruption

Normal capture errors and catchable interruption remove the capture container
and attempt to restart/readiness-check the original runtime. They never advertise
success. Incomplete snapshots remain available for diagnosis.

`/opt/brain-state/offline-backup-in-progress` records the owner, workers, snapshot,
and helper name. A hard kill, host crash, or failed restart can leave this marker
and stopped containers. A subsequent backup fails closed. Inspect the marker
without executing it; confirm the named helper is stopped/removed, restart the
original owner and workers, verify readiness, and only then remove the marker.
Do not remove it just because time has elapsed.

Restore cancellation leaves unpublished staging for diagnosis and normally
releases its destination `.restore-lock`. After a hard kill, confirm the restorer
and its children are gone before removing that lock. Retry creates a new staging
directory from the unchanged backup; existing destinations are never overwritten.
