import type { OpportunityState } from "../schemas/opportunity";
import type { RankedOpportunity } from "./opportunity-ranking";

const STAGED_THRESHOLD = 11;
const MAX_ACTIVE = 2;

export interface FocusedOpportunity extends RankedOpportunity {
  rationale: string;
}

export interface OpportunityStateSuggestion {
  id: string;
  title: string;
  currentState: OpportunityState;
  suggestedState: OpportunityState;
  total: number;
  disqualified: boolean;
  reason: string;
}

export function buildOpportunityFocus(
  ranked: RankedOpportunity[],
): FocusedOpportunity[] {
  return ranked
    .filter((opportunity) => !opportunity.disqualified)
    .slice(0, MAX_ACTIVE)
    .map((opportunity) => ({
      ...opportunity,
      rationale: buildFocusRationale(opportunity),
    }));
}

export function suggestOpportunityStates(
  ranked: RankedOpportunity[],
): OpportunityStateSuggestion[] {
  const activeIds = new Set(
    ranked
      .filter((opportunity) => !opportunity.disqualified)
      .slice(0, MAX_ACTIVE)
      .map((opportunity) => opportunity.id),
  );

  return ranked.map((opportunity) => {
    const suggestedState = getSuggestedState(opportunity, activeIds);
    return {
      id: opportunity.id,
      title: opportunity.title,
      currentState: opportunity.state,
      suggestedState,
      total: opportunity.total,
      disqualified: opportunity.disqualified,
      reason: buildSuggestionReason(opportunity, suggestedState),
    };
  });
}

function getSuggestedState(
  opportunity: RankedOpportunity,
  activeIds: Set<string>,
): OpportunityState {
  if (!opportunity.disqualified && activeIds.has(opportunity.id)) {
    return "active";
  }
  return opportunity.total >= STAGED_THRESHOLD ? "staged" : "warm";
}

function buildFocusRationale(opportunity: RankedOpportunity): string {
  const parts = [`score ${formatScore(opportunity.total)}`];
  if (opportunity.urgencyBump > 0) {
    parts.push("deadline within 30 days");
  }
  if (opportunity.owner) {
    parts.push(`owner ${opportunity.owner}`);
  }
  return parts.join("; ");
}

function buildSuggestionReason(
  opportunity: RankedOpportunity,
  suggestedState: OpportunityState,
): string {
  if (opportunity.disqualified) {
    return "Integrity score is 0, so this opportunity cannot be Active.";
  }
  if (suggestedState === "active") {
    return "Top eligible opportunity within the max-2 Active limit.";
  }
  if (suggestedState === "staged") {
    return `Score ${formatScore(opportunity.total)} is at or above the staged threshold.`;
  }
  return `Score ${formatScore(opportunity.total)} is below the staged threshold.`;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
