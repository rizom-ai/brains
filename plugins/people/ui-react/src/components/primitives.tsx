import type { ReactElement, ReactNode } from "react";

export function Button(props: {
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

export function TextAction(props: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}): ReactElement {
  return (
    <button
      className={`people-text-action${props.danger ? " people-text-action--danger" : ""}`}
      type="button"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function AccessItem(props: {
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

export function DetailSection(props: {
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
