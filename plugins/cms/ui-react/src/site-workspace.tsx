import { useCallback, useState, type ReactElement } from "react";
import type {
  SiteEnvironmentSnapshot,
  SiteWorkspaceAction,
  SiteWorkspaceActionResult,
  SiteWorkspaceSnapshot,
} from "./api";
import { errorMessage } from "./ui-utils";

function siteEnvironment(
  data: SiteWorkspaceSnapshot,
  environment: "preview" | "production",
): SiteEnvironmentSnapshot | undefined {
  return data.environments.find((entry) => entry.environment === environment);
}

function siteBuildState(
  environment: SiteEnvironmentSnapshot | undefined,
): string {
  if (environment?.active) return environment.active.state;
  if (environment?.lastFailure) return "failed";
  if (environment?.lastSuccess) return "current";
  return "not built";
}

function formatBuildTime(value: string | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SiteEnvironmentCard(props: {
  label: string;
  description: string;
  environment: SiteEnvironmentSnapshot | undefined;
  url?: string | undefined;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}): ReactElement {
  const success = props.environment?.lastSuccess;
  const failure = props.environment?.lastFailure;
  const state = siteBuildState(props.environment);
  return (
    <article className={`site-environment site-environment--${state}`}>
      <header>
        <div>
          <h3>{props.label}</h3>
          <p>{props.description}</p>
        </div>
        <span className={`site-build-state site-build-state--${state}`}>
          {state}
        </span>
      </header>
      {props.url && (
        <a
          className="site-environment-url"
          href={props.url}
          target="_blank"
          rel="noreferrer"
        >
          {props.url} ↗
        </a>
      )}
      <dl className="site-build-facts">
        <div>
          <dt>Last successful build</dt>
          <dd>{formatBuildTime(success?.completedAt)}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>
            {success
              ? `${success.routesBuilt} routes${success.warnings.length > 0 ? ` · ${success.warnings.length} warning` : ""}`
              : "No successful build recorded"}
          </dd>
        </div>
      </dl>
      {failure && <p className="site-build-error">{failure.message}</p>}
      <button
        type="button"
        className="btn site-build-action"
        disabled={props.busy || props.environment?.active !== undefined}
        onClick={props.onAction}
      >
        {props.busy ? "Requesting…" : props.actionLabel}
      </button>
    </article>
  );
}

export function SiteWorkspace(props: {
  data: SiteWorkspaceSnapshot;
  onAction: (action: SiteWorkspaceAction) => Promise<SiteWorkspaceActionResult>;
  onOpenSiteInfo?: (() => void) | undefined;
}): ReactElement {
  const [pending, setPending] = useState<"preview" | "production" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmProduction, setConfirmProduction] = useState(false);
  const preview = siteEnvironment(props.data, "preview");
  const production = siteEnvironment(props.data, "production");

  const execute = useCallback(
    async (action: SiteWorkspaceAction): Promise<void> => {
      const environment =
        action.type === "build-preview" ? "preview" : "production";
      setPending(environment);
      setError(null);
      try {
        await props.onAction(action);
        setConfirmProduction(false);
      } catch (actionError: unknown) {
        setError(errorMessage(actionError));
      } finally {
        setPending(null);
      }
    },
    [props],
  );

  return (
    <main className="site-workspace">
      <header className="site-workspace-head">
        <div>
          <span>Website operations</span>
          <h2>Site control</h2>
          <p>
            Build a proof with public drafts, then update the live site from
            published public content.
          </p>
        </div>
        <strong>{props.data.site.title}</strong>
      </header>

      {error && <p className="status status-error">{error}</p>}

      <section className="site-environments" aria-label="Site environments">
        <SiteEnvironmentCard
          label="Preview"
          description="Public content · drafts included"
          environment={preview}
          url={props.data.site.previewUrl}
          actionLabel="Build preview"
          busy={pending === "preview"}
          onAction={() => void execute({ type: "build-preview" })}
        />
        <SiteEnvironmentCard
          label="Live"
          description="Published public content only"
          environment={production}
          url={props.data.site.liveUrl}
          actionLabel="Update live site"
          busy={pending === "production"}
          onAction={() => setConfirmProduction(true)}
        />
      </section>

      <div className="site-workspace-grid">
        <section>
          <header className="site-section-head">
            <h3>Recent builds</h3>
            <span>latest five</span>
          </header>
          {props.data.recentBuilds.length === 0 ? (
            <p className="site-empty">No completed builds in this runtime.</p>
          ) : (
            <ol className="site-build-list">
              {props.data.recentBuilds.map((build) => (
                <li key={`${build.jobId}:${build.completedAt}`}>
                  <span className={`site-build-outcome ${build.outcome}`}>
                    {build.outcome === "succeeded" ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>{build.environment}</strong>
                    <small>
                      {build.outcome === "succeeded"
                        ? `${build.routesBuilt ?? 0} routes`
                        : build.message}
                    </small>
                  </div>
                  <time>{formatBuildTime(build.completedAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="site-workspace-aside">
          <section className="site-fact-card">
            <header>Automation</header>
            <dl>
              <div>
                <dt>Auto-rebuild</dt>
                <dd>{props.data.automation.autoRebuild ? "On" : "Off"}</dd>
              </div>
              <div>
                <dt>Default target</dt>
                <dd>{props.data.automation.defaultEnvironment}</dd>
              </div>
              <div>
                <dt>Debounce</dt>
                <dd>{props.data.automation.debounceMs / 1000}s</dd>
              </div>
            </dl>
            {props.onOpenSiteInfo && (
              <button
                type="button"
                className="site-info-link"
                onClick={props.onOpenSiteInfo}
              >
                Edit site title and metadata →
              </button>
            )}
          </section>
          <section className="site-fact-card">
            <header>Registered routes · {props.data.routes.length}</header>
            <ul className="site-route-list">
              {props.data.routes.slice(0, 5).map((route) => (
                <li key={route.id}>
                  <code>{route.path}</code>
                  <span>{route.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {confirmProduction && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={() => setConfirmProduction(false)}
        >
          <section
            className="delete-modal site-production-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="site-production-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="modal-mark" aria-hidden="true">
              ↑
            </span>
            <h3 id="site-production-title">Update the live site?</h3>
            <p>
              This rebuild replaces the production output currently served at{" "}
              {props.data.site.liveUrl ?? "the configured live URL"} using
              published public content only.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmProduction(false)}
              >
                Keep current site
              </button>
              <button
                type="button"
                className="btn site-production-confirm"
                disabled={pending !== null}
                onClick={() =>
                  void execute({
                    type: "build-production",
                    confirmed: true,
                  })
                }
              >
                {pending === "production" ? "Requesting…" : "Update live site"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
