import type { StudioHome, StudioHomeAttention } from "./home-contract";
import type {
  BrainFacts,
  LoadedContribution,
  OverviewActivity,
} from "./overview-workspace";
import type { StudioWorkspaceAttention } from "./workspace-registry";

/*
 * Home answers three questions in order: what needs me, what was I in the
 * middle of, and what went out. Each "needs you" item carries the verb that
 * clears it, and nothing healthy is listed.
 */

/** Where Home's links lead, as Studio paths. */
export interface StudioHomePaths {
  workspace(id: string, query?: Readonly<Record<string, string>>): string;
  /** The page a plugin's widget belongs to, when the person may open one. */
  pluginPage(pluginId: string): string | undefined;
  history: string;
}

export interface StudioHomeInput {
  now: Date;
  /** What each workspace says needs the person. */
  workspaceAttention: readonly StudioWorkspaceAttention[];
  /** Plugins whose workspaces say for themselves; their widgets stay out. */
  pluginsWithAttention: ReadonlySet<string>;
  /** Dashboard widgets that count what waits, from plugins without their own say. */
  contributions: readonly LoadedContribution[];
  failedJobs: readonly OverviewActivity[];
  drafts: StudioHome["drafts"];
  published: StudioHome["published"];
  facts: BrainFacts;
  paths: StudioHomePaths;
}

const severityRank: Record<StudioHomeAttention["severity"], number> = {
  error: 0,
  warn: 1,
  info: 2,
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A widget that counts what waits, as one item: its warnings, and its page. */
function contributionItem(
  loaded: LoadedContribution,
  paths: StudioHomePaths,
): StudioHomeAttention | undefined {
  if (loaded.attention === 0 && !loaded.failed) return undefined;
  const { contribution } = loaded;
  const warnings = loaded.digest
    .filter((line) => line.tone === "warn")
    .map((line) => `${line.label}: ${line.value}`)
    .join(" · ");
  const launch = loaded.data?.view.blocks
    .flatMap((block) => (block.type === "links" ? block.items : []))
    .find((item) => item.target.kind === "launch");
  const href = paths.pluginPage(contribution.pluginId);
  return {
    id: `${contribution.pluginId}:${contribution.id}`,
    title: contribution.title,
    detail: loaded.failed
      ? "This source is unavailable right now."
      : warnings ||
        `${plural(loaded.attention, "item needs", "items need")} attention.`,
    severity: loaded.failed ? "error" : "warn",
    source: contribution.title,
    ...(href
      ? {
          action: {
            label: launch?.label ?? `Open ${contribution.title.toLowerCase()}`,
            href,
          },
        }
      : {}),
  };
}

/** The brain's health in one line: worst first, nothing when there is nothing. */
function statusLine(facts: BrainFacts, history: string): StudioHome["status"] {
  const link = { label: "History", href: history };
  if (facts.degraded)
    return { tone: "error", text: "Brain degraded.", history: link };
  if (facts.runtime !== "operational")
    return { tone: "warn", text: "Brain unavailable.", history: link };
  const parts = [
    "Brain running.",
    ...(facts.failedJobs > 0
      ? [`${plural(facts.failedJobs, "job", "jobs")} failed.`]
      : []),
    ...(facts.activeJobs > 0
      ? [`${plural(facts.activeJobs, "job", "jobs")} in progress.`]
      : []),
  ];
  return {
    tone: facts.failedJobs > 0 ? "warn" : "good",
    text: parts.join(" "),
    history: link,
  };
}

export function composeStudioHome(input: StudioHomeInput): StudioHome {
  const fromWorkspaces = input.workspaceAttention.flatMap((workspace) =>
    workspace.items.map((item): StudioHomeAttention => ({
      id: `${workspace.workspaceId}:${item.id}`,
      title: item.title,
      ...(item.detail ? { detail: item.detail } : {}),
      severity: item.severity,
      source: workspace.label,
      action: {
        label: item.action.label,
        href: input.paths.workspace(workspace.workspaceId, item.action.query),
      },
    })),
  );
  const fromWidgets = input.contributions
    .filter(
      (loaded) => !input.pluginsWithAttention.has(loaded.contribution.pluginId),
    )
    .flatMap((loaded) => contributionItem(loaded, input.paths) ?? []);
  const fromJobs = input.failedJobs.map((job): StudioHomeAttention => ({
    id: `job:${job.id}`,
    title: job.title,
    ...(job.description ? { detail: job.description } : {}),
    severity: "error",
    source: "Jobs",
    action: { label: "See history", href: input.paths.history },
  }));
  // Failures first; within a severity, jobs, then workspaces in priority order.
  const needsYou = [...fromJobs, ...fromWorkspaces, ...fromWidgets].sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );
  return {
    now: input.now.toISOString(),
    needsYou,
    drafts: input.drafts,
    published: input.published,
    status: statusLine(input.facts, input.paths.history),
  };
}
