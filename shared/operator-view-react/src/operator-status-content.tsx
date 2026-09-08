/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { statusContentStyles as s } from "./operator-status-content.styles";

type Tone = "neutral" | "good" | "warn" | "error";

export function OperatorStatusPill(
  props: ComponentProps<"span"> & {
    tone: Tone;
    presentation?: "outline" | "soft";
  },
): ReactElement {
  const { tone, presentation, ...attributes } = props;
  const css = stylex.props(
    s.pill,
    s[tone],
    presentation === "soft" && s.softPill,
    presentation === "soft" && tone === "good" && s.goodSoft,
  );
  return (
    <span
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/** A snapshot summary, not a live region or a measurement of uptime. */
export function OperatorStatusSummary(props: {
  title: string;
  description: string;
  status: string;
  tone: Tone;
}): ReactElement {
  return (
    <div
      {...stylex.props(s.lead, s[props.tone])}
      data-status-summary={props.tone}
    >
      <span
        {...stylex.props(s.orbit, props.tone === "good" && s.goodSoft)}
        aria-hidden="true"
      >
        <i {...stylex.props(s.orbitInner)} />
        <i {...stylex.props(s.orbitCore)} />
      </span>
      <div {...stylex.props(s.leadCopy)}>
        <strong {...stylex.props(s.leadTitle)}>{props.title}</strong>
        <p {...stylex.props(s.leadDescription)}>{props.description}</p>
      </div>
      <span {...stylex.props(s.leadStatus)}>
        <OperatorStatusPill tone={props.tone}>
          {props.status}
        </OperatorStatusPill>
      </span>
    </div>
  );
}

/** Binary readiness supplied by the host; deliberately not a percentage/progressbar. */
export function OperatorReadiness(props: {
  tone: "neutral" | "good";
  indicator: string;
  indicatorLabel: string;
  title: string;
  description: string;
  facts: readonly string[];
}): ReactElement {
  return (
    <div {...stylex.props(s.readiness)} data-readiness-tone={props.tone}>
      <div
        {...stylex.props(s.ring, props.tone === "good" && s.ringGood)}
        role="img"
        aria-label={props.indicatorLabel}
      >
        <span {...stylex.props(s.ringText, s[props.tone])}>
          {props.indicator}
        </span>
      </div>
      <div {...stylex.props(s.leadCopy)}>
        <strong {...stylex.props(s.readinessTitle)}>{props.title}</strong>
        <p {...stylex.props(s.readinessDescription)}>{props.description}</p>
        <div {...stylex.props(s.tags)}>
          {props.facts.map((fact, index) => (
            <span key={`${index}:${fact}`} {...stylex.props(s.tag)}>
              {fact}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OperatorSteps(props: {
  label: string;
  items: readonly { label: string; complete: boolean }[];
}): ReactElement {
  return (
    <ol {...stylex.props(s.steps)} aria-label={props.label}>
      {props.items.map((item, index) => (
        <li
          key={`${index}:${item.label}`}
          {...stylex.props(s.step, index === 0 && s.stepFirst)}
          data-complete={item.complete}
        >
          <span {...stylex.props(s.stepLabel, item.complete && s.stepDone)}>
            <i
              {...stylex.props(s.stepDot, item.complete && s.stepDotDone)}
              aria-hidden="true"
            />
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OperatorChecks(props: {
  label: string;
  headings: readonly [string, string, string];
  items: readonly {
    name: string;
    description: string;
    updated: ReactNode;
    status: string;
    tone: Tone;
  }[];
}): ReactElement {
  return (
    <table {...stylex.props(s.checks)} aria-label={props.label}>
      <thead {...stylex.props(s.checksHead)}>
        <tr {...stylex.props(s.checkRow, s.checkHeading)}>
          {props.headings.map((heading, index) => (
            <th key={index} scope="col" {...stylex.props(s.checkHeaderCell)}>
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody {...stylex.props(s.checkBody)}>
        {props.items.map((item, index) => (
          <tr
            key={`${index}:${item.name}`}
            {...stylex.props(s.checkRow)}
            data-tone={item.tone}
          >
            <th scope="row" {...stylex.props(s.checkCopy)}>
              <strong {...stylex.props(s.checkName)}>{item.name}</strong>
              <small {...stylex.props(s.checkDescription)}>
                {item.description}
              </small>
            </th>
            <td {...stylex.props(s.checkUpdated)}>{item.updated}</td>
            <td {...stylex.props(s.checkStatus)}>
              <OperatorStatusPill tone={item.tone} presentation="soft">
                {item.status}
              </OperatorStatusPill>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
