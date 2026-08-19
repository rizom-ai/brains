/** @jsxImportSource preact */
import type { JSX } from "preact";
import {
  CardHeader,
  WidgetPrimitiveEmptyState as EmptyState,
} from "@brains/ui-library";
import {
  countTabWidgets,
  getTabWidgets,
  type WidgetTab,
} from "./dashboard-tabs";
import { formatClock } from "./format";
import { resolveIndexReady } from "./system-cards";
import type { DashboardActivityEvent, DashboardRenderInput } from "./types";

interface OverviewDigestLine {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | undefined;
}

interface OverviewDigestCard {
  id: string;
  label: string;
  href: string;
  lines: OverviewDigestLine[];
}

function getFallbackDigestLines(
  tab: WidgetTab,
  input: DashboardRenderInput,
): OverviewDigestLine[] {
  if (tab.group === "system") {
    const indexReady = resolveIndexReady(input);
    return [
      { label: "Runtime", value: "Active", tone: "good" },
      { label: "Endpoints", value: String(input.appInfo.endpoints.length) },
      {
        label: "Semantic index",
        value: indexReady ? "Ready" : "Pending",
        tone: indexReady ? "good" : "warn",
      },
    ];
  }

  return [
    {
      label: countTabWidgets(tab) === 1 ? "Widget" : "Widgets",
      value: String(countTabWidgets(tab)),
    },
  ];
}

function buildOverviewDigestCards(
  tabs: WidgetTab[],
  input: DashboardRenderInput,
): OverviewDigestCard[] {
  return tabs.map((tab) => {
    const digestLines = getTabWidgets(tab)
      .flatMap((widget) => widget.widget.digest ?? [])
      .slice(0, 4);

    return {
      id: tab.id,
      label: tab.label,
      href: `#${tab.id}`,
      lines:
        digestLines.length > 0
          ? digestLines
          : getFallbackDigestLines(tab, input),
    };
  });
}

function roleLabel(role: "admin" | "trusted" | "public"): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function RestrictedAccessGate({
  hiddenWidgetCount,
  loginUrl,
  principal,
}: {
  hiddenWidgetCount: number;
  loginUrl: string;
  principal: NonNullable<DashboardRenderInput["authAccess"]>["principal"];
}): JSX.Element {
  return (
    <section className="card access-gate">
      <div>
        <div className="card-title">Restricted access</div>
        <p>
          {hiddenWidgetCount === 1
            ? "1 private console widget is hidden."
            : `${hiddenWidgetCount} private console widgets are hidden.`}{" "}
          {principal
            ? `Your ${roleLabel(principal.role)} role does not include this layer.`
            : "Sign in with your passkey to unlock the restricted layer."}
        </p>
      </div>
      {!principal && (
        <a className="access-gate-link" href={loginUrl}>
          Sign in
        </a>
      )}
    </section>
  );
}

function VitalsRow({ input }: { input: DashboardRenderInput }): JSX.Element {
  const indexReady = resolveIndexReady(input);
  const latestWrite = input.activityLog?.[0];
  const typeCount = input.appInfo.entityCounts.length;
  const channels = input.appInfo.interactions
    .map((interaction) => interaction.id)
    .slice(0, 3)
    .join(" / ");
  const embedded =
    input.indexStatus?.embeddedEntities ?? input.appInfo.embeddings;
  // The denominator is embeddable entities only: some entity types never
  // embed by design, so an all-entities denominator would mislead.
  const embeddable = input.indexStatus?.embeddableEntities;
  const indexQueue = input.indexStatus
    ? (input.indexStatus.activeEmbeddingJobs ?? 0) +
      (input.indexStatus.missingEmbeddings ?? 0) +
      (input.indexStatus.staleEmbeddings ?? 0)
    : 0;
  const indexFraction =
    embeddable === undefined ? `${embedded}` : `${embedded}/${embeddable}`;
  const indexSub =
    indexQueue > 0
      ? `${indexFraction} embedded · ${indexQueue} queued`
      : `${indexFraction} embedded`;
  const hasActiveWrite = (input.jobProgress ?? []).some(
    (job) => job.status === "processing" || job.status === "pending",
  );

  return (
    <section className="overview-vitals" aria-label="Runtime vitals">
      <article className="vital-card">
        <span className="vital-label">Entities</span>
        <strong className="vital-num">{input.appInfo.entities}</strong>
        <span className="vital-sub">
          {typeCount === 1 ? "1 type" : `${typeCount} types`}
        </span>
      </article>
      <article className="vital-card">
        <span className="vital-label">Interactions</span>
        <strong className="vital-num">
          {input.appInfo.interactions.length}
        </strong>
        <span className="vital-sub">{channels || "no channels"}</span>
      </article>
      <article
        className={`vital-card ${indexReady ? "vital-card--ok" : "vital-card--warm"}`}
      >
        <span className="vital-label">Semantic index</span>
        <strong className="vital-num vital-num--text">
          {indexReady ? "Ready" : "Pending"}
        </strong>
        <span className="vital-sub">{indexSub}</span>
      </article>
      <article
        className={`vital-card${hasActiveWrite ? " vital-card--warm" : ""}`}
      >
        <span className="vital-label">Last write</span>
        <strong className="vital-num vital-num--text">
          {latestWrite ? formatClock(latestWrite.timestamp) : "—"}
        </strong>
        <span className="vital-sub">
          {latestWrite
            ? `${latestWrite.entityType}/${latestWrite.entityId}`
            : "no writes observed"}
        </span>
      </article>
    </section>
  );
}

function IdentityCapsule({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element | null {
  const { role, purpose, values } = input.character;
  if (!role && !purpose && values.length === 0) return null;

  return (
    <aside className="card identity-capsule">
      <CardHeader title="Identity" source="identity" />
      <div className="identity-capsule-body">
        {role && <span className="identity-capsule-role">“{role}”</span>}
        {values.length > 0 && (
          <span className="values">
            {values.map((value) => (
              <span className="value" key={value}>
                {value}
              </span>
            ))}
          </span>
        )}
        {purpose && <span className="identity-capsule-purpose">{purpose}</span>}
      </div>
    </aside>
  );
}

function DigestCards({ cards }: { cards: OverviewDigestCard[] }): JSX.Element {
  if (cards.length === 0) {
    return (
      <section className="card overview-empty-digest">
        <CardHeader title="Group digests" />
        <EmptyState>No plugin groups are visible yet.</EmptyState>
      </section>
    );
  }

  return (
    <section className="digests" aria-label="Group digests">
      {cards.map((card) => (
        <a className="card digest-card" href={card.href} key={card.id}>
          <div className="digest-head">
            <h4>{card.label}</h4>
            <span className="digest-go">open →</span>
          </div>
          <dl className="digest-lines">
            {card.lines.map((line) => (
              <div
                className={`digest-line digest-line--${line.tone ?? "plain"}`}
                key={`${line.label}:${line.value}`}
              >
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        </a>
      ))}
    </section>
  );
}

const LEDGER_GLYPHS: Record<
  DashboardActivityEvent["action"],
  { glyph: string; tone: string }
> = {
  created: { glyph: "＋", tone: "" },
  updated: { glyph: "✓", tone: " ledger-glyph--ok" },
  deleted: { glyph: "−", tone: " ledger-glyph--warn" },
};

function ActivityLedger({
  events,
}: {
  events: DashboardActivityEvent[];
}): JSX.Element {
  return (
    <section className="card activity-ledger">
      <CardHeader title="Activity" source="entity events" />
      {events.length === 0 ? (
        <EmptyState>
          No entity activity has been observed this session.
        </EmptyState>
      ) : (
        <ol className="ledger">
          {events.map((event) => (
            <li
              className="ledger-entry"
              key={`${event.timestamp}:${event.action}:${event.entityType}:${event.entityId}`}
            >
              <time className="ledger-time" dateTime={event.timestamp}>
                {formatClock(event.timestamp)}
              </time>
              <span
                className={`ledger-glyph${LEDGER_GLYPHS[event.action].tone}`}
                aria-hidden="true"
              >
                {LEDGER_GLYPHS[event.action].glyph}
              </span>
              <span className="ledger-what">
                <b>{event.entityType}</b> {event.action} —{" "}
                <code>
                  {event.entityType}/{event.entityId}
                </code>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function OverviewPanel({
  input,
  tabs,
  showAccessGate,
}: {
  input: DashboardRenderInput;
  tabs: WidgetTab[];
  showAccessGate: boolean;
}): JSX.Element {
  const digestCards = buildOverviewDigestCards(tabs, input);
  const activityLog = input.activityLog ?? [];

  return (
    <section
      id="overview"
      className="dashboard-tab-panel is-active"
      data-dashboard-tab-panel
      data-ui-panel="overview"
      role="tabpanel"
      aria-labelledby="dashboard-tab-overview"
    >
      <VitalsRow input={input} />
      <IdentityCapsule input={input} />
      {showAccessGate && input.authAccess && (
        <RestrictedAccessGate
          hiddenWidgetCount={input.authAccess.hiddenWidgetCount}
          loginUrl={input.authAccess.loginUrl}
          principal={input.authAccess.principal}
        />
      )}
      <div className="overview-grid">
        <DigestCards cards={digestCards} />
        <ActivityLedger events={activityLog} />
      </div>
    </section>
  );
}
