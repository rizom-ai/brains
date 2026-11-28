import type { StudioArea } from "./studio-areas";

/** One page a section holds, as the phone lists it. */
export interface PhoneTabOption {
  value: string;
  href: string;
  label: string;
  accessibleLabel?: string | undefined;
  tally?: number | undefined;
  attention?: number | undefined;
}

export interface PhoneTabGroup {
  area: StudioArea;
  label: string;
  options: readonly PhoneTabOption[];
}

/** A section's tab: where it opens, what it holds, and whether it needs you. */
export interface PhoneTab {
  area: StudioArea;
  label: string;
  /** Where tapping the tab goes: the section's first page. */
  main: PhoneTabOption;
  options: readonly PhoneTabOption[];
  /** The page open now is in this section. */
  active: boolean;
  /** What in the section asks for attention, summed. */
  attention: number;
}

/**
 * The phone's tab bar: one tab per section that holds anything, opening its
 * first page, marked when the open page is in it, and lit when anything in
 * it needs you.
 */
export function phoneTabs(
  groups: readonly PhoneTabGroup[],
  activeValue: string,
): PhoneTab[] {
  return groups.flatMap((group) => {
    const [main] = group.options;
    if (!main) return [];
    return [
      {
        area: group.area,
        label: group.label,
        main,
        options: group.options,
        active: group.options.some((option) => option.value === activeValue),
        attention: group.options.reduce(
          (sum, option) => sum + (option.attention ?? 0),
          0,
        ),
      },
    ];
  });
}
