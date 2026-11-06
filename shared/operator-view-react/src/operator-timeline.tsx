/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { toneText } from "@brains/app-ui-react";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import { useState, type MouseEvent, type ReactElement } from "react";
import { timelineStyles as s } from "./operator-timeline.styles";

type TimelineBlockData = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "timeline" }
>;
type TimelineItem = TimelineBlockData["items"][number];

interface PlacedEvent {
  readonly item: TimelineItem;
  readonly fraction: number;
  readonly lane: number;
}

const TICKS = 4;
/** Events closer than this share a moment, so they stack instead of overlap. */
const CROWDED_MS = 40 * 60 * 1000;
const LANE_TOPS = ["50%", "28%", "72%"] as const;
const LIGHT_STAGGER_MS = 70;

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Keeps a light's whole glow inside the band at either end. */
function inset(fraction: number): string {
  return `calc(18px + (100% - 36px) * ${Number(fraction.toFixed(4))})`;
}

function place(block: TimelineBlockData): readonly PlacedEvent[] {
  const start = Date.parse(block.start);
  const span = Date.parse(block.end) - start;
  return block.items
    .map((item) => ({ item, time: Date.parse(item.at) }))
    .filter(({ time }) => time >= start && time <= start + span)
    .sort((left, right) => left.time - right.time)
    .reduce<{ placed: PlacedEvent[]; previous: number; lane: number }>(
      (state, { item, time }) => {
        const lane =
          time - state.previous < CROWDED_MS
            ? (state.lane + 1) % LANE_TOPS.length
            : 0;
        return {
          placed: [
            ...state.placed,
            { item, fraction: (time - start) / span, lane },
          ],
          previous: time,
          lane,
        };
      },
      { placed: [], previous: Number.NEGATIVE_INFINITY, lane: 0 },
    ).placed;
}

/** Marks the row a light names, within the view the timeline belongs to. */
function highlightRow(source: HTMLElement, target: string): void {
  const scope = source.closest("[data-operator-view]") ?? document;
  for (const marked of scope.querySelectorAll("[data-timeline-active]"))
    marked.removeAttribute("data-timeline-active");
  const row = Array.from(scope.querySelectorAll("[data-row-id]")).find(
    (candidate) => candidate.getAttribute("data-row-id") === target,
  );
  if (!row) return;
  row.setAttribute("data-timeline-active", "");
  const still =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({
    block: "nearest",
    behavior: still ? "auto" : "smooth",
  });
}

export function TimelineBlock(props: {
  block: TimelineBlockData;
}): ReactElement {
  const [active, setActive] = useState<string | null>(null);
  const start = Date.parse(props.block.start);
  const span = Date.parse(props.block.end) - start;
  const events = place(props.block);
  const choose = (item: TimelineItem, event: MouseEvent<HTMLElement>): void => {
    setActive(item.id);
    if (item.target) highlightRow(event.currentTarget, item.target);
  };

  return (
    <section aria-label={props.block.label} {...stylex.props(s.root)}>
      <div {...stylex.props(s.head)}>
        <strong {...stylex.props(s.label)}>{props.block.label}</strong>
        <span {...stylex.props(s.count)}>
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div {...stylex.props(s.band)}>
        {Array.from({ length: TICKS }, (_, index) => {
          const fraction = index / TICKS;
          return (
            <div
              key={index}
              data-timeline-tick=""
              aria-hidden="true"
              {...stylex.props(s.tick)}
              style={{ left: inset(fraction) }}
            >
              <span {...stylex.props(s.tickLabel)}>
                {clock.format(new Date(start + span * fraction))}
              </span>
            </div>
          );
        })}
        <div aria-hidden="true" {...stylex.props(s.now)} />
        {events.map(({ item, fraction, lane }, index) => {
          const label = `${clock.format(new Date(item.at))} ${item.title}`;
          return (
            <button
              key={item.id}
              type="button"
              data-tone={item.tone ?? "neutral"}
              aria-label={label}
              title={label}
              aria-pressed={active === item.id}
              onClick={(event) => choose(item, event)}
              {...stylex.props(s.light, toneText(item.tone))}
              style={{ left: inset(fraction), top: LANE_TOPS[lane] }}
            >
              <span
                aria-hidden="true"
                {...stylex.props(
                  s.dot,
                  item.tone === "error" && s.failedDot,
                  active === item.id && s.activeDot,
                )}
                style={{ animationDelay: `${index * LIGHT_STAGGER_MS}ms` }}
              />
            </button>
          );
        })}
      </div>
      {props.block.legend && props.block.legend.length > 0 && (
        <ul {...stylex.props(s.legend)}>
          {props.block.legend.map((entry) => (
            <li
              key={entry.label}
              data-tone={entry.tone ?? "neutral"}
              {...stylex.props(s.legendItem)}
            >
              <span
                aria-hidden="true"
                {...stylex.props(s.legendMark, toneText(entry.tone))}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
