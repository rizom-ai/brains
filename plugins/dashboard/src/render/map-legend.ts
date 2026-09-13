import type { ComponentProps } from "react";
import type { OperatorMapLegendItem } from "@brains/operator-view-react";

type LegendPresentation = Pick<
  ComponentProps<typeof OperatorMapLegendItem>,
  "marker" | "tone"
>;

/** Interpret public legend categories here, not in shared styles or CSS selectors. */
export function mapLegendPresentation(item: {
  label: string;
  tone?: string | undefined;
}): LegendPresentation {
  const category = item.label.toLowerCase();
  // Preserve the source vocabulary's precedence when a label spans categories.
  if (category.includes("skill")) return { marker: "dot", tone: "good" };
  if (category.includes("published") || category.includes("approved"))
    return { marker: "dot", tone: "warn" };
  if (category.includes("topic") || category.includes("constellation"))
    return { marker: "dashed-ring", tone: "secondary" };
  if (item.tone === "good" || item.tone === "warn")
    return { marker: "dot", tone: item.tone };
  return { marker: "ring", tone: "neutral" };
}
