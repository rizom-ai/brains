/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import type { GroupingValueRules } from "../../src/grouping-definitions-contract";
import { groupingValueLabel } from "./grouping-value";
import { groupingSharedStyles as s } from "./grouping-shared.styles";

export function GroupingValue({
  value,
  vocabulary,
}: {
  value: string;
  vocabulary?: GroupingValueRules | undefined;
}): ReactElement {
  return (
    <span>
      {groupingValueLabel(value)}
      {vocabulary?.values && !vocabulary.values.includes(value) && (
        <span {...stylex.props(s.marker)}>not in list</span>
      )}
    </span>
  );
}
