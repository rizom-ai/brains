/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { isRecord } from "@brains/utils/is-record";
import type { FieldDescriptor } from "./api";
import { GroupingValue } from "./grouping-value-display";
import type { GroupingValueRules } from "../../src/grouping-definitions-contract";
import { systemFieldStyles as s } from "./studio-system-fields.styles";

/** A stored value as a reader takes it in: lists, labelled rows, links, words. */
export function SystemReadOnlyValue({
  value,
  fields,
  literalStrings,
  vocabulary,
}: {
  vocabulary?: GroupingValueRules | undefined;
  literalStrings?: boolean | undefined;
  value: unknown;
  fields?: FieldDescriptor[] | undefined;
}): ReactElement {
  if (literalStrings && typeof value === "string")
    return <GroupingValue value={value} vocabulary={vocabulary} />;
  if (value === undefined || value === null || value === "")
    return <span>Not set</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul {...stylex.props(s.list)}>
        {value.map((item, index) => (
          <li key={index}>
            <SystemReadOnlyValue
              value={item}
              fields={fields}
              literalStrings={literalStrings}
              vocabulary={vocabulary}
            />
          </li>
        ))}
      </ul>
    ) : (
      <span>None</span>
    );
  if (isRecord(value))
    return (
      <dl {...stylex.props(s.profile)}>
        {Object.entries(value).map(([key, item]) => (
          <div key={key} {...stylex.props(s.row)}>
            <dt {...stylex.props(s.term)}>
              {fields?.find((field) => field.name === key)?.label ?? key}
            </dt>
            <dd {...stylex.props(s.value)}>
              <SystemReadOnlyValue
                value={item}
                fields={fields?.find((field) => field.name === key)?.fields}
              />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (typeof value === "string" && /^https?:\/\//.test(value))
    return (
      <a href={value} {...stylex.props(s.link)}>
        {value}
      </a>
    );
  return (
    <span>
      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
    </span>
  );
}
