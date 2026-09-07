/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { layoutStyles as s } from "./operator-layout.styles";
import { OperatorMetadata } from "./operator-metadata";

export function OperatorCard(props: {
  label: string;
  metadata?: readonly string[] | undefined;
  tone?: "neutral" | "good" | "warn" | "error" | undefined;
  presentation?: "section" | "disclosure" | "feature" | undefined;
  density: "compact" | "comfortable";
  framed?: boolean | undefined;
  children: ReactNode;
}): ReactElement {
  const compact = props.density === "compact";
  const metadata = props.metadata?.length ? (
    <small {...stylex.props(s.headingMetadata)}>
      <OperatorMetadata values={props.metadata} />
    </small>
  ) : null;
  const root = stylex.props(
    s.card,
    compact && props.framed !== false && s.compactCard,
    !compact && props.presentation === "disclosure" && s.disclosure,
    props.presentation === "feature" && props.framed !== false && s.feature,
    props.tone === "warn" && s.warn,
    props.tone === "error" && s.error,
    compact && props.tone === "good" && s.good,
  );
  // Retain the structural hook for panel styles still being migrated, not card styling.
  const className = `declarative-card ${root.className ?? ""}`;
  const body = (
    <div
      {...stylex.props(
        s.body,
        compact && props.presentation === "disclosure" && s.disclosedBody,
      )}
    >
      {props.children}
    </div>
  );
  return props.presentation === "disclosure" ? (
    <details
      {...root}
      className={className}
      data-tone={props.tone ?? "neutral"}
    >
      <summary {...stylex.props(s.summary, !compact && s.comfortableSummary)}>
        {props.label}
        {metadata && <> {metadata}</>}
      </summary>
      {body}
    </details>
  ) : (
    <section
      {...root}
      className={className}
      data-tone={props.tone ?? "neutral"}
    >
      <header
        {...stylex.props(
          s.heading,
          compact && s.compactHeading,
          props.presentation === "feature" && s.featureHeading,
        )}
      >
        <h2 {...stylex.props(s.headingLabel)}>{props.label}</h2>
        {metadata}
      </header>
      {body}
    </section>
  );
}
