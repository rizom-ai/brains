import { useCallback, useState, type ReactElement } from "react";
import type {
  DirectorySyncWorkspaceActionResult,
  DirectorySyncWorkspaceSnapshot,
} from "./api";
import { errorMessage, formatUpdated, publicationLabel } from "./ui-utils";

function syncRunSummary(
  run: DirectorySyncWorkspaceSnapshot["recentRuns"][number],
): string {
  const facts = [
    run.imported > 0 ? `${run.imported} imported` : null,
    run.exported > 0 ? `${run.exported} exported` : null,
    run.skipped > 0 ? `${run.skipped} unchanged` : null,
    run.quarantined > 0 ? `${run.quarantined} quarantined` : null,
    run.failed > 0 ? `${run.failed} failed` : null,
  ].filter((fact): fact is string => fact !== null);
  return facts.length > 0 ? facts.join(" · ") : run.summary;
}

function syncSourceLabel(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function DirectorySyncWorkspace(props: {
  data: DirectorySyncWorkspaceSnapshot;
  onAction: () => Promise<DirectorySyncWorkspaceActionResult>;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = props;
  const git = data.git;
  const coverage = Object.entries(data.directory.byEntityType)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5);
  const maxCoverage = coverage[0]?.[1] ?? 1;
  const healthLabel =
    data.health === "active"
      ? "Sync in progress"
      : data.health === "attention"
        ? "Needs attention"
        : data.directory.watching
          ? "Watching"
          : "Ready";

  const runSync = useCallback(async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await props.onAction();
    } catch (actionError: unknown) {
      setError(errorMessage(actionError));
    } finally {
      setPending(false);
    }
  }, [props]);

  return (
    <main className="directory-sync-workspace" data-health={data.health}>
      <header className="directory-sync-head">
        <div>
          <span>Durability operations</span>
          <h2>Content sync</h2>
          <p>
            Keep the entity database, {data.directory.displayPath} files, and
            configured Git remote converged.
          </p>
        </div>
        <strong className="directory-sync-health">
          {healthLabel}
          <small>
            {data.directory.lastSettledAt
              ? `last settled ${formatUpdated(data.directory.lastSettledAt)}`
              : "no completed sync recorded"}
          </small>
        </strong>
      </header>

      {error && <p className="status status-error">{error}</p>}

      <section className="directory-sync-vitals" aria-label="Sync summary">
        <div>
          <span>Files</span>
          <b>{data.directory.totalFiles}</b>
          <small>markdown + images</small>
        </div>
        <div>
          <span>Entity types</span>
          <b>{Object.keys(data.directory.byEntityType).length}</b>
          <small>within sync scope</small>
        </div>
        <div>
          <span>Branch</span>
          <b className="directory-sync-word">{git?.branch ?? "local"}</b>
          <small>{git ? "remote connected" : "files only"}</small>
        </div>
        <div className={data.issues.length > 0 ? "needs" : ""}>
          <span>{data.issues.length > 0 ? "Issues" : "Remote delta"}</span>
          <b>
            {data.issues.length > 0 ? data.issues.length : (git?.behind ?? 0)}
          </b>
          <small>
            {data.issues.length > 0
              ? "needs attention"
              : git
                ? `${git.ahead} ahead · ${git.behind} behind`
                : "not configured"}
          </small>
        </div>
      </section>

      <section
        className="directory-sync-flow"
        data-has-git={git ? "true" : "false"}
        aria-label="Content sync flow"
      >
        <div>
          <strong>Entity DB</strong>
          <small>runtime records</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <strong>{data.directory.displayPath}</strong>
          <small>
            {data.directory.watching ? "watching" : "manual"} ·{" "}
            {data.directory.totalFiles} files
          </small>
        </div>
        {git && (
          <>
            <i aria-hidden="true">→</i>
            <div>
              <strong>Git remote</strong>
              <small>{git.remoteLabel ?? git.branch}</small>
            </div>
          </>
        )}
        <button
          type="button"
          className="btn directory-sync-action"
          disabled={pending || data.activeRun !== undefined}
          onClick={() => void runSync()}
        >
          {pending || data.activeRun ? "Syncing…" : "Sync now"}
        </button>
      </section>

      <div className="directory-sync-grid">
        <section>
          {data.activeRun && (
            <article className="directory-sync-active">
              <header>
                <i aria-hidden="true" />
                <strong>{publicationLabel(data.activeRun.state)}</strong>
                <time>{formatUpdated(data.activeRun.startedAt)}</time>
              </header>
              <p>
                {syncSourceLabel(data.activeRun.source)} sync is active. This
                view refreshes until the referenced job or batch settles.
              </p>
              <span aria-hidden="true">
                <i />
              </span>
            </article>
          )}
          <header className="directory-sync-section-head">
            <h3>Recent syncs</h3>
            <span>latest five · runtime history</span>
          </header>
          {data.recentRuns.length === 0 ? (
            <p className="directory-sync-empty">
              No completed sync activity recorded in this runtime.
            </p>
          ) : (
            <ol className="directory-sync-run-list">
              {data.recentRuns.map((run) => (
                <li key={run.id}>
                  <span className={`directory-sync-outcome ${run.outcome}`}>
                    {run.outcome === "succeeded" ? "✓" : "!"}
                  </span>
                  <span className="directory-sync-source">{run.source}</span>
                  <span>
                    <strong>{run.summary}</strong>
                    <small>{syncRunSummary(run)}</small>
                  </span>
                  <time>{formatUpdated(run.completedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="directory-sync-aside">
          <section
            className={
              data.issues.length > 0
                ? "directory-sync-card directory-sync-card--attention"
                : "directory-sync-card directory-sync-card--clear"
            }
          >
            <header>
              {data.issues.length > 0 ? "Needs attention" : "No blockers"}
            </header>
            {data.issues.length === 0 ? (
              <p>
                Directory exists, configured automation is available, and no
                unresolved operation failures are recorded.
              </p>
            ) : (
              data.issues.slice(0, 3).map((issue) => (
                <div className="directory-sync-issue" key={issue.id}>
                  <strong>{publicationLabel(issue.kind)}</strong>
                  {issue.path && <code>{issue.path}</code>}
                  <small>{issue.message}</small>
                </div>
              ))
            )}
          </section>

          <section className="directory-sync-card">
            <header>Automation</header>
            <dl>
              <div>
                <dt>File watcher</dt>
                <dd>{data.directory.watching ? "On" : "Manual"}</dd>
              </div>
              {data.automation.remoteIntervalMinutes !== undefined && (
                <div>
                  <dt>Remote pull</dt>
                  <dd>Every {data.automation.remoteIntervalMinutes}m</dd>
                </div>
              )}
              {data.automation.commitDebounceMs !== undefined && (
                <div>
                  <dt>Auto-commit</dt>
                  <dd>{data.automation.commitDebounceMs / 1000}s debounce</dd>
                </div>
              )}
              <div>
                <dt>File removal</dt>
                <dd>
                  {data.automation.deleteOnFileRemoval
                    ? "Deletes entity"
                    : "Preserves entity"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="directory-sync-card">
            <header>Source</header>
            <dl>
              <div>
                <dt>Directory</dt>
                <dd>{data.directory.displayPath}/</dd>
              </div>
              <div>
                <dt>Remote</dt>
                <dd>{git?.remoteLabel ?? "Not configured"}</dd>
              </div>
              <div>
                <dt>Last commit</dt>
                <dd>{git?.lastCommit?.slice(0, 7) ?? "—"}</dd>
              </div>
              <div>
                <dt>Working tree</dt>
                <dd>{git?.hasChanges ? "Pending" : "Clean"}</dd>
              </div>
            </dl>
          </section>

          {coverage.length > 0 && (
            <section className="directory-sync-card">
              <header>Largest collections</header>
              {coverage.map(([entityType, count]) => (
                <div className="directory-sync-coverage" key={entityType}>
                  <span>{entityType}</span>
                  <i>
                    <b style={{ width: `${(count / maxCoverage) * 100}%` }} />
                  </i>
                  <small>{count}</small>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
