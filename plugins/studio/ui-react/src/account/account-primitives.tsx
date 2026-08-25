/** @jsxImportSource react */
import type { ReactElement, ReactNode } from "react";

export function AccountButton(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "danger";
  disabled?: boolean;
}): ReactElement {
  const className = [
    "people-button",
    props.tone ? `people-button--${props.tone}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={className}
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function AccountAccessItem(props: {
  kind: string;
  value: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="people-access-item">
      <div>
        <div className="people-access-kind">{props.kind}</div>
        <div className="people-access-value">{props.value}</div>
      </div>
      {props.action}
    </div>
  );
}

export function AccountDetailSection(props: {
  title: string;
  description: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="people-detail-section">
      <div className="people-section-label">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div className="people-stack">{props.children}</div>
    </section>
  );
}
