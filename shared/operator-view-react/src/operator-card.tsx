/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { layoutStyles as s } from "./operator-layout.styles";
import { actionLayoutStyles } from "./operator-action-layout.styles";
import { toneText } from "@brains/app-ui-react";
import type { RuntimeStudioOperatorCardBlock } from "@brains/plugins";
import { OperatorMetadata } from "./operator-metadata";

export function OperatorCard(props: {
  label: string;
  metadata?: readonly string[] | undefined;
  /** Figures a closed disclosure shows beside its label. */
  summary?: RuntimeStudioOperatorCardBlock["summary"];
  tone?: "neutral" | "good" | "warn" | "error" | undefined;
  presentation?: "section" | "disclosure" | "feature" | undefined;
  density: "compact" | "comfortable";
  framed?: boolean | undefined;
  children: ReactNode;
  footer?: ReactNode;
  renderDisclosure?: ((content: ReactNode) => ReactNode) | undefined;
}): ReactElement {
  const compact = props.density === "compact";
  const attention =
    !compact && (props.tone === "warn" || props.tone === "error");
  const metadata = props.metadata?.length ? (
    <small
      {...stylex.props(
        s.headingMetadata,
        (attention || props.renderDisclosure) &&
          props.presentation === "disclosure" &&
          s.attentionMetadata,
      )}
    >
      <OperatorMetadata values={props.metadata} />
    </small>
  ) : null;
  const root = stylex.props(
    s.card,
    compact && props.framed !== false && s.compactCard,
    !compact &&
      props.presentation === "disclosure" &&
      !props.renderDisclosure &&
      s.disclosure,
    props.renderDisclosure && s.labeledDisclosure,
    props.presentation === "feature" && props.framed !== false && s.feature,
    props.tone === "warn" && s.warn,
    props.tone === "error" && s.error,
    compact && props.tone === "good" && s.good,
  );
  const body = (
    <div
      data-operator-card-body=""
      {...stylex.props(
        s.body,
        compact && props.presentation === "disclosure" && s.disclosedBody,
      )}
    >
      {props.children}
      {props.footer && (
        <div {...stylex.props(actionLayoutStyles.group)} data-card-controls="">
          {props.footer}
        </div>
      )}
    </div>
  );
  return props.presentation === "disclosure" && !props.renderDisclosure ? (
    <details {...root} data-card="" data-tone={props.tone ?? "neutral"}>
      <summary
        {...stylex.props(
          s.summary,
          !compact && s.comfortableSummary,
          Boolean(props.summary?.length) && s.figuresSummary,
          attention && s.attentionSummary,
        )}
      >
        {props.summary && props.summary.length > 0 && (
          <dl data-card-summary="" {...stylex.props(s.figures)}>
            {props.summary.map((figure, index) => (
              <div
                key={`${figure.label}:${index}`}
                data-tone={figure.tone ?? "neutral"}
                {...stylex.props(s.figure)}
              >
                <dt {...stylex.props(s.figureLabel)}>{figure.label}</dt>
                <dd {...stylex.props(s.figureValue, toneText(figure.tone))}>
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {props.label}
        {metadata && <> {metadata}</>}
      </summary>
      {body}
    </details>
  ) : (
    <section {...root} data-card="" data-tone={props.tone ?? "neutral"}>
      <header
        {...stylex.props(
          s.heading,
          compact && s.compactHeading,
          props.presentation === "feature" && s.featureHeading,
          props.renderDisclosure && s.disclosureHeading,
          props.renderDisclosure && attention && s.attentionSummary,
        )}
      >
        <h2 {...stylex.props(s.headingLabel)}>{props.label}</h2>
        {metadata}
      </header>
      {props.renderDisclosure ? props.renderDisclosure(body) : body}
    </section>
  );
}
