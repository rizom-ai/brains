import { formFields, type FormDefinition } from "./definition";
import type { FormAnswers } from "./validate";

/** A submission's result in one dimension. */
export interface FormResult {
  dimension: string;
  outcome: string;
}

/** Each scored dimension's highest-scoring outcome, in the order the form
 * lists its dimensions; a tie goes to the outcome listed first. A dimension
 * no answer counted towards has no result. */
export function scoreAnswers(
  form: FormDefinition,
  answers: FormAnswers,
): FormResult[] {
  const tallies = formFields(form)
    .flatMap((field) => {
      if (!("options" in field)) return [];
      const answer = answers[field.id];
      const chosen = new Set(
        answer === undefined ? [] : Array.isArray(answer) ? answer : [answer],
      );
      return field.options
        .filter((option) => chosen.has(option.value))
        .flatMap((option) => option.scores ?? []);
    })
    .reduce<Map<string, number>>(
      (sum, score) =>
        sum.set(
          `${score.dimension}/${score.outcome}`,
          (sum.get(`${score.dimension}/${score.outcome}`) ?? 0) + score.weight,
        ),
      new Map(),
    );
  return (form.scoring?.dimensions ?? []).flatMap((dimension): FormResult[] => {
    const best = dimension.outcomes.reduce<{ id: string; points: number }>(
      (top, outcome) => {
        const points = tallies.get(`${dimension.id}/${outcome.id}`) ?? 0;
        return points > top.points ? { id: outcome.id, points } : top;
      },
      { id: "", points: 0 },
    );
    return best.points > 0
      ? [{ dimension: dimension.id, outcome: best.id }]
      : [];
  });
}
