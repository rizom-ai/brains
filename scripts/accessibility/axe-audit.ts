import axe from "axe-core";
import { evaluatePageWith } from "../console-visual/page";

/** WCAG 2.0–2.2, levels A and AA: the rules every audit in this repo runs. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] as const;

export const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;
export type Impact = (typeof IMPACTS)[number];

export interface AxeAudit {
  violations: axe.Result[];
  incomplete: axe.Result[];
  passedRules: string[];
}

/** Runs axe over the page's current document with {@link AXE_TAGS}. */
export async function runAxeAudit(page: Bun.WebView): Promise<AxeAudit> {
  await page.evaluate(`(() => { ${axe.source}; return true; })()`);
  return evaluatePageWith(
    page,
    async (tags: string[]) => {
      const runtime = (globalThis as unknown as { axe: typeof axe }).axe;
      const result = await runtime.run(document, {
        runOnly: { type: "tag", values: tags },
      });
      return {
        violations: result.violations,
        incomplete: result.incomplete,
        passedRules: result.passes.map((rule) => rule.id),
      };
    },
    [...AXE_TAGS],
  );
}

export type ImpactCounts = Record<Impact, { rules: number; nodes: number }>;

/** Rules and nodes per impact; a rule axe leaves unrated counts as minor. */
export function countByImpact(
  violations: readonly {
    impact?: axe.Result["impact"];
    nodes: readonly unknown[];
  }[],
): ImpactCounts {
  return Object.fromEntries(
    IMPACTS.map((impact) => {
      const matching = violations.filter(
        (violation) => (violation.impact ?? "minor") === impact,
      );
      return [
        impact,
        {
          rules: matching.length,
          nodes: matching.reduce(
            (total, violation) => total + violation.nodes.length,
            0,
          ),
        },
      ];
    }),
  ) as ImpactCounts;
}
