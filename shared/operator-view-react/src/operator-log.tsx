/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { toneText } from "@brains/app-ui-react";
import type {
  RuntimeOperatorLaunchIntent,
  RuntimeStudioOperatorPanelBlock,
} from "@brains/plugins";
import type { ReactElement } from "react";
import { logStyles as s } from "./operator-log.styles";
import { OperatorMetadata } from "./operator-metadata";
import { OperatorLink } from "./operator-view-links";

type LogItem = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "list" }
>["items"][number];

interface LogGroup {
  readonly label: string;
  readonly items: readonly LogItem[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Which part of the reader's day an event belongs to. */
function period(item: LogItem, now: number): string {
  const time = item.at ? Date.parse(item.at) : Number.NaN;
  if (!Number.isFinite(time)) return "Earlier";
  if (now - time < HOUR_MS) return "This hour";
  const day = (value: number): string => new Date(value).toDateString();
  if (day(time) === day(now)) return "Earlier today";
  if (day(time) === day(now - DAY_MS)) return "Yesterday";
  return "Earlier";
}

/** Consecutive rows of one period share a heading; order is the provider's. */
function groups(items: readonly LogItem[], now: number): readonly LogGroup[] {
  return items.reduce<LogGroup[]>((grouped, item) => {
    const label = period(item, now);
    const last = grouped.at(-1);
    return last?.label === label
      ? [...grouped.slice(0, -1), { label, items: [...last.items, item] }]
      : [...grouped, { label, items: [item] }];
  }, []);
}

/** A timed record of what happened, read newest first in periods of the day. */
export function LogList(props: {
  items: readonly LogItem[];
  onOpenEntity: (entityType: string, id: string) => void;
  onLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
}): ReactElement {
  return (
    <div {...stylex.props(s.root)}>
      {groups(props.items, Date.now()).map((group) => (
        <section key={group.label} {...stylex.props(s.group)}>
          <h3 {...stylex.props(s.groupLabel)}>{group.label}</h3>
          <ol {...stylex.props(s.rows)}>
            {group.items.map((item) => (
              <li
                key={item.id}
                data-row-id={item.id}
                data-tone={item.tone ?? "neutral"}
                {...stylex.props(s.row)}
              >
                {item.at ? (
                  <time dateTime={item.at} {...stylex.props(s.time)}>
                    {clock.format(new Date(item.at))}
                  </time>
                ) : (
                  <span />
                )}
                <span
                  aria-hidden="true"
                  {...stylex.props(s.mark, toneText(item.tone))}
                />
                <div {...stylex.props(s.copy)}>
                  <strong {...stylex.props(s.title)}>
                    {item.link ? (
                      <OperatorLink
                        target={item.link}
                        emphasis="title"
                        onOpenEntity={props.onOpenEntity}
                        onLaunch={props.onLaunch}
                      >
                        {item.title}
                      </OperatorLink>
                    ) : (
                      item.title
                    )}
                  </strong>
                  {item.description && (
                    <p {...stylex.props(s.description)}>{item.description}</p>
                  )}
                  {item.metadata && item.metadata.length > 0 && (
                    <small {...stylex.props(s.metadata)}>
                      <OperatorMetadata values={item.metadata} />
                    </small>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
