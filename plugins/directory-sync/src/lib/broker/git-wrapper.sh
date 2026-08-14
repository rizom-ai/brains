#!/usr/bin/env bash
#
# OS-owned command wrapper for the directory-sync Git execution broker.
#
# This script, not the broker's JavaScript, owns command safety. It holds the
# advisory checkout lock, runs Git in its own session, enforces the inactivity
# deadline, and proves the process group is gone before it releases the lock.
# Nothing here depends on the broker staying alive: if the broker dies, this
# wrapper still reaches a terminal result under the lock it already holds.
#
# It writes key=value records rather than JSON on purpose. Escaping arbitrary
# Git output into JSON from shell is a bug farm; the captured bytes stay in
# their own files and the TypeScript side owns the JSON and Zod contracts.
#
# Required environment:
#   GIT_BROKER_REQUEST_ID      opaque request id, used in artifact names
#   GIT_BROKER_JOURNAL_DIR     directory for records and captured output
#   GIT_BROKER_LOCK_FILE       advisory lock file, outside the checkout
#   GIT_BROKER_CHECKOUT        working directory for the Git command
# Optional:
#   GIT_BROKER_TIMEOUT_MS      inactivity deadline (default 120000)
#   GIT_BROKER_MAX_OUTPUT_BYTES  combined capture bound (default 1048576)
#   GIT_BROKER_POLL_MS         progress poll interval (default 50)
#   GIT_BROKER_TERM_GRACE_MS   SIGTERM grace before SIGKILL (default 2000)
#
# Usage: git-wrapper.sh <git-subcommand> [args...]

set -uo pipefail

: "${GIT_BROKER_REQUEST_ID:?GIT_BROKER_REQUEST_ID is required}"
: "${GIT_BROKER_JOURNAL_DIR:?GIT_BROKER_JOURNAL_DIR is required}"
: "${GIT_BROKER_LOCK_FILE:?GIT_BROKER_LOCK_FILE is required}"
: "${GIT_BROKER_CHECKOUT:?GIT_BROKER_CHECKOUT is required}"

timeout_ms="${GIT_BROKER_TIMEOUT_MS:-120000}"
max_output_bytes="${GIT_BROKER_MAX_OUTPUT_BYTES:-1048576}"
poll_ms="${GIT_BROKER_POLL_MS:-50}"
term_grace_ms="${GIT_BROKER_TERM_GRACE_MS:-2000}"

umask 077

base="${GIT_BROKER_JOURNAL_DIR}/wrapper-${GIT_BROKER_REQUEST_ID}"
stdout_file="${base}.stdout"
stderr_file="${base}.stderr"
active_file="${base}.active"
terminal_file="${base}.terminal"
pgid_file="${base}.pgid"

now_ms() { date +%s%3N; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%S.%3NZ; }
file_size() { stat -c %s "$1" 2>/dev/null || printf '0'; }

# Atomic record write: a crash leaves the previous record or the next one,
# never a half-written one a replacement broker might trust.
write_record() {
  local target="$1"
  shift
  local tmp="${target}.tmp.$$"
  printf '%s\n' "$@" >"$tmp" || return 1
  chmod 600 "$tmp" 2>/dev/null
  mv -f "$tmp" "$target"
}

write_active() {
  write_record "$active_file" \
    "request_id=${GIT_BROKER_REQUEST_ID}" \
    "wrapper_pid=$$" \
    "git_pgid=${git_pgid:-0}" \
    "phase=$1" \
    "started_at=${started_at}" \
    "observed_at=$(now_iso)" \
    "stdout_bytes=$2" \
    "stderr_bytes=$3"
}

# Step 1: acquire the advisory lock. The descriptor is held for the lifetime
# of this process, so the lock is released only when the wrapper exits — after
# the process group has been proven gone.
exec 9>"$GIT_BROKER_LOCK_FILE" || {
  echo "wrapper: cannot open lock file" >&2
  exit 64
}
chmod 600 "$GIT_BROKER_LOCK_FILE" 2>/dev/null
flock 9 || {
  echo "wrapper: cannot acquire lock" >&2
  exit 65
}

started_at="$(now_iso)"
git_pgid=0

# Step 2: the active record exists before Git starts, so a crash in between is
# still visible to a replacement broker as an owned request.
write_active "starting" 0 0

: >"$stdout_file"
: >"$stderr_file"
: >"$pgid_file"
chmod 600 "$stdout_file" "$stderr_file" "$pgid_file" 2>/dev/null

# Step 3: run Git in a dedicated session so every descendant shares one
# process group we can signal and prove empty. The inner shell records its own
# pid — which setsid has made the group leader — then execs Git in place, so
# that pid is both the Git pid and the process group id.
PGID_FILE="$pgid_file" setsid --wait bash -c '
  printf "%s" "$$" >"$PGID_FILE"
  cd "$GIT_BROKER_CHECKOUT" || exit 66
  exec "$@"
' bash git -c maintenance.auto=false "$@" >"$stdout_file" 2>"$stderr_file" &
runner_pid=$!

# The group id is written before Git execs; wait briefly for it to appear so a
# timeout always has a group to signal.
pgid_deadline=$(($(now_ms) + 2000))
while [ "$(file_size "$pgid_file")" -eq 0 ] && [ "$(now_ms)" -lt "$pgid_deadline" ]; do
  if ! kill -0 "$runner_pid" 2>/dev/null; then break; fi
  sleep 0.01
done
git_pgid="$(cat "$pgid_file" 2>/dev/null || printf '0')"
[ -z "$git_pgid" ] && git_pgid=0

group_alive() {
  [ "$git_pgid" -gt 0 ] && kill -0 -"$git_pgid" 2>/dev/null
}

signal_group() {
  [ "$git_pgid" -gt 0 ] && kill "-$1" -"$git_pgid" 2>/dev/null
  return 0
}

# Step 4: watch byte progress from outside any application event loop. Output
# resets the inactivity deadline, so a slow but progressing transfer is not
# killed, while a silent one is.
poll_seconds="$(awk -v ms="$poll_ms" 'BEGIN { printf "%.3f", ms / 1000 }')"
deadline_ms=$(($(now_ms) + timeout_ms))
last_stdout=0
last_stderr=0
outcome="exit"

write_active "running" 0 0

while kill -0 "$runner_pid" 2>/dev/null; do
  stdout_bytes="$(file_size "$stdout_file")"
  stderr_bytes="$(file_size "$stderr_file")"

  if [ "$stdout_bytes" -ne "$last_stdout" ] || [ "$stderr_bytes" -ne "$last_stderr" ]; then
    last_stdout="$stdout_bytes"
    last_stderr="$stderr_bytes"
    deadline_ms=$(($(now_ms) + timeout_ms))
    write_active "running" "$stdout_bytes" "$stderr_bytes"
  fi

  if [ $((stdout_bytes + stderr_bytes)) -gt "$max_output_bytes" ]; then
    outcome="overflow"
    break
  fi

  if [ "$(now_ms)" -ge "$deadline_ms" ]; then
    outcome="timeout"
    break
  fi

  sleep "$poll_seconds"
done

# Step 5: on any abnormal outcome, terminate the whole group and prove it is
# gone. The lock is still held throughout, so nothing else can touch the
# checkout while a killed Git might still be writing to it.
if [ "$outcome" != "exit" ]; then
  write_active "terminating" "$last_stdout" "$last_stderr"
  signal_group TERM

  grace_deadline=$(($(now_ms) + term_grace_ms))
  while group_alive && [ "$(now_ms)" -lt "$grace_deadline" ]; do
    sleep 0.01
  done

  if group_alive; then
    signal_group KILL
  fi

  # No deadline here on purpose: releasing the lock while a process that can
  # still mutate the checkout exists is the one thing this wrapper must never
  # do. SIGKILL is not refusable, so this terminates.
  while group_alive; do
    sleep 0.01
  done
fi

wait "$runner_pid"
git_status=$?

# A normal exit can still leave a descendant holding the output pipes — Git's
# background maintenance does exactly this. Reap the group before reporting.
if group_alive; then
  signal_group KILL
  while group_alive; do
    sleep 0.01
  done
fi

stdout_bytes="$(file_size "$stdout_file")"
stderr_bytes="$(file_size "$stderr_file")"
truncated=false

# Step 6: bound the captured output, then write the terminal result.
#
# Shrink only. `truncate -s N` on a smaller file *grows* it, padding with NUL
# bytes — which would turn an empty stderr into megabytes of NULs and inflate
# the encoded result far past the bound it was meant to enforce.
shrink_to() {
  local size
  size="$(file_size "$1")"
  if [ "$size" -gt "$2" ]; then
    truncate -s "$2" "$1" 2>/dev/null && truncated=true
  fi
}

if [ "$outcome" = "overflow" ] || [ $((stdout_bytes + stderr_bytes)) -gt "$max_output_bytes" ]; then
  shrink_to "$stdout_file" "$max_output_bytes"
  shrink_to "$stderr_file" "$max_output_bytes"
  stdout_bytes="$(file_size "$stdout_file")"
  stderr_bytes="$(file_size "$stderr_file")"
fi

exit_code="$git_status"
signal_name=""
if [ "$outcome" = "exit" ] && [ "$git_status" -gt 128 ]; then
  outcome="signal"
  signal_name="$(kill -l $((git_status - 128)) 2>/dev/null || printf '')"
elif [ "$outcome" != "exit" ]; then
  exit_code=""
  signal_name="SIGKILL"
fi

write_record "$terminal_file" \
  "request_id=${GIT_BROKER_REQUEST_ID}" \
  "outcome=${outcome}" \
  "exit_code=${exit_code}" \
  "signal=${signal_name}" \
  "truncated=${truncated}" \
  "stdout_bytes=${stdout_bytes}" \
  "stderr_bytes=${stderr_bytes}" \
  "started_at=${started_at}" \
  "completed_at=$(now_iso)"

rm -f "$active_file" "$pgid_file"

# Step 7: the lock is released here, by exiting — after the group was proven
# empty and the terminal record is durable.
exit 0
