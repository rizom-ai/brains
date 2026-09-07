/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { recordStyles as s } from "./operator-record.styles";
import { OperatorMetadata } from "./operator-metadata";

export function OperatorRecordDescription(props: {
  text: string;
  density: "compact" | "comfortable";
  clamp?: boolean | undefined;
  activity?: boolean | undefined;
  children?: ReactNode;
}): ReactElement {
  return (
    <>
      <p
        {...stylex.props(
          s.description,
          props.density === "compact" && s.compactDescription,
          props.activity && s.activityDescription,
          props.clamp && s.clamped,
        )}
      >
        {props.text}
      </p>
      {props.children}
    </>
  );
}

export function OperatorRecordCopy(props: {
  title: ReactNode;
  description?: ReactNode;
  metadata: readonly string[];
  density: "compact" | "comfortable";
  presentation?:
    "standard" | "editorial" | "attention" | "activity" | undefined;
  primary?: boolean | undefined;
  clamp?: boolean | undefined;
  children?: ReactNode;
}): ReactElement {
  const compact = props.density === "compact";
  return (
    <div {...stylex.props(s.copy)}>
      <strong
        {...stylex.props(
          s.title,
          compact && !props.presentation && s.compactTitle,
          props.presentation === "editorial" && s.editorial,
          props.presentation === "attention" && s.attention,
          props.presentation === "attention" &&
            props.primary &&
            s.primaryAttention,
          props.presentation === "activity" && s.activity,
          props.clamp && s.clamped,
        )}
      >
        {props.title}
      </strong>
      {typeof props.description === "string" ? (
        <OperatorRecordDescription
          text={props.description}
          density={compact && !props.presentation ? "compact" : "comfortable"}
          activity={props.presentation === "activity"}
          clamp={props.clamp}
        />
      ) : (
        props.description
      )}
      {props.metadata.length > 0 && (
        <small {...stylex.props(s.metadata, compact && s.compactMetadata)}>
          <OperatorMetadata
            values={props.metadata}
            stackDates={props.presentation === "activity"}
          />
        </small>
      )}
      {props.children}
    </div>
  );
}

type LinkProps = {
  children: ReactNode;
  stretch?: boolean | undefined;
  emphasis?: "normal" | "title" | "quiet" | undefined;
} & (
  | { href: string; external: boolean; onClick?: never }
  | { onClick: () => void; href?: never; external?: never }
);
export function OperatorTextLink(props: LinkProps): ReactElement {
  const compiled = stylex.props(
    s.link,
    props.stretch && s.stretchedLink,
    props.emphasis === "title" && s.titleLink,
    props.emphasis === "quiet" && s.quietLink,
  );
  const className = `declarative-inline-link operator-inline-link ${compiled.className ?? ""}`;
  return props.href !== undefined ? (
    <a
      {...compiled}
      className={className}
      href={props.href}
      {...(props.external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {props.children}
    </a>
  ) : (
    <button
      {...compiled}
      className={className}
      type="button"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
