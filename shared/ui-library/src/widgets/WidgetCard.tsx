// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";

const TITLE_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-theme-muted";

export interface WidgetCardProps {
  /** Shown in the header, uppercased by the title style. */
  title: string;
  /**
   * Right-hand side of the header — a count badge, controls. Its presence
   * switches the header to a space-between row.
   */
  trailing?: ComponentChildren;
  /**
   * Replaces the body with a muted message. Widgets use this for the "no
   * data" branch they hit when their payload fails to parse or is empty.
   */
  empty?: string;
  children?: ComponentChildren;
}

/**
 * The surface every dashboard widget renders into: bordered subtle panel,
 * uppercase title, optional trailing header slot, and a shared empty state.
 *
 * Each widget previously repeated this shell twice — once for its populated
 * branch and once for its empty branch — so a change to the panel meant
 * editing it in a dozen places.
 */
export function WidgetCard({
  title,
  trailing,
  empty,
  children,
}: WidgetCardProps): VNode {
  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      {trailing === undefined ? (
        <div className={`${TITLE_CLASS} mb-3`}>{title}</div>
      ) : (
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className={TITLE_CLASS}>{title}</span>
          {trailing}
        </div>
      )}
      {empty === undefined ? (
        children
      ) : (
        <p className="text-sm text-theme-muted">{empty}</p>
      )}
    </div>
  );
}
