/** @jsxImportSource preact */
import type { JSX } from "preact";
import { CardHeader, EmptyState, KeyValueList } from "../widget-ui";
import { formatClock, formatTimestamp } from "./format";
import type { DashboardJobProgressItem, DashboardRenderInput } from "./types";

export function resolveIndexReady(input: DashboardRenderInput): boolean {
  return (
    input.indexStatus?.ready ?? input.indexReady ?? input.appInfo.embeddings > 0
  );
}

function calculateIndexPercent(
  status: NonNullable<DashboardRenderInput["indexStatus"]>,
): number {
  const outstanding =
    (status.activeEmbeddingJobs ?? 0) +
    (status.missingEmbeddings ?? 0) +
    (status.staleEmbeddings ?? 0);
  if (status.ready && !status.degraded) return 100;
  if (status.ready) return 92;
  if (outstanding === 0) return 50;
  return Math.max(8, Math.min(88, 100 - outstanding * 12));
}

function formatIndexStatus(
  status: NonNullable<DashboardRenderInput["indexStatus"]>,
): string {
  const state = status.ready
    ? status.degraded
      ? "ready, degraded"
      : "ready"
    : "pending";
  return [
    "Semantic index",
    state,
    status.activeEmbeddingJobs !== undefined
      ? `${status.activeEmbeddingJobs} active`
      : undefined,
    status.missingEmbeddings !== undefined
      ? `${status.missingEmbeddings} missing`
      : undefined,
    status.staleEmbeddings !== undefined
      ? `${status.staleEmbeddings} stale`
      : undefined,
    status.failedEmbeddings !== undefined
      ? `${status.failedEmbeddings} failed`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function IndexGauge({
  status,
}: {
  status: NonNullable<DashboardRenderInput["indexStatus"]>;
}): JSX.Element {
  const percent = calculateIndexPercent(status);
  const label = status.ready
    ? status.degraded
      ? "Degraded"
      : "Ready"
    : "Indexing";

  return (
    <div class="index-gauge" style={`--index-percent: ${percent}%`}>
      <div class="index-gauge-ring" aria-hidden="true">
        <span>{percent}%</span>
      </div>
      <div class="index-gauge-copy">
        <strong>{label}</strong>
        <span>{formatIndexStatus(status)}</span>
      </div>
    </div>
  );
}

export function SemanticIndexCard({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const indexReady = resolveIndexReady(input);

  return (
    <section class="card semantic-index-card">
      <CardHeader title="Semantic index" source="entity-service" />
      {input.indexStatus ? (
        <IndexGauge status={input.indexStatus} />
      ) : (
        <KeyValueList
          items={[
            {
              label: "Semantic index",
              value: indexReady ? "Ready" : "Pending",
            },
          ]}
        />
      )}
    </section>
  );
}

export function ContentSyncCard({
  status,
}: {
  status: NonNullable<DashboardRenderInput["directorySyncStatus"]>;
}): JSX.Element {
  const fileSummary =
    status.totalFiles === undefined
      ? "—"
      : status.totalFiles === 1
        ? "1 file"
        : `${status.totalFiles} files`;
  const typeSummary = status.byEntityType
    ? Object.entries(status.byEntityType)
        .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
        .slice(0, 2)
        .map(([entityType, count]) => `${entityType} ${count}`)
        .join(", ")
    : undefined;

  return (
    <section class="card content-sync-card">
      <CardHeader title="Content sync" source="directory-sync" />
      <KeyValueList
        items={[
          { label: "Path", value: status.syncPath },
          {
            label: "Files",
            value: typeSummary
              ? `${fileSummary} · ${typeSummary}`
              : fileSummary,
          },
          {
            label: "Watch",
            value: status.watchEnabled
              ? "Watching"
              : status.isInitialized
                ? "Manual"
                : "Not initialized",
          },
          {
            label: "Last sync",
            value: status.lastSync
              ? `last sync ${formatTimestamp(status.lastSync)}`
              : "—",
          },
        ]}
      />
      <div class="pipeline-mini" aria-label="Write pipeline">
        <span class={`pipeline-step${status.isInitialized ? " is-done" : ""}`}>
          entity db
        </span>
        <span class="pipeline-track"></span>
        <span
          class={`pipeline-step${(status.totalFiles ?? 0) > 0 ? " is-done" : ""}`}
        >
          exported
        </span>
        <span class="pipeline-track"></span>
        <span class={`pipeline-step${status.lastSync ? " is-done" : ""}`}>
          committed
        </span>
      </div>
    </section>
  );
}

const JOB_PILL_TONES: Record<DashboardJobProgressItem["status"], string> = {
  pending: "run",
  processing: "run",
  completed: "done",
  failed: "fail",
};

const JOB_PILL_LABELS: Record<DashboardJobProgressItem["status"], string> = {
  pending: "pending",
  processing: "running",
  completed: "done",
  failed: "failed",
};

export function JobQueueCard({
  jobs,
}: {
  jobs: DashboardJobProgressItem[];
}): JSX.Element {
  return (
    <section class="card widget-card--wide job-queue-card">
      <CardHeader title="Job queue" source="job-queue" />
      {jobs.length === 0 ? (
        <EmptyState>No recent job progress observed.</EmptyState>
      ) : (
        <table class="jobs">
          <thead>
            <tr>
              <th>Job</th>
              <th>Type</th>
              <th>Updated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={`${job.kind}:${job.id}`}>
                <td class="mono">{job.id.slice(0, 8)}</td>
                <td>{job.jobType ?? job.kind}</td>
                <td class="mono">{formatClock(job.updatedAt)}</td>
                <td>
                  <span
                    class={`status-pill status-pill--${JOB_PILL_TONES[job.status]}`}
                  >
                    {JOB_PILL_LABELS[job.status]}
                    {job.progressLabel ? ` · ${job.progressLabel}` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
