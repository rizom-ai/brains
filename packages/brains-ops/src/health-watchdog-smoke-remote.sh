#!/usr/bin/env bash
set -euo pipefail
umask 077

mode="${1:?run or cleanup mode is required}"
run_id="${2:?smoke run ID is required}"
watchdog_payload_base64="__WATCHDOG_PAYLOAD_BASE64__"
watchdog_label_filter="__WATCHDOG_LABEL_FILTER__"
remote_dir="/tmp/brains-health-watchdog-smoke-$run_id"
image="alpine:3.20"
prefix="brains-watchdog-smoke-$run_id"
smoke_brain="$prefix-brain"
unrelated="$prefix-unrelated"
false_label="$prefix-false"
healthy_brain="$prefix-healthy"
containers=("$smoke_brain" "$unrelated" "$false_label" "$healthy_brain")

pass() {
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

cleanup_fixtures() {
  docker rm -f "${containers[@]}" >/dev/null 2>&1 || true
}

cleanup_on_exit() {
  status=$?
  trap - EXIT
  cleanup_fixtures
  exit "$status"
}

wait_for_health() {
  container="$1"
  expected="$2"
  for _attempt in $(seq 1 40); do
    actual=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)
    if [ "$actual" = "$expected" ]; then
      return 0
    fi
    sleep 1
  done
  fail "container $container did not reach health=$expected"
}

started_at() {
  docker inspect --format '{{.State.StartedAt}}' "$1"
}

if [ "$(id -u)" -ne 0 ]; then
  fail "watchdog smoke requires the fleet deployment's root SSH posture"
fi
command -v docker >/dev/null 2>&1 || fail "missing remote command: docker"

if [ "$mode" = "cleanup" ]; then
  cleanup_fixtures
  rm -rf -- "$remote_dir"
  pass "removed residual watchdog smoke fixtures for $run_id"
  exit 0
fi
[ "$mode" = "run" ] || fail "unknown watchdog smoke mode: $mode"
trap cleanup_on_exit EXIT

mkdir -p "$remote_dir/incidents" "$remote_dir/state"
for command in awk base64 cmp find flock grep logger systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "missing remote command: $command"
done
expected_watchdog="$remote_dir/expected-watchdog.sh"
printf '%s' "$watchdog_payload_base64" | base64 --decode >"$expected_watchdog"
chmod 0700 "$expected_watchdog"
bash -n "$expected_watchdog"
pass "rendered packaged watchdog payload is valid Bash"

systemctl is-enabled --quiet brains-health-watchdog.timer || fail "watchdog timer is not enabled"
systemctl is-active --quiet brains-health-watchdog.timer || fail "watchdog timer is not active"
installed_watchdog="/usr/local/sbin/brains-health-watchdog"
[ -x "$installed_watchdog" ] || fail "fleet deployment did not install $installed_watchdog"
grep -Fq -- "--filter label=$watchdog_label_filter" "$installed_watchdog" || fail "installed watchdog lacks the exact Brain selector"
if grep -Fq -- "--filter label=service " "$installed_watchdog"; then
  fail "installed watchdog still contains the generic service selector"
fi
cmp -s "$expected_watchdog" "$installed_watchdog" || fail "installed watchdog differs from the packaged canonical payload; deploy the smoke target first"
pass "installed fleet watchdog matches the packaged payload and uses only the exact Brain selector"

exec 8>/run/brains-health-watchdog.lock
flock -n 8 || fail "installed watchdog is currently running; retry later"
pass "installed timer is isolated behind its global watchdog lock"

mapfile -t deployed_containers < <(
  docker ps \
    --filter label=service=rover \
    --filter label=role=web \
    --format '{{.Names}}'
)
[ "${#deployed_containers[@]}" -eq 1 ] || fail "expected one running rover web container, found ${#deployed_containers[@]}"
deployed_container="${deployed_containers[0]}"
actual_label=$(docker inspect --format '{{ index .Config.Labels "ai.rizom.brain.watchdog" }}' "$deployed_container")
[ "$actual_label" = "true" ] || fail "deployed rover container lacks ai.rizom.brain.watchdog=true"
actual_health=$(docker inspect --format '{{.State.Health.Status}}' "$deployed_container" 2>/dev/null || true)
[ "$actual_health" = "healthy" ] || fail "deployed rover container is not Docker-healthy"
healthcheck=$(docker inspect --format '{{json .Config.Healthcheck.Test}}' "$deployed_container")
printf '%s' "$healthcheck" | grep -Fq '/health/live' || fail "Docker healthcheck does not use /health/live"
if printf '%s' "$healthcheck" | grep -Fq '/health/operate'; then
  fail "Docker healthcheck unexpectedly uses /health/operate"
fi
deployed_started_before=$(started_at "$deployed_container")
pass "deployed fleet image inherited the ownership label and liveness healthcheck"

live_status=$(docker exec "$deployed_container" curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/health/live || true)
[ "$live_status" = "200" ] || fail "deployed /health/live returned $live_status"
operate_status=$(docker exec "$deployed_container" curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8080/health/operate || true)
case "$operate_status" in
  200) pass "/health/operate is currently healthy; Docker remains tied to /health/live" ;;
  503) pass "/health/operate is degraded while Docker liveness remains healthy" ;;
  *) fail "deployed /health/operate returned unexpected status $operate_status" ;;
esac

preexisting=$(docker ps --filter health=unhealthy --filter "label=$watchdog_label_filter" --format '{{.ID}}')
[ -z "$preexisting" ] || fail "pre-existing unhealthy Brain-labelled container detected: $preexisting"

docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >"$remote_dir/docker-pull.log"
health_args=(--health-interval 1s --health-timeout 1s --health-retries 1 --health-start-period 1s)
docker run -d --name "$smoke_brain" \
  --label ai.rizom.brain.watchdog=true \
  --label service=watchdog-smoke-brain \
  --health-cmd 'exit 1' "${health_args[@]}" \
  "$image" sh -c 'echo smoke-brain-start; exec sleep 600' >/dev/null
docker run -d --name "$unrelated" \
  --label service=watchdog-smoke-unrelated \
  --health-cmd 'exit 1' "${health_args[@]}" \
  "$image" sh -c 'echo smoke-unrelated-start; exec sleep 600' >/dev/null
docker run -d --name "$false_label" \
  --label ai.rizom.brain.watchdog=false \
  --label service=watchdog-smoke-false \
  --health-cmd 'exit 1' "${health_args[@]}" \
  "$image" sh -c 'echo smoke-false-start; exec sleep 600' >/dev/null
docker run -d --name "$healthy_brain" \
  --label ai.rizom.brain.watchdog=true \
  --label service=watchdog-smoke-healthy \
  --health-cmd 'exit 0' "${health_args[@]}" \
  "$image" sh -c 'echo smoke-healthy-start; exec sleep 600' >/dev/null

wait_for_health "$smoke_brain" unhealthy
wait_for_health "$unrelated" unhealthy
wait_for_health "$false_label" unhealthy
wait_for_health "$healthy_brain" healthy
pass "watchdog isolation fixtures reached their expected health states"

smoke_brain_id=$(docker ps --filter "name=^/$smoke_brain$" --format '{{.ID}}')
smoke_brain_full_id=$(docker inspect --format '{{.Id}}' "$smoke_brain")
unrelated_full_id=$(docker inspect --format '{{.Id}}' "$unrelated")
false_full_id=$(docker inspect --format '{{.Id}}' "$false_label")
healthy_full_id=$(docker inspect --format '{{.Id}}' "$healthy_brain")
unrelated_started_before=$(started_at "$unrelated")
false_started_before=$(started_at "$false_label")
healthy_started_before=$(started_at "$healthy_brain")

successful_restarts=0
for attempt in 1 2 3 4; do
  wait_for_health "$smoke_brain" unhealthy
  eligible=$(docker ps --filter health=unhealthy --filter "label=$watchdog_label_filter" --format '{{.ID}}')
  [ "$eligible" = "$smoke_brain_id" ] || fail "unexpected watchdog eligibility set before attempt $attempt: $eligible"
  started_before=$(started_at "$smoke_brain")
  BRAIN_WATCHDOG_INCIDENT_DIR="$remote_dir/incidents" \
  BRAIN_WATCHDOG_STATE_DIR="$remote_dir/state" \
  BRAIN_WATCHDOG_LOCK_PATH="$remote_dir/watchdog.lock" \
    "$installed_watchdog" \
    >"$remote_dir/watchdog-$attempt.stdout.log" \
    2>"$remote_dir/watchdog-$attempt.stderr.log"
  started_after=$(started_at "$smoke_brain")
  if [ "$attempt" -le 3 ]; then
    [ "$started_before" != "$started_after" ] || fail "attempt $attempt did not restart the eligible Brain fixture"
    successful_restarts=$((successful_restarts + 1))
  else
    [ "$started_before" = "$started_after" ] || fail "attempt 4 exceeded the three-per-hour restart budget"
  fi
done
[ "$successful_restarts" -eq 3 ] || fail "expected three successful restarts, got $successful_restarts"
pass "eligible Brain fixture restarted three times and was then suppressed"

[ "$(started_at "$unrelated")" = "$unrelated_started_before" ] || fail "unrelated service-labelled container was restarted"
[ "$(started_at "$false_label")" = "$false_started_before" ] || fail "false-labelled container was restarted"
[ "$(started_at "$healthy_brain")" = "$healthy_started_before" ] || fail "healthy Brain-labelled container was restarted"
[ "$(started_at "$deployed_container")" = "$deployed_started_before" ] || fail "deployed rover container changed during isolation smoke"
pass "ineligible fixtures and the deployed rover container were untouched"

mapfile -t state_files < <(find "$remote_dir/state" -maxdepth 1 -type f -name '*.restarts' -print)
[ "${#state_files[@]}" -eq 1 ] || fail "expected one restart state file, found ${#state_files[@]}"
printf '%s' "${state_files[0]}" | grep -Fq "$smoke_brain_id" || fail "restart state is not keyed by the eligible container ID"
restart_count=$(wc -l <"${state_files[0]}" | tr -d ' ')
[ "$restart_count" -eq 3 ] || fail "restart state contains $restart_count entries instead of 3"

mapfile -t incident_files < <(find "$remote_dir/incidents" -maxdepth 1 -type f -name '*.log' -print)
[ "${#incident_files[@]}" -ge 1 ] || fail "no watchdog incidents were captured"
grep -R -Fq 'smoke-brain-start' "$remote_dir/incidents" || fail "eligible container diagnostics were not captured"
grep -R -Fq 'restart-budget-exhausted' "$remote_dir/incidents" || fail "restart-budget suppression incident was not captured"
for untouched_id in "$unrelated_full_id" "$false_full_id" "$healthy_full_id"; do
  if grep -R -Fq "$untouched_id" "$remote_dir/incidents"; then
    fail "incident output contains an ineligible container ID"
  fi
done
pass "incident and state artifacts exist only for the eligible Brain fixture"

cat >"$remote_dir/summary.txt" <<EOF
run_id=$run_id
deployed_container=$deployed_container
deployed_container_label=$actual_label
deployed_container_health=$actual_health
deployed_container_healthcheck=$healthcheck
live_status=$live_status
operate_status=$operate_status
smoke_brain_id=$smoke_brain_full_id
successful_restarts=$successful_restarts
restart_budget_entries=$restart_count
incident_files=${#incident_files[@]}
unrelated_restarted=false
false_label_restarted=false
healthy_brain_restarted=false
deployed_container_restarted=false
EOF
pass "fleet watchdog isolation smoke completed"
printf 'REMOTE_ARTIFACT_DIR=%s\n' "$remote_dir"
