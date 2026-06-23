import type { OpportunityEntity } from "../schemas/opportunity";

const URGENCY_WINDOW_DAYS = 30;
const URGENCY_BUMP = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OpportunityRankingOptions {
  now?: string | Date;
}

export interface OpportunityScore {
  valueScore: number;
  integrityScore: number;
  urgencyBump: number;
  total: number;
  disqualified: boolean;
}

export interface RankedOpportunity extends OpportunityScore {
  id: string;
  title: string;
  slug: string;
  type: OpportunityEntity["metadata"]["type"];
  state: OpportunityEntity["metadata"]["state"];
  owner?: string;
  hardDeadline?: string;
  lastActionAt?: string;
  lastActionBy?: string;
}

export function computeOpportunityScore(
  opportunity: OpportunityEntity,
  options: OpportunityRankingOptions = {},
): OpportunityScore {
  const { metadata } = opportunity;
  const valueScore =
    metadata.incomePotential +
    metadata.organizationalBuild +
    metadata.brainsDevelopment;
  const integrityScore = metadata.integrity * 1.5;
  const urgencyBump = hasUrgentDeadline(metadata.hardDeadline, options.now)
    ? URGENCY_BUMP
    : 0;

  return {
    valueScore,
    integrityScore,
    urgencyBump,
    total: valueScore + integrityScore + urgencyBump,
    disqualified: metadata.integrity === 0,
  };
}

export function rankOpportunities(
  opportunities: OpportunityEntity[],
  options: OpportunityRankingOptions = {},
): RankedOpportunity[] {
  return opportunities
    .map((opportunity) => ({
      ...computeOpportunityScore(opportunity, options),
      id: opportunity.id,
      title: opportunity.metadata.title,
      slug: opportunity.metadata.slug,
      type: opportunity.metadata.type,
      state: opportunity.metadata.state,
      ...(opportunity.metadata.owner
        ? { owner: opportunity.metadata.owner }
        : {}),
      ...(opportunity.metadata.hardDeadline
        ? { hardDeadline: opportunity.metadata.hardDeadline }
        : {}),
      ...(opportunity.metadata.lastActionAt
        ? { lastActionAt: opportunity.metadata.lastActionAt }
        : {}),
      ...(opportunity.metadata.lastActionBy
        ? { lastActionBy: opportunity.metadata.lastActionBy }
        : {}),
    }))
    .sort(compareRankedOpportunities);
}

function compareRankedOpportunities(
  a: RankedOpportunity,
  b: RankedOpportunity,
): number {
  if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;

  const scoreDelta = b.total - a.total;
  if (scoreDelta !== 0) return scoreDelta;

  const deadlineDelta = compareOptionalDates(a.hardDeadline, b.hardDeadline);
  if (deadlineDelta !== 0) return deadlineDelta;

  return a.title.localeCompare(b.title);
}

function compareOptionalDates(a?: string, b?: string): number {
  if (a && b) return parseDateOnly(a).getTime() - parseDateOnly(b).getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function hasUrgentDeadline(
  deadline: string | undefined,
  now?: string | Date,
): boolean {
  if (!deadline) return false;

  const deadlineDate = parseDateOnly(deadline);
  const nowDate = normalizeDateOnly(now ?? new Date());
  const daysUntilDeadline = Math.floor(
    (deadlineDate.getTime() - nowDate.getTime()) / MS_PER_DAY,
  );

  return daysUntilDeadline >= 0 && daysUntilDeadline <= URGENCY_WINDOW_DAYS;
}

function normalizeDateOnly(value: string | Date): Date {
  if (typeof value === "string") return parseDateOnly(value);
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(Date.UTC(year, month - 1, day));
}
