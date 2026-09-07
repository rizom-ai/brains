/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import { OperatorRecordCopy } from "@brains/operator-view-react";
import type { ReactElement, ReactNode } from "react";
import {
  accountClass as cx,
  accountStyles as s,
} from "../studio-account.styles";

export function AccountButton(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "danger";
  disabled?: boolean;
}): ReactElement {
  return (
    <Button
      variant={
        props.tone === "danger"
          ? "danger"
          : props.tone === "primary"
            ? "primary"
            : "outline"
      }
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </Button>
  );
}

export function AccountAccessItem(props: {
  kind: string;
  description?: string;
  metadata?: readonly string[];
  action?: ReactNode;
}): ReactElement {
  return (
    <div className={cx("account-access-item", s.access)}>
      <OperatorRecordCopy
        density="comfortable"
        title={props.kind}
        description={props.description}
        metadata={props.metadata ?? []}
      />
      {props.action}
    </div>
  );
}

export function AccountDetailSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className={cx("account-detail-section", s.section)}>
      <div className="account-section-label">
        <h3 className={cx("", s.heading)}>{props.title}</h3>
        {props.description ? (
          <p className={cx("", s.description)}>{props.description}</p>
        ) : null}
      </div>
      <div className={cx("people-stack", s.stack)}>{props.children}</div>
    </section>
  );
}
